import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';
import { IP_REMOTA, autorizarDispositivoDePrueba } from './ayuda/acceso';
import { crearApp } from '../src/servidor/app';

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
