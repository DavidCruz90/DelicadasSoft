import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('GET /api/estado devuelve configuracion, jornada nula y meseros vacios', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/estado' });
  expect(r.statusCode).toBe(200);
  const cuerpo = r.json();
  expect(cuerpo.configuracion.nombre_local).toBe('Cafetería');
  expect(cuerpo.jornada).toBeNull();
  expect(cuerpo.meseros).toEqual([]);
});

test('una ruta inexistente responde 404 con {error}', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/no-existe' });
  expect(r.statusCode).toBe(404);
  expect(r.json().error).toBe('No existe');
});

test('el bus de eventos entrega lo emitido a los suscriptores', async () => {
  const recibidos: string[] = [];
  const cancelar = ctx.app.bus.suscribir((e) => recibidos.push(e.nombre));
  ctx.app.bus.emitir('stock', { producto_id: 'x' });
  cancelar();
  ctx.app.bus.emitir('stock');
  expect(recibidos).toEqual(['stock']);
});

test('GET /api/eventos responde como text/event-stream', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/eventos', payloadAsStream: true });
  expect(r.statusCode).toBe(200);
  expect(r.headers['content-type']).toContain('text/event-stream');
  r.stream().destroy();
});
