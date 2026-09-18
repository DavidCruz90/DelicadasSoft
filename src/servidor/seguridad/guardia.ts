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

// Normaliza el texto crudo de la URL como lo hace el router (find-my-way)
// antes de elegir la ruta: quita esquema y autoridad de una petición en
// forma absoluta (GET http://x/api/estado), quita la query y decodifica el
// porcentaje (%61 → a). Solo sirve para las peticiones que NO encontraron
// ruta; una codificación rota se trata como API (ante la duda, cerrado).
function pareceApi(url: string): boolean {
  let ruta = url.split('?')[0].replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  try {
    ruta = decodeURIComponent(ruta);
  } catch {
    return true;
  }
  return ruta.startsWith('/api/');
}

// Qué acceso exige esta petición, o null si no es de la API. Decide por la
// declaración de la ruta que el router eligió, nunca por el texto de req.url:
// el router decodifica y normaliza la URL antes de elegir la ruta, así que
// /%61pi/estado o http://x/api/estado ejecutan el manejador de /api/estado
// aunque req.url no empiece por /api/ (hallazgo C1 de la revisión de la
// Task 3). El texto crudo solo decide cuando no hay ruta (404 bajo /api/),
// que se trata como lo más restrictivo para no revelar nada.
export function accesoExigido(req: FastifyRequest): Acceso | null {
  const declarado = req.routeOptions?.config?.acceso;
  if (declarado) return declarado;
  return pareceApi(req.url) ? ADMIN : null;
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
    const acceso = accesoExigido(req);
    if (!acceso) return;

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
