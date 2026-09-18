import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { test, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyRequest, InjectOptions } from 'fastify';
import { crearAppDePrueba } from './ayuda/app';
import { IP_REMOTA, abrirSesionDePrueba, autorizarDispositivoDePrueba, crearUsuarioDePrueba } from './ayuda/acceso';
import { crearApp } from '../src/servidor/app';
import { accesoExigido, esLocal } from '../src/servidor/seguridad/guardia';
import { ADMIN, SOLO_DISPOSITIVO } from '../src/servidor/seguridad/acceso';
import { ROLES, type Rol } from '../src/compartido/roles';

// Ni el hash ni un campo "pin" en ninguna respuesta (regla 24). tiene_pin y
// propina_sugerida_pct contienen "pin" y son legítimos: se mira la forma.
function sinDatosDelPin(cuerpo: string, contexto = '') {
  expect(cuerpo, contexto).not.toContain('pin_hash');
  expect(cuerpo, contexto).not.toMatch(/"pin"\s*:/);
}

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
let aparato: Awaited<ReturnType<typeof autorizarDispositivoDePrueba>>;
const usuarios = {} as Record<Rol, Awaited<ReturnType<typeof crearUsuarioDePrueba>>>;

beforeAll(async () => {
  ctx = await crearAppDePrueba();
  aparato = await autorizarDispositivoDePrueba(ctx.db, 'Aparato del barrido');
  for (const rol of ROLES) usuarios[rol] = await crearUsuarioDePrueba(ctx.db, `Barrido ${rol}`, rol);
});
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

// Lista blanca de la spec, sección 3.1, escrita aquí a propósito y no
// importada del código: si alguien exime una ruta nueva en el código sin
// añadirla aquí, esta prueba falla. Al añadir una ruta aquí hay que citar la
// sección de la spec que la exime.
const EXENTAS_DE_DISPOSITIVO = new Set([
  'GET /api/instalacion', 'POST /api/instalacion',
  'POST /api/dispositivos/solicitar', 'GET /api/dispositivos/estado',
]);
const EXENTAS_DE_SESION = new Set([
  ...EXENTAS_DE_DISPOSITIVO,
  'GET /api/sesion/usuarios', 'POST /api/sesion',
  'GET /api/estado', 'GET /api/catalogo',
  'GET /api/eventos',
  // Plan 3, cocina (spec 3.1): 'GET /api/cocina/rondas', 'POST /api/rondas/:id/lista'. Se añaden cuando existan.
]);

