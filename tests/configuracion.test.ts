import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('PATCH actualiza campos y emite evento config', async () => {
  const eventos: string[] = [];
  ctx.app.bus.suscribir((e) => eventos.push(e.nombre));
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { nombre_local: 'Delicadas', cantidad_mesas: 8, cocina_activa: true } });
  expect(r.statusCode).toBe(200);
  expect(r.json().nombre_local).toBe('Delicadas');
  expect(r.json().cantidad_mesas).toBe(8);
  expect(eventos).toContain('config');
  const g = await ctx.app.inject({ method: 'GET', url: '/api/admin/configuracion' });
  expect(g.json().cocina_activa).toBe(true);
});

test('PATCH rechaza cantidad de mesas fuera de rango', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { cantidad_mesas: 0 } });
  expect(r.statusCode).toBe(400);
  expect(r.json().error).toBe('La cantidad de mesas debe estar entre 1 y 200');
});

test('PATCH ignora campos desconocidos', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { id: 'x', otro: 1 } });
  expect(r.statusCode).toBe(200);
});
