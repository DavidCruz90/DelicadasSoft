import { test, expect, beforeAll, afterAll } from 'vitest';
import { prepararBaseDePrueba } from './ayuda/db';
import { crearApp } from '../src/servidor/app';
import { IP_REMOTA } from './ayuda/acceso';

// No usa crearAppDePrueba porque esa crea un admin; aquí hace falta una base
// sin ningún admin activo, que es el estado de "sin instalar" (spec 5.1).
let ctx: { app: Awaited<ReturnType<typeof crearApp>>; db: Awaited<ReturnType<typeof prepararBaseDePrueba>>['db']; sql: Awaited<ReturnType<typeof prepararBaseDePrueba>>['sql'] };
beforeAll(async () => {
  const { db, sql } = await prepararBaseDePrueba();
  const app = await crearApp({ db });
  await app.ready();
  ctx = { app, db, sql };
});
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

const instalar = (payload: unknown, extra: Record<string, unknown> = {}) =>
  ctx.app.inject({ method: 'POST', url: '/api/instalacion', payload: payload as any, ...extra } as any);

// Ni el hash ni un campo "pin" ni el token de sesión en el cuerpo (regla 24 y
// spec sección 7: el token viaja solo en la cookie HttpOnly). tiene_pin
// contiene "pin" y es legítimo: se mira la forma.
function sinSecretos(cuerpo: unknown) {
  const texto = JSON.stringify(cuerpo);
  expect(texto).not.toContain('pin_hash');
  expect(texto).not.toMatch(/"pin"\s*:/);
  expect(texto).not.toMatch(/"token"\s*:/);
  expect(texto).not.toMatch(/[0-9a-f]{64}/);
}

test('sin admin activo, GET dice instalado: false desde la PC de caja y 403 solo_local desde la red', async () => {
  const local = await ctx.app.inject({ method: 'GET', url: '/api/instalacion' });
  expect(local.statusCode).toBe(200);
  expect(local.json()).toEqual({ instalado: false });
  const remoto = await ctx.app.inject({ method: 'GET', url: '/api/instalacion', remoteAddress: IP_REMOTA });
  expect(remoto.statusCode).toBe(403);
  expect(remoto.json().codigo).toBe('solo_local');
  const fingido = await ctx.app.inject({ method: 'GET', url: '/api/instalacion', remoteAddress: IP_REMOTA, headers: { 'x-forwarded-for': '127.0.0.1' } });
  expect(fingido.statusCode).toBe(403);
  expect(fingido.json().codigo).toBe('solo_local');
});

test('POST desde la red responde 403 sin crear nada: directo, con x-forwarded-for fingido, con la dirección codificada y en forma absoluta', async () => {
  const variantes: Array<{ url: string; headers?: Record<string, string> }> = [
    { url: '/api/instalacion' },
    { url: '/api/instalacion', headers: { 'x-forwarded-for': '127.0.0.1' } },
    { url: '/api/instalacion', headers: { 'x-real-ip': '127.0.0.1', forwarded: 'for=127.0.0.1' } },
    { url: '/%61pi/instalacion' },
    { url: 'http://x/api/instalacion' },
    { url: 'http://127.0.0.1/%61pi/instalacion' },
  ];
  for (const v of variantes) {
    const r = await instalar({ nombre: 'Intruso', pin: '1234' }, { remoteAddress: IP_REMOTA, url: v.url, headers: v.headers });
    expect(r.statusCode, v.url).toBe(403);
    expect(r.json().codigo, v.url).toBe('solo_local');
  }
  expect(await ctx.sql`SELECT id FROM usuario`).toHaveLength(0);
  expect(await ctx.sql`SELECT id FROM sesion`).toHaveLength(0);
});

test('POST valida tipos antes que nada: sin cuerpo, cuerpo que no es objeto, nombre o pin con tipo equivocado', async () => {
  expect((await ctx.app.inject({ method: 'POST', url: '/api/instalacion' })).statusCode).toBe(400);
  expect((await ctx.app.inject({ method: 'POST', url: '/api/instalacion', headers: { 'content-type': 'application/json' }, payload: '"texto"' })).statusCode).toBe(400);
  expect((await ctx.app.inject({ method: 'POST', url: '/api/instalacion', headers: { 'content-type': 'application/json' }, payload: '[]' })).statusCode).toBe(400);
  expect((await instalar({ nombre: 7, pin: '1234' })).statusCode).toBe(400);
  expect((await instalar({ pin: '1234' })).statusCode).toBe(400);
  expect((await instalar({ nombre: 'Dave', pin: 1234 })).statusCode).toBe(400);
  expect((await instalar({ nombre: 'Dave' })).statusCode).toBe(400);
  expect((await instalar({ nombre: 'Dave', pin: '12' })).statusCode).toBe(400);
  expect((await instalar({ nombre: 'Dave', pin: '12345' })).statusCode).toBe(400);
  expect((await instalar({ nombre: 'Dave', pin: '12a4' })).statusCode).toBe(400);
  expect((await instalar({ nombre: '  ', pin: '1234' })).statusCode).toBe(400);
  expect(await ctx.sql`SELECT id FROM usuario`).toHaveLength(0);
  expect(await ctx.sql`SELECT id FROM sesion`).toHaveLength(0);
});