const UUID = '00000000-0000-0000-0000-000000000000';
const conUuid = (url: string) => url.replace(/:[a-zA-Z_]+/g, UUID);
// La misma dirección con la "a" de api codificada: el router la decodifica y
// ejecuta el mismo manejador, así que el guardia tiene que tratarla igual.
const disfrazada = (url: string) => url.replace(/^\/api\//, '/%61pi/');
const rutasSinHead = () => ctx.app.rutasApi.filter((r) => r.metodo !== 'HEAD');

test('toda ruta bajo /api queda registrada con su acceso y no hay HEAD sin declarar', () => {
  const rutas = ctx.app.rutasApi;
  expect(rutas.length).toBeGreaterThan(10);
  for (const r of rutas) expect(r.acceso, `${r.metodo} ${r.url}`).toBeDefined();
  expect(rutas.some((r) => r.url === '/api/estado' && r.metodo === 'GET')).toBe(true);
});

test('registrar una ruta bajo /api sin declarar acceso falla al arrancar', async () => {
  const appPrueba = await crearApp({ db: ctx.db });
  expect(() => appPrueba.get('/api/prueba/sin-acceso', async () => ({}))).toThrow('no declara acceso');
  // Fuera de /api no hace falta declarar nada.
  expect(() => appPrueba.get('/prueba-libre', async () => ({}))).not.toThrow();
  await appPrueba.close();
});

test('barrido capa 1: ninguna ruta bajo /api responde a un aparato sin autorizar, salvo la lista blanca de la spec 3.1', async () => {
  const rutas = rutasSinHead();
  expect(rutas.length).toBeGreaterThan(10);
  for (const r of rutas) {
    const clave = `${r.metodo} ${r.url}`;
    if (EXENTAS_DE_DISPOSITIVO.has(clave)) {
      expect(r.acceso.dispositivo, clave).toBe(false);
      continue;
    }
    expect(r.acceso.dispositivo, `${clave} debería exigir dispositivo`).toBe(true);
    for (const url of [conUuid(r.url), disfrazada(conUuid(r.url))]) {
      const res = await ctx.app.inject({ method: r.metodo as 'GET', url, remoteAddress: IP_REMOTA, headers: { cookie: '' } });
      expect(res.statusCode, `${r.metodo} ${url}`).toBe(403);
      expect(res.json().codigo, `${r.metodo} ${url}`).toBe('dispositivo_no_autorizado');
    }
  }
});

test('barrido capa 2: ninguna ruta bajo /api responde con aparato autorizado pero sin sesión, salvo la lista blanca 3.1; tampoco con la dirección disfrazada', async () => {
  let comprobadas = 0;
  for (const r of rutasSinHead()) {
    const clave = `${r.metodo} ${r.url}`;
    if (EXENTAS_DE_SESION.has(clave)) {
      expect(r.acceso.sesion, clave).toBe(false);
      continue;
    }
    expect(r.acceso.sesion, `${clave} debería exigir sesión`).toBe(true);
    for (const url of [conUuid(r.url), disfrazada(conUuid(r.url))]) {
      const res = await ctx.app.inject({ method: r.metodo as 'GET', url, remoteAddress: IP_REMOTA, headers: { cookie: aparato.cookie } });
      expect(res.statusCode, `${r.metodo} ${url}`).toBe(401);
      expect(res.json().codigo, `${r.metodo} ${url}`).toBe('sin_sesion');
      comprobadas++;
    }
  }
  expect(comprobadas).toBeGreaterThan(10);
});

test('barrido capa 3: cada rol contra cada ruta con roles; lo que no le toca responde 403 sin ejecutar nada (también disfrazada), lo que le toca no responde 401 ni 403; ninguna respuesta lleva pin', async () => {
  const conRoles = rutasSinHead().filter((r) => r.acceso.sesion);
  expect(conRoles.length).toBeGreaterThan(5);
  let permitidas = 0;
  let negadas = 0;
  for (const r of conRoles) {
    if (!r.acceso.sesion) continue;
    const clave = `${r.metodo} ${r.url}`;
    for (const rol of ROLES) {
      const permitido = r.acceso.roles.includes(rol);
      for (const url of permitido ? [conUuid(r.url)] : [conUuid(r.url), disfrazada(conUuid(r.url))]) {
        // Sesión nueva por petición: DELETE /api/sesion cierra la que usa.
        const cookieSesion = await abrirSesionDePrueba(ctx.db, usuarios[rol], aparato.dispositivo.id);
        const res = await ctx.app.inject({ method: r.metodo as 'GET', url, remoteAddress: IP_REMOTA, headers: { cookie: `${aparato.cookie}; ${cookieSesion}` } });
        sinDatosDelPin(res.body, `${r.metodo} ${url} como ${rol}`);
        if (permitido) {
          expect([401, 403], `${clave} como ${rol} debería pasar el guardia (respondió ${res.statusCode})`).not.toContain(res.statusCode);
          expect(res.statusCode, `${clave} como ${rol} no debería ser un error del servidor`).toBeLessThan(500);
          permitidas++;
        } else {
          expect(res.statusCode, `${r.metodo} ${url} como ${rol} debería ser 403`).toBe(403);
          expect(res.json(), `${r.metodo} ${url} como ${rol}`).toEqual({ error: 'No tienes permiso para esta pantalla', codigo: 'sin_permiso' });
          negadas++;
        }
      }
    }
  }
  expect(permitidas).toBeGreaterThan(5);
  expect(negadas).toBeGreaterThan(5);
});

test('un mesero contra una ruta de admin escrita como /%61pi/admin/usuarios recibe 403 sin_permiso y sin datos', async () => {
  const cookieSesion = await abrirSesionDePrueba(ctx.db, usuarios.mesero, aparato.dispositivo.id);
  const r = await ctx.app.inject({ method: 'GET', url: '/%61pi/admin/usuarios', remoteAddress: IP_REMOTA, headers: { cookie: `${aparato.cookie}; ${cookieSesion}` } });
  expect(r.statusCode).toBe(403);
  expect(r.json()).toEqual({ error: 'No tienes permiso para esta pantalla', codigo: 'sin_permiso' });
  expect(r.body).not.toContain('Barrido');
});

test('las rutas bajo /api/admin/ son solo de admin', () => {
  const admin = rutasSinHead().filter((x) => x.url.startsWith('/api/admin/'));
  expect(admin.length).toBeGreaterThan(5);
  for (const r of admin) {
    expect(r.acceso.sesion && r.acceso.roles, `${r.metodo} ${r.url}`).toEqual(['admin']);
  }
});

test('una ruta que no existe bajo /api exige dispositivo y sesión (403, luego 401, y recién con sesión el 404)', async () => {
  for (const url of ['/api/no-existe', '/%61pi/no-existe']) {
    const sinAparato = await ctx.app.inject({ method: 'GET', url, remoteAddress: IP_REMOTA, headers: { cookie: '' } });
    expect(sinAparato.statusCode, url).toBe(403);
    expect(sinAparato.json().codigo, url).toBe('dispositivo_no_autorizado');
    const sinSesion = await ctx.app.inject({ method: 'GET', url, remoteAddress: IP_REMOTA, headers: { cookie: aparato.cookie } });
    expect(sinSesion.statusCode, url).toBe(401);
    expect(sinSesion.json().codigo, url).toBe('sin_sesion');
    // Un mesero no ve el 404: lo inexistente se trata como lo más restrictivo (admin).
    const cookieMesero = await abrirSesionDePrueba(ctx.db, usuarios.mesero, aparato.dispositivo.id);
    const mesero = await ctx.app.inject({ method: 'GET', url, remoteAddress: IP_REMOTA, headers: { cookie: `${aparato.cookie}; ${cookieMesero}` } });
    expect(mesero.statusCode, url).toBe(403);
    expect(mesero.json().codigo, url).toBe('sin_permiso');
  }
  // El admin de prueba desde la PC de caja sí recibe el 404 normal.
  expect((await ctx.app.inject({ method: 'GET', url: '/api/no-existe' })).statusCode).toBe(404);
});

test('las páginas y los archivos fuera de /api no pasan por la capa 1', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/no-es-api', remoteAddress: IP_REMOTA, headers: { cookie: '' } });
  expect(r.statusCode).toBe(404);
  expect(r.json().codigo).toBeUndefined();
});

