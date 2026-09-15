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

test('reactivar un mesero no puede duplicar el nombre de otro mesero activo', async () => {
  const primero = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: 'Ana' } });
  const idPrimero = primero.json().id;
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/meseros/${idPrimero}`, payload: { activo: false } });
  const segundo = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: 'ana' } });
  expect(segundo.statusCode).toBe(201);
  const reactivar = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/meseros/${idPrimero}`, payload: { activo: true } });
  expect(reactivar.statusCode).toBe(409);
  expect(reactivar.json().error).toBe('Ya existe un mesero con ese nombre');
});

test('el campo activo con tipo incorrecto se rechaza con 400 y no se guarda mal', async () => {
  const c = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: 'Beto' } });
  const id = c.json().id;
  const r = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/meseros/${id}`, payload: { activo: 'false' } });
  expect(r.statusCode).toBe(400);
  const g = await ctx.app.inject({ method: 'GET', url: '/api/admin/meseros' });
  expect(g.json().find((m: { id: string }) => m.id === id).activo).toBe(true);
});

test('el nombre con tipo incorrecto se rechaza con 400 al crear y al editar', async () => {
  const crearNumero = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: 7 } });
  expect(crearNumero.statusCode).toBe(400);
  const crearObjeto = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: {} } });
  expect(crearObjeto.statusCode).toBe(400);
  const c = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: 'Cami' } });
  const id = c.json().id;
  const editar = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/meseros/${id}`, payload: { nombre: 7 } });
  expect(editar.statusCode).toBe(400);
});

test('POST con un cuerpo que no es un objeto responde 400, no 500', async () => {
  const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', headers: { 'content-type': 'application/json' }, payload: '"texto"' });
  expect(r.statusCode).toBe(400);
});

test('POST sin cuerpo responde 400 por falta de nombre, no 500', async () => {
  const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros' });
  expect(r.statusCode).toBe(400);
});

test('el indice unico parcial de mesero activo existe en la base', async () => {
  const filas = await ctx.sql`SELECT indexname FROM pg_indexes WHERE tablename = 'mesero' AND indexname = 'mesero_nombre_activo_unico'`;
  expect(filas).toHaveLength(1);
});

test('crear dos meseros con el mismo nombre en paralelo solo deja uno activo', async () => {
  const [a, b] = await Promise.all([
    ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: 'Diego' } }),
    ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: 'diego' } }),
  ]);
  const estados = [a.statusCode, b.statusCode].sort();
  expect(estados).toEqual([201, 409]);
  for (const r of [a, b]) expect([201, 409]).toContain(r.statusCode);
});
