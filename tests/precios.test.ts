import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
let categoriaId: string;
beforeAll(async () => {
  ctx = await crearAppDePrueba();
  const c = await ctx.app.inject({ method: 'POST', url: '/api/admin/categorias', payload: { nombre: 'Cafés', orden: 1 } });
  categoriaId = c.json().id;
});
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

const crearProducto = async (nombre: string, precio: number) =>
  (await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre, precio, controla_stock: false } })).json();
const cambios = (productoId: string) => ctx.sql`SELECT precio_anterior, precio_nuevo, usuario_id FROM cambio_precio WHERE producto_id = ${productoId} ORDER BY creado_en`;

test('crear un producto no deja registro; cambiar el precio deja exactamente uno con anterior, nuevo y quién', async () => {
  const p = await crearProducto('Capuchino', 2.5);
  expect(await cambios(p.id)).toHaveLength(0);
  const r = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: 3 } });
  expect(r.statusCode).toBe(200);
  expect(r.json().precio).toBe('3.00');
  expect(await cambios(p.id)).toEqual([{ precio_anterior: '2.50', precio_nuevo: '3.00', usuario_id: ctx.admin.id }]);
});

test('editar sin tocar el precio, o mandar el mismo precio como número o como texto, no deja registro', async () => {
  const p = await crearProducto('Mocaccino', 3.25);
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { nombre: 'Mocaccino grande' } });
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: 3.25 } });
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: '3.25' } });
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}` });
  expect(await cambios(p.id)).toHaveLength(0);
});

test('un precio inválido no deja registro ni cambia el precio', async () => {
  const p = await crearProducto('Té', 1.5);
  const r = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: -1 } });
  expect(r.statusCode).toBe(400);
  expect(await cambios(p.id)).toHaveLength(0);
});

test('el historial se lee más reciente primero con el nombre de quien cambió; 404 y 400 en ids malos', async () => {
  const p = await crearProducto('Latte', 2);
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: 2.25 } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: 2.75 } });
  const h = await ctx.app.inject({ method: 'GET', url: `/api/admin/productos/${p.id}/precios` });
  expect(h.statusCode).toBe(200);
  expect(h.json()).toHaveLength(2);
  expect(h.json()[0]).toMatchObject({ precio_anterior: '2.25', precio_nuevo: '2.75', usuario_nombre: 'Admin de prueba' });
  expect(h.json()[1]).toMatchObject({ precio_anterior: '2.00', precio_nuevo: '2.25' });
  expect(JSON.stringify(h.json())).not.toContain('pin_hash');
  expect((await ctx.app.inject({ method: 'GET', url: '/api/admin/productos/00000000-0000-0000-0000-000000000000/precios' })).statusCode).toBe(404);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/admin/productos/no-es-uuid/precios' })).statusCode).toBe(400);
});

test('carrera determinista: el precio anterior registrado es el que había al tomar el bloqueo, no el leído antes', async () => {
  const p = await crearProducto('Espresso', 1);
  // Una transacción externa bloquea la fila, se lanza el PATCH a 1.50 sin
  // esperarlo, la externa sube el precio a 1.25 y confirma. Como editarProducto
  // lee la fila con FOR UPDATE dentro de su propia transacción, ve 1.25 al
  // retomar y registra 1.25 → 1.50. Si leyera fuera de la transacción,
  // registraría 1.00 → 1.50 y la suma de cambios dejaría de cuadrar.
  let patchPromise: Promise<{ statusCode: number; json: () => any }> | null = null;
  await ctx.sql.begin(async (tx) => {
    await tx`SELECT id FROM producto WHERE id = ${p.id} FOR UPDATE`;
    patchPromise = Promise.resolve(ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: 1.5 } }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    await tx`UPDATE producto SET precio = 1.25, actualizado_en = now() WHERE id = ${p.id}`;
  });
  const r = await patchPromise!;
  expect(r.statusCode).toBe(200);
  expect(await cambios(p.id)).toEqual([{ precio_anterior: '1.25', precio_nuevo: '1.50', usuario_id: ctx.admin.id }]);
});
