import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ADMIN, type Acceso } from './acceso';
import { ErrorAcceso } from '../errores';
import { NOMBRE_COOKIE_DISPOSITIVO, leerCookies } from './cookies';
import { buscarDispositivoAutorizado, type Dispositivo } from '../modulos/dispositivos';
import type { UsuarioPublico } from '../modulos/usuarios';
import type { sesion } from '../db/schema';

export type RutaApi = { metodo: string; url: string; acceso: Acceso };
type Sesion = typeof sesion.$inferSelect;

declare module 'fastify' {
  interface FastifyInstance {
    rutasApi: RutaApi[];
  }
  interface FastifyRequest {
    dispositivoActual: Dispositivo | null;
    usuarioActual: UsuarioPublico | null;
    sesionActual: Sesion | null;
  }
}

// La PC de caja habla con el servidor por la interfaz de bucle local. Fastify
// no confía en x-forwarded-for (trustProxy en false), así que req.ip es la
// dirección real del socket y nadie puede fingir ser local desde la red.
// Sin dirección conocida (req.ip vacío), se trata como remoto: ante la duda,
// cerrado.
const IPS_LOCALES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function esLocal(req: FastifyRequest): boolean {
  return IPS_LOCALES.has(req.ip);
}

export function exigirLocal(req: FastifyRequest) {
  if (!esLocal(req)) throw new ErrorAcceso(403, 'Esta operación solo se puede hacer desde la PC de caja', 'solo_local');
}

// El guardia único (spec sección 3). Se registra ANTES que cualquier ruta.
//  - onRoute: cada ruta bajo /api/ debe declarar config.acceso; si no, el
//    arranque falla. Así una ruta nueva nunca nace abierta por olvido.
//  - onRequest: capa 1 (dispositivo). Las capas 2 y 3 se añaden en Task 4.
export function registrarGuardia(app: FastifyInstance) {
  app.decorate('rutasApi', []);
  app.decorateRequest('dispositivoActual', null);
  app.decorateRequest('usuarioActual', null);
  app.decorateRequest('sesionActual', null);

  app.addHook('onRoute', (ruta) => {
    if (!ruta.url.startsWith('/api/')) return;
    const metodos = Array.isArray(ruta.method) ? ruta.method : [ruta.method];
    const acceso = ruta.config?.acceso;
    if (!acceso) throw new Error(`La ruta ${metodos.join(',')} ${ruta.url} no declara acceso (config.acceso). Toda ruta bajo /api/ debe declararlo.`);
    for (const metodo of metodos) app.rutasApi.push({ metodo, url: ruta.url, acceso });
  });

  app.addHook('onRequest', async (req) => {
    const ruta = req.url.split('?')[0];
    if (!ruta.startsWith('/api/')) return;
    // Una URL que no corresponde a ninguna ruta (404) no tiene declaración:
    // se trata como la más restrictiva, así el 404 no revela nada a un
    // aparato sin autorizar.
    const acceso: Acceso = req.routeOptions?.config?.acceso ?? ADMIN;

    // Capa 1: ¿el dispositivo está autorizado? La PC de caja se la salta.
    if (!esLocal(req)) {
      const token = leerCookies(req.headers.cookie)[NOMBRE_COOKIE_DISPOSITIVO];
      req.dispositivoActual = token ? await buscarDispositivoAutorizado(app.db, token) : null;
      if (acceso.dispositivo && !req.dispositivoActual) {
        throw new ErrorAcceso(403, 'Este dispositivo no está autorizado', 'dispositivo_no_autorizado');
      }
    }
  });
}
