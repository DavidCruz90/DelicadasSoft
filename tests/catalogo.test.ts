import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
let categoriaId: string;
beforeAll(async () => {
  ctx = await crearAppDePrueba();
  const c = await ctx.app.inject({ method: 'POST', url: '/api/admin/categorias', payload: { nombre: 'Sandwiches', orden: 2 } });
  expect(c.statusCode).toBe(201);
  categoriaId = c.json().id;
});
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('crear producto con stock y leerlo en el catalogo', async () => {
  const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Sándwich de pollo', precio: 4.5, controla_stock: true, stock_actual: 12 } });
  expect(r.statusCode).toBe(201);
  expect(r.json().precio).toBe('4.50');
  expect(r.json().stock_actual).toBe(12);
  const cat = await ctx.app.inject({ method: 'GET', url: '/api/catalogo' });
  expect(cat.json().categorias[0].nombre).toBe('Sandwiches');
  expect(cat.json().categorias[0].productos[0].nombre).toBe('Sándwich de pollo');
});

test('producto sin control de stock ignora stock_actual', async () => {
  const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Capuchino', precio: '2.50', controla_stock: false, stock_actual: 99 } });
  expect(r.statusCode).toBe(201);
  expect(r.json().stock_actual).toBeNull();
});

test('validaciones de producto', async () => {
  const sinNombre = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: '', precio: 1, controla_stock: false } });
  expect(sinNombre.statusCode).toBe(400);
  const precioNeg = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'X', precio: -1, controla_stock: false } });
  expect(precioNeg.statusCode).toBe(400);
  const sinStock = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'X', precio: 1, controla_stock: true } });
  expect(sinStock.statusCode).toBe(400);
  const catInexistente = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: '00000000-0000-0000-0000-000000000000', nombre: 'X', precio: 1, controla_stock: false } });
  expect(catInexistente.statusCode).toBe(404);
});

test('ajustar stock crea movimiento y emite evento stock', async () => {
  const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Bolón', precio: 3, controla_stock: true, stock_actual: 3 } });
  const id = p.json().id;
  const eventos: any[] = [];
  ctx.app.bus.suscribir((e) => eventos.push(e));
  const r = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/stock`, payload: { stock: 10, motivo: 'Se hicieron más' } });
  expect(r.statusCode).toBe(200);
  expect(r.json().stock_actual).toBe(10);
  expect(eventos.find((e) => e.nombre === 'stock')?.datos).toEqual({ producto_id: id, stock_actual: 10 });
  const movs = await ctx.sql`SELECT cantidad, stock_resultante, origen, motivo, jornada_id FROM movimiento_stock WHERE producto_id = ${id}`;
  expect(movs).toHaveLength(1);
  expect(movs[0]).toMatchObject({ cantidad: 7, stock_resultante: 10, origen: 'ajuste_manual', motivo: 'Se hicieron más', jornada_id: null });
  const neg = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/stock`, payload: { stock: -1, motivo: 'x' } });
  expect(neg.statusCode).toBe(400);
  expect(neg.json().error).toBe('El stock no puede ser negativo');
  const sinMotivo = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/stock`, payload: { stock: 5, motivo: '' } });
  expect(sinMotivo.statusCode).toBe(400);
});

test('editar categoria inactiva la saca del catalogo', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/categorias/${categoriaId}`, payload: { activa: false } });
  expect(r.statusCode).toBe(200);
  const cat = await ctx.app.inject({ method: 'GET', url: '/api/catalogo' });
  expect(cat.json().categorias).toHaveLength(0);
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/categorias/${categoriaId}`, payload: { activa: true } });
});

test('subir foto guarda archivo y actualiza producto', async () => {
  const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Con foto', precio: 1, controla_stock: false } });
  const id = p.json().id;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const limite = '----limite';
  const cuerpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="foto"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
    png,
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  const r = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/foto`, headers: { 'content-type': `multipart/form-data; boundary=${limite}` }, payload: cuerpo });
  expect(r.statusCode).toBe(200);
  expect(r.json().foto).toBe(`/fotos/${id}.png`);
  const f = await ctx.app.inject({ method: 'GET', url: `/fotos/${id}.png` });
  expect(f.statusCode).toBe(200);
});

// --- Pruebas de tipos adicionales (decisión de Dave: validación estricta) ---

test('controla_stock como texto "true" se rechaza con 400', async () => {
  const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'X', precio: 1, controla_stock: 'true' } });
  expect(r.statusCode).toBe(400);
});

test('precio nulo se rechaza con 400', async () => {
  const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'X', precio: null, controla_stock: false } });
  expect(r.statusCode).toBe(400);
});

test('categoria_id mal formado se rechaza con 400', async () => {
  const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: 'no-es-un-uuid', nombre: 'X', precio: 1, controla_stock: false } });
  expect(r.statusCode).toBe(400);
});

test('cuerpo que no es un objeto se rechaza con 400', async () => {
  const rProducto = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', headers: { 'content-type': 'application/json' }, payload: '"texto"' });
  expect(rProducto.statusCode).toBe(400);
  const rCategoria = await ctx.app.inject({ method: 'POST', url: '/api/admin/categorias', headers: { 'content-type': 'application/json' }, payload: '"texto"' });
  expect(rCategoria.statusCode).toBe(400);
});

test('stock desmesurado se rechaza con 400', async () => {
  const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Desmesurado', precio: 1, controla_stock: true, stock_actual: 5 } });
  expect(p.statusCode).toBe(201);
  const rCrear = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Otro', precio: 1, controla_stock: true, stock_actual: 99999999 } });
  expect(rCrear.statusCode).toBe(400);
  const id = p.json().id;
  const rAjuste = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/stock`, payload: { stock: 99999999, motivo: 'x' } });
  expect(rAjuste.statusCode).toBe(400);
});

test('identificador de producto mal formado responde 400', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/productos/no-es-un-uuid', payload: { nombre: 'X' } });
  expect(r.statusCode).toBe(400);
});

test('producto inexistente al editar responde 404', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/productos/00000000-0000-0000-0000-000000000000', payload: { nombre: 'X' } });
  expect(r.statusCode).toBe(404);
});
