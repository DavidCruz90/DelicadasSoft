import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('crear, listar y desactivar meseros', async () => {
  const c = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: 'Carlos' } });
  expect(c.statusCode).toBe(201);
  const id = c.json().id;
  const dup = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: 'carlos' } });
  expect(dup.statusCode).toBe(409);
  expect(dup.json().error).toBe('Ya existe un mesero con ese nombre');
  const vacio = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: '  ' } });
  expect(vacio.statusCode).toBe(400);
  const e = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/meseros/${id}`, payload: { activo: false } });
  expect(e.json().activo).toBe(false);
  const l = await ctx.app.inject({ method: 'GET', url: '/api/admin/meseros' });
  expect(l.json()).toHaveLength(1);
  const estado = await ctx.app.inject({ method: 'GET', url: '/api/estado' });
  expect(estado.json().meseros).toHaveLength(0);
});

test('PATCH de mesero inexistente responde 404', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/meseros/00000000-0000-0000-0000-000000000000', payload: { activo: true } });
  expect(r.statusCode).toBe(404);
});

test('PATCH con identificador mal formado responde 400', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/meseros/no-es-un-uuid', payload: { activo: true } });
  expect(r.statusCode).toBe(400);
  expect(r.json().error).toBe('El identificador del mesero no es válido');
});