// ---- Evasión por la forma en que se escribe la URL (hallazgo C1 de la
// revisión). El router decodifica %61 → a y quita esquema y autoridad de
// una petición en forma absoluta antes de elegir la ruta; el guardia tiene
// que decidir por la ruta elegida, nunca por el texto crudo de req.url.

test('un aparato sin autorizar no evade la capa 1 escribiendo /api con codificación por ciento', async () => {
  const casos: { method: 'GET' | 'HEAD' | 'POST'; url: string; payload?: unknown }[] = [
    { method: 'GET', url: '/%61pi/estado' },
    { method: 'GET', url: '/ap%69/estado' },
    { method: 'GET', url: '/%61%70%69/estado' },
    { method: 'GET', url: '/%61pi/admin/usuarios' },
    { method: 'GET', url: '/%61pi/admin/configuracion' },
    { method: 'HEAD', url: '/%61pi/catalogo' },
    { method: 'POST', url: `/%61pi/admin/dispositivos/${UUID}/autorizar`, payload: { nombre: 'Atacante' } },
  ];
  for (const c of casos) {
    const opciones: InjectOptions = { method: c.method, url: c.url, remoteAddress: IP_REMOTA, headers: { cookie: '' } };
    if (c.payload !== undefined) opciones.payload = c.payload as InjectOptions['payload'];
    const r = await ctx.app.inject(opciones);
    expect(r.statusCode, `${c.method} ${c.url}`).toBe(403);
    if (c.method !== 'HEAD') expect(r.json().codigo, `${c.method} ${c.url}`).toBe('dispositivo_no_autorizado');
  }
});

test('la cadena de autoautorización desde la red (solicitar y luego autorizar por /%61pi) queda cerrada', async () => {
  const s = await ctx.app.inject({ method: 'POST', url: '/api/dispositivos/solicitar', remoteAddress: IP_REMOTA, headers: { cookie: '' } });
  expect(s.statusCode).toBe(201);
  const id = s.json().espera_id;
  const cookie = (s.headers['set-cookie'] as string).split(';')[0];
  const ataque = await ctx.app.inject({ method: 'POST', url: `/%61pi/admin/dispositivos/${id}/autorizar`, remoteAddress: IP_REMOTA, headers: { cookie }, payload: { nombre: 'Atacante' } });
  expect(ataque.statusCode).toBe(403);
  const [fila] = await ctx.sql`SELECT estado FROM dispositivo WHERE id = ${id}`;
  expect(fila.estado).toBe('pendiente');
  const despues = await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: IP_REMOTA, headers: { cookie } });
  expect(despues.statusCode).toBe(403);
});