test('carrera determinista: dos instalaciones a la vez crean un solo admin', async () => {
  // Una transacción externa toma el mismo bloqueo consultivo que usa instalar();
  // se lanza el POST sin esperarlo (queda esperando el bloqueo); dentro de la
  // transacción externa se crea un admin; se confirma. El POST retoma, ve el
  // admin y responde 409. Sin el bloqueo, el POST leería "no hay admin" de
  // inmediato y crearía un segundo: esta prueba debe fallar con ese código.
  let postPromise: Promise<{ statusCode: number; json: () => any }> | null = null;
  await ctx.sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(20260917)`;
    postPromise = Promise.resolve(instalar({ nombre: 'Segundo', pin: '1234' }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    await tx`INSERT INTO usuario (nombre, rol, pin_hash) VALUES ('Primero', 'admin', 'x:y')`;
  });
  const r = await postPromise!;
  expect(r.statusCode).toBe(409);
  expect(r.json().error).toBe('El sistema ya está configurado');
  expect(await ctx.sql`SELECT id FROM usuario WHERE rol = 'admin'`).toHaveLength(1);
  expect(await ctx.sql`SELECT id FROM sesion`).toHaveLength(0);
  await ctx.sql`DELETE FROM usuario WHERE nombre = 'Primero'`;
});

test('POST crea el primer admin (ignorando cualquier rol del cuerpo), abre su sesión solo en la cookie y deja el sistema instalado; repetir responde 409', async () => {
  const r = await instalar({ nombre: 'Dave', pin: '2468', rol: 'mesero' });
  expect(r.statusCode).toBe(201);
  expect(r.json().usuario).toMatchObject({ nombre: 'Dave', rol: 'admin', activo: true, tiene_pin: true });
  // Admin: la sesión vence a los 15 minutos, así que expira_en viene con fecha.
  expect(typeof r.json().expira_en).toBe('string');
  expect(Object.keys(r.json()).sort()).toEqual(['expira_en', 'usuario']);
  sinSecretos(r.json());
  const set = r.headers['set-cookie'];
  const cookieEntera = String(Array.isArray(set) ? set[0] : set);
  const cookie = cookieEntera.split(';')[0];
  expect(cookie).toMatch(/^sesion=[0-9a-f]{64}$/);
  expect(cookieEntera).toContain('HttpOnly');

  const yo = await ctx.app.inject({ method: 'GET', url: '/api/sesion', headers: { cookie } });
  expect(yo.statusCode).toBe(200);
  expect(yo.json().usuario.nombre).toBe('Dave');
  const admin = await ctx.app.inject({ method: 'GET', url: '/api/admin/usuarios', headers: { cookie } });
  expect(admin.statusCode).toBe(200);
  // La sesión nació en la PC de caja: desde la red no sirve ni con la cookie.
  const desdeRed = await ctx.app.inject({ method: 'GET', url: '/api/admin/usuarios', remoteAddress: IP_REMOTA, headers: { cookie } });
  expect(desdeRed.statusCode).toBe(403);

  expect((await ctx.app.inject({ method: 'GET', url: '/api/instalacion' })).json()).toEqual({ instalado: true });
  const otraVez = await instalar({ nombre: 'Otro', pin: '1234' });
  expect(otraVez.statusCode).toBe(409);
  expect(otraVez.json().error).toBe('El sistema ya está configurado');
  expect(await ctx.sql`SELECT id FROM usuario`).toHaveLength(1);
  expect(await ctx.sql`SELECT id FROM sesion`).toHaveLength(1);
});

test('con un admin activo y otros inactivos sigue respondiendo 409', async () => {
  await ctx.sql`INSERT INTO usuario (nombre, rol, pin_hash, activo) VALUES ('Viejo', 'admin', 'x:y', false)`;
  expect((await ctx.app.inject({ method: 'GET', url: '/api/instalacion' })).json()).toEqual({ instalado: true });
  const r = await instalar({ nombre: 'Otro', pin: '1234' });
  expect(r.statusCode).toBe(409);
  expect(await ctx.sql`SELECT id FROM usuario`).toHaveLength(2);
});

test('si no queda ningún admin activo (solo inactivos), la instalación vuelve a estar disponible (regla 31)', async () => {
  await ctx.sql`UPDATE usuario SET activo = false WHERE rol = 'admin'`;
  expect((await ctx.app.inject({ method: 'GET', url: '/api/instalacion' })).json()).toEqual({ instalado: false });
  // Mismo nombre que el admin inactivo: el índice único solo cuenta activos.
  const r = await instalar({ nombre: 'Dave', pin: '1357' });
  expect(r.statusCode).toBe(201);
  expect(r.json().usuario).toMatchObject({ nombre: 'Dave', rol: 'admin', activo: true });
  expect(await ctx.sql`SELECT id FROM usuario WHERE rol = 'admin' AND activo = true`).toHaveLength(1);
});
