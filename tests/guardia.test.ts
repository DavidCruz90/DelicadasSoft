import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { test, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyRequest, InjectOptions } from 'fastify';
import { crearAppDePrueba } from './ayuda/app';
import { IP_REMOTA, autorizarDispositivoDePrueba } from './ayuda/acceso';
import { crearApp } from '../src/servidor/app';
import { accesoExigido } from '../src/servidor/seguridad/guardia';
import { ADMIN, SOLO_DISPOSITIVO } from '../src/servidor/seguridad/acceso';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

// Lista blanca de la spec, sección 3.1, escrita aquí a propósito: si alguien
// exime una ruta nueva en el código, esta prueba lo detecta.
const EXENTAS_DE_DISPOSITIVO = new Set([
  'GET /api/instalacion', 'POST /api/instalacion',
  'POST /api/dispositivos/solicitar', 'GET /api/dispositivos/estado',
]);

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
  const rutas = ctx.app.rutasApi.filter((r) => r.metodo !== 'HEAD');
  expect(rutas.length).toBeGreaterThan(0);
  for (const r of rutas) {
    const clave = `${r.metodo} ${r.url}`;
    if (EXENTAS_DE_DISPOSITIVO.has(clave)) {
      expect(r.acceso.dispositivo, clave).toBe(false);
      continue;
    }
    expect(r.acceso.dispositivo, `${clave} debería exigir dispositivo`).toBe(true);
    const url = r.url.replace(/:[a-zA-Z]+/g, '00000000-0000-0000-0000-000000000000');
    const res = await ctx.app.inject({ method: r.metodo as 'GET', url, remoteAddress: IP_REMOTA });
    expect(res.statusCode, clave).toBe(403);
    expect(res.json().codigo, clave).toBe('dispositivo_no_autorizado');
  }
});

test('una ruta que no existe bajo /api también exige dispositivo (403 antes que 404)', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/no-existe', remoteAddress: IP_REMOTA });
  expect(r.statusCode).toBe(403);
  expect(r.json().codigo).toBe('dispositivo_no_autorizado');
  // Con un aparato autorizado, la ruta inexistente responde el 404 normal.
  const { cookie } = await autorizarDispositivoDePrueba(ctx.db, 'Celular del barrido');
  const con = await ctx.app.inject({ method: 'GET', url: '/api/no-existe', remoteAddress: IP_REMOTA, headers: { cookie } });
  expect(con.statusCode).toBe(404);
});

test('las páginas y los archivos fuera de /api no pasan por la capa 1', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/no-es-api', remoteAddress: IP_REMOTA });
  expect(r.statusCode).toBe(404);
  expect(r.json().codigo).toBeUndefined();
});

// ---- Evasión por la forma en que se escribe la URL (hallazgo C1 de la
// revisión). El router decodifica %61 → a y quita esquema y autoridad de
// una petición en forma absoluta antes de elegir la ruta; el guardia tiene
// que decidir por la ruta elegida, nunca por el texto crudo de req.url.

const UUID = '00000000-0000-0000-0000-000000000000';

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
    const opciones: InjectOptions = { method: c.method, url: c.url, remoteAddress: IP_REMOTA };
    if (c.payload !== undefined) opciones.payload = c.payload as InjectOptions['payload'];
    const r = await ctx.app.inject(opciones);
    expect(r.statusCode, `${c.method} ${c.url}`).toBe(403);
    if (c.method !== 'HEAD') expect(r.json().codigo, `${c.method} ${c.url}`).toBe('dispositivo_no_autorizado');
  }
});

test('la cadena de autoautorización desde la red (solicitar y luego autorizar por /%61pi) queda cerrada', async () => {
  const s = await ctx.app.inject({ method: 'POST', url: '/api/dispositivos/solicitar', remoteAddress: IP_REMOTA });
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
    const r = await ctx.app.inject({ method: 'GET', url, remoteAddress: IP_REMOTA });
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

// Forma absoluta por un socket real: app.inject la normaliza, así que se
// levanta la app en la IP de red de esta máquina (una conexión a esa IP no
// es local y el guardia aplica la capa 1). Sin interfaz de red, la prueba
// se salta y lo dice; la de accesoExigido cubre la lógica igual.
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

test('una petición en forma absoluta (GET http://x/api/estado) desde la red responde 403', async (t) => {
  const ip = ipDeRed();
  if (!ip) { t.skip(); return; }
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