test('una URL bajo /api que no existe sigue en 403 aunque se escriba codificada o en forma absoluta', async () => {
  for (const url of ['/%61pi/no-existe', '/api/%6eo-existe']) {
    const r = await ctx.app.inject({ method: 'GET', url, remoteAddress: IP_REMOTA, headers: { cookie: '' } });
    expect(r.statusCode, url).toBe(403);
    expect(r.json().codigo, url).toBe('dispositivo_no_autorizado');
  }
});

// La decisión del guardia aislada: recibe la petición tal como Fastify la
// arma (req.url crudo y la declaración de la ruta que el router eligió) y
// devuelve el acceso que exige, o null si la petición no es de la API. Con
// el defecto (mirar solo req.url) devolvía null para las tres primeras.
function peticion(url: string, acceso?: typeof ADMIN): FastifyRequest {
  return { url, routeOptions: { config: acceso ? { acceso } : {} } } as unknown as FastifyRequest;
}

test('accesoExigido decide por la declaración de la ruta elegida, no por el texto de req.url', () => {
  expect(accesoExigido(peticion('http://x/api/estado', SOLO_DISPOSITIVO))).toBe(SOLO_DISPOSITIVO);
  expect(accesoExigido(peticion('HTTPS://x:8080/api/admin/usuarios', ADMIN))).toBe(ADMIN);
  expect(accesoExigido(peticion('/%61pi/estado', SOLO_DISPOSITIVO))).toBe(SOLO_DISPOSITIVO);
  expect(accesoExigido(peticion('/api/estado?x=1', SOLO_DISPOSITIVO))).toBe(SOLO_DISPOSITIVO);
  // Sin ruta (404): lo que parezca API tras normalizar como el router se trata como ADMIN.
  expect(accesoExigido(peticion('/api/no-existe'))).toBe(ADMIN);
  expect(accesoExigido(peticion('/%61pi/no-existe'))).toBe(ADMIN);
  expect(accesoExigido(peticion('http://x/api/no-existe'))).toBe(ADMIN);
  expect(accesoExigido(peticion('/api/%ZZ'))).toBe(ADMIN); // codificación rota: cerrado
  // Fuera de la API no hay nada que exigir.
  expect(accesoExigido(peticion('/no-es-api'))).toBeNull();
  expect(accesoExigido(peticion('/admin'))).toBeNull();
  expect(accesoExigido(peticion('/fotos/x.jpg'))).toBeNull();
});

// "PC de caja" = IP de bucle local Y cabecera Host local (spec 5.2.6, regla
// 31, revisión de la Task 5). Solo con la IP, una página maliciosa abierta en
// el navegador de la PC de caja con un dominio que apunte a 127.0.0.1
// (rebinding de DNS) llegaba con IP local y su propio nombre en Host, y se
// hacía pasar por la PC de caja. app.inject manda Host localhost:80 por
// omisión (light-my-request, parse-url.js), así que las pruebas existentes
// siguen siendo locales; el caso "sin Host" solo se puede armar a mano.
function desdeIp(ip: string, host?: string): FastifyRequest {
  return { ip, headers: host === undefined ? {} : { host } } as unknown as FastifyRequest;
}

test('esLocal exige IP de bucle local y Host local exacto, con o sin puerto numérico, sin distinguir mayúsculas', () => {
  for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    for (const host of ['localhost', 'localhost:3000', 'LOCALHOST:3000', '127.0.0.1', '127.0.0.1:3000', '[::1]', '[::1]:3000', '[::1]:80']) {
      expect(esLocal(desdeIp(ip, host)), `${ip} con Host ${host}`).toBe(true);
    }
  }
  const ajenos = [
    'evil.com', 'evil.com:3000', 'localhost.evil.com', '127.0.0.1.evil.com', 'evil.com#@localhost',
    'localhost:3000@evil.com', 'localhost@evil.com', '127.0.0.2', '0.0.0.0', '[::2]', '[::1]x', '[::1]:',
    'localhost:', 'localhost:abc', 'localhost:3000:4000', ' ', '',
  ];
  for (const host of ajenos) expect(esLocal(desdeIp('127.0.0.1', host)), `Host "${host}"`).toBe(false);
  expect(esLocal(desdeIp('127.0.0.1')), 'sin cabecera Host').toBe(false);
  // Y con Host local pero IP de la red tampoco: las dos cosas a la vez.
  expect(esLocal(desdeIp(IP_REMOTA, 'localhost:3000'))).toBe(false);
});

test('desde 127.0.0.1 con Host ajeno (rebinding de DNS) no es la PC de caja: instalación 403 solo_local, capa 1 exigida y la sesión local no vale', async () => {
  const hostAjeno = 'evil.com:3000';
  const instalar = await ctx.app.inject({ method: 'POST', url: '/api/instalacion', headers: { host: hostAjeno, cookie: '' }, payload: { nombre: 'Intruso', pin: '1234' } });
  expect(instalar.statusCode).toBe(403);
  expect(instalar.json().codigo).toBe('solo_local');
  const estado = await ctx.app.inject({ method: 'GET', url: '/api/estado', headers: { host: hostAjeno, cookie: '' } });
  expect(estado.statusCode).toBe(403);
  expect(estado.json().codigo).toBe('dispositivo_no_autorizado');
  // La sesión del admin de prueba nació en la PC de caja (dispositivo nulo):
  // con Host ajeno, aunque la capa 1 pase por un aparato autorizado, la sesión
  // ya no está atada a "aquí" y responde 401.
  const conSesion = await ctx.app.inject({ method: 'GET', url: '/api/sesion', headers: { host: hostAjeno, cookie: `${aparato.cookie}; ${ctx.cookieAdmin}` } });
  expect(conSesion.statusCode).toBe(401);
  expect(conSesion.json().codigo).toBe('sin_sesion');
  // Con Host local, las mismas peticiones son de la PC de caja.
  for (const host of ['localhost', 'localhost:3000', '127.0.0.1:3000', '[::1]:3000', 'LOCALHOST:3000']) {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/estado', headers: { host, cookie: '' } })).statusCode, host).toBe(200);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', headers: { host } })).statusCode, host).toBe(200);
  }
  for (const host of ['localhost.evil.com', '127.0.0.1.evil.com', 'localhost:3000@evil.com', '127.0.0.2', '0.0.0.0', 'localhost:']) {
    const r = await ctx.app.inject({ method: 'GET', url: '/api/estado', headers: { host, cookie: '' } });
    expect(r.statusCode, host).toBe(403);
    expect(r.json().codigo, host).toBe('dispositivo_no_autorizado');
  }
});

// Forma absoluta por un socket real: app.inject la normaliza, así que se
// levanta la app en la IP de red de esta máquina (una conexión a esa IP no
// es local y el guardia aplica la capa 1). Sin interfaz de red la prueba
// FALLA con un mensaje claro: una prueba de seguridad no puede pasar
// saltándose.
function ipDeRed(): string | undefined {
  for (const lista of Object.values(networkInterfaces())) {
    for (const i of lista ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return undefined;
}

function pedir(host: string, port: number, path: string) {
  return new Promise<{ status: number; cuerpo: string }>((resolve, reject) => {
    const req = http.request({ host, port, path, method: 'GET' }, (res) => {
      let cuerpo = '';
      res.on('data', (c) => { cuerpo += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, cuerpo }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('una petición en forma absoluta (GET http://x/api/estado) desde la red responde 403', async () => {
  const ip = ipDeRed();
  expect(ip, 'esta prueba necesita una interfaz de red con IPv4').toBeDefined();
  if (!ip) return; // inalcanzable: el expect de arriba ya falló
  const appTemp = await crearApp({ db: ctx.db });
  await appTemp.listen({ port: 0, host: ip });
  const direccion = appTemp.server.address();
  const port = typeof direccion === 'object' && direccion ? direccion.port : 0;
  try {
    for (const path of ['http://x/api/estado', 'HTTP://x:9/api/admin/configuracion', 'https://x/%61pi/catalogo', '/%61pi/estado']) {
      const r = await pedir(ip, port, path);
      expect(r.status, path).toBe(403);
      expect(JSON.parse(r.cuerpo).codigo, path).toBe('dispositivo_no_autorizado');
    }
    // Y la ruta normal desde esa misma IP también es remota: sin cookie, 403.
    expect((await pedir(ip, port, '/api/estado')).status).toBe(403);
  } finally {
    await appTemp.close();
  }
});
