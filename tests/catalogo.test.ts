import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';

const PNG_VALIDO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPEG_FALSO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

// Arma un cuerpo multipart/form-data mínimo para tests de subida de foto,
// sin depender de ninguna librería de formularios.
function multipart(partes: { name: string; filename?: string; contentType?: string; data: Buffer }[]) {
  const limite = `----limite${Math.random().toString(16).slice(2)}`;
  const trozos: Buffer[] = [];
  for (const p of partes) {
    let cabecera = `--${limite}\r\nContent-Disposition: form-data; name="${p.name}"`;
    if (p.filename) cabecera += `; filename="${p.filename}"`;
    cabecera += '\r\n';
    if (p.contentType) cabecera += `Content-Type: ${p.contentType}\r\n`;
    cabecera += '\r\n';
    trozos.push(Buffer.from(cabecera), p.data, Buffer.from('\r\n'));
  }
  trozos.push(Buffer.from(`--${limite}--\r\n`));
  return { headers: { 'content-type': `multipart/form-data; boundary=${limite}` }, payload: Buffer.concat(trozos) };
}

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
  // Ronda de arreglo 1: crear con stock inicial ya deja su propio movimiento
  // ("Stock inicial", +3), así que el ajuste posterior es el segundo.
  const movs = await ctx.sql`SELECT cantidad, stock_resultante, origen, motivo, jornada_id FROM movimiento_stock WHERE producto_id = ${id} ORDER BY creado_en`;
  expect(movs).toHaveLength(2);
  expect(movs[0]).toMatchObject({ cantidad: 3, stock_resultante: 3, origen: 'ajuste_manual', motivo: 'Stock inicial', jornada_id: null });
  expect(movs[1]).toMatchObject({ cantidad: 7, stock_resultante: 10, origen: 'ajuste_manual', motivo: 'Se hicieron más', jornada_id: null });
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

// --- Ronda de arreglo 1 ---

test('restaura la guarda: reafirmar controla_stock:true con stock_actual es la puerta trasera del ajuste, se bloquea', async () => {
  const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Con guarda', precio: 1, controla_stock: true, stock_actual: 50 } });
  expect(p.statusCode).toBe(201);
  const id = p.json().id;
  const r = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${id}`, payload: { controla_stock: true, stock_actual: 999 } });
  expect(r.statusCode).toBe(400);
  expect(r.json().error).toBe('Para cambiar el stock usa el ajuste de stock con motivo');
  const [fila] = await ctx.sql`SELECT stock_actual FROM producto WHERE id = ${id}`;
  expect(fila.stock_actual).toBe(50);
  const movs = await ctx.sql`SELECT cantidad FROM movimiento_stock WHERE producto_id = ${id}`;
  expect(movs).toHaveLength(1); // solo el de "Stock inicial" al crear; el PATCH rechazado no dejó rastro
});

test('crear producto con stock inicial deja su propio movimiento', async () => {
  const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Con rastro', precio: 1, controla_stock: true, stock_actual: 12 } });
  expect(p.statusCode).toBe(201);
  const id = p.json().id;
  const movs = await ctx.sql`SELECT cantidad, stock_resultante, origen, motivo FROM movimiento_stock WHERE producto_id = ${id}`;
  expect(movs).toHaveLength(1);
  expect(movs[0]).toMatchObject({ cantidad: 12, stock_resultante: 12, origen: 'ajuste_manual', motivo: 'Stock inicial' });
});

test('activar y luego desactivar el control de stock deja su propio movimiento en cada caso', async () => {
  const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Sin control', precio: 1, controla_stock: false } });
  expect(p.statusCode).toBe(201);
  const id = p.json().id;

  const activar = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${id}`, payload: { controla_stock: true, stock_actual: 50 } });
  expect(activar.statusCode).toBe(200);
  expect(activar.json().stock_actual).toBe(50);
  const movsActivar = await ctx.sql`SELECT cantidad, stock_resultante, motivo FROM movimiento_stock WHERE producto_id = ${id} ORDER BY creado_en`;
  expect(movsActivar).toHaveLength(1);
  expect(movsActivar[0]).toMatchObject({ cantidad: 50, stock_resultante: 50, motivo: 'Stock inicial' });

  const desactivar = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${id}`, payload: { controla_stock: false } });
  expect(desactivar.statusCode).toBe(200);
  expect(desactivar.json().stock_actual).toBeNull();
  const movs = await ctx.sql`SELECT cantidad, stock_resultante, motivo FROM movimiento_stock WHERE producto_id = ${id} ORDER BY creado_en`;
  expect(movs).toHaveLength(2);
  expect(movs[1]).toMatchObject({ cantidad: -50, stock_resultante: 0, motivo: 'Control de stock desactivado' });
  const suma = movs.reduce((acc: number, m: any) => acc + m.cantidad, 0);
  expect(suma).toBe(0); // +50 de activar, -50 de desactivar: cuadra con el stock final (desactivado)
});

test('exigirMonto endurece el precio: entero desmesurado, decimales de más y montos límite', async () => {
  const desmesurado = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'X', precio: 12345678901, controla_stock: false } });
  expect(desmesurado.statusCode).toBe(400);

  const tresDecimales = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'X', precio: '4.555', controla_stock: false } });
  expect(tresDecimales.statusCode).toBe(400);

  const numero = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'X', precio: 4.5, controla_stock: false } });
  expect(numero.statusCode).toBe(201);
  expect(numero.json().precio).toBe('4.50');

  const cadena = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'X', precio: '4.50', controla_stock: false } });
  expect(cadena.statusCode).toBe(201);
  expect(cadena.json().precio).toBe('4.50');

  const cero = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'X', precio: 0, controla_stock: false } });
  expect(cero.statusCode).toBe(201);
  expect(cero.json().precio).toBe('0.00');

  const negativo = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'X', precio: -1, controla_stock: false } });
  expect(negativo.statusCode).toBe(400);
});

test('foto: el campo del archivo debe llamarse "foto"', async () => {
  const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Campo malo', precio: 1, controla_stock: false } });
  const id = p.json().id;
  const { headers, payload } = multipart([{ name: 'imagen', filename: 'a.png', contentType: 'image/png', data: PNG_VALIDO }]);
  const r = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/foto`, headers, payload });
  expect(r.statusCode).toBe(400);
  expect(r.json().error).toBe('Falta el archivo de foto');
});

test('foto: el contenido debe corresponder al mimetype declarado', async () => {
  const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Foto falsa', precio: 1, controla_stock: false } });
  const id = p.json().id;
  const { headers, payload } = multipart([{ name: 'foto', filename: 'a.png', contentType: 'image/png', data: Buffer.from('esto no es una imagen, es texto plano') }]);
  const r = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/foto`, headers, payload });
  expect(r.statusCode).toBe(400);
  expect(r.json().error).toBe('La foto debe ser JPG, PNG o WEBP');
});

test('foto: más de 5 MB responde 413 con el mensaje de límite', async () => {
  const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Foto grande', precio: 1, controla_stock: false } });
  const id = p.json().id;
  const grande = Buffer.concat([PNG_VALIDO, Buffer.alloc(6 * 1024 * 1024, 1)]);
  const { headers, payload } = multipart([{ name: 'foto', filename: 'a.png', contentType: 'image/png', data: grande }]);
  const r = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/foto`, headers, payload });
  expect(r.statusCode).toBe(413);
  expect(r.json().error).toBe('La foto supera el tamaño máximo de 5 MB');
});

test('foto: subir una con otra extensión borra el archivo anterior', async () => {
  const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Cambia extensión', precio: 1, controla_stock: false } });
  const id = p.json().id;
  const png = multipart([{ name: 'foto', filename: 'a.png', contentType: 'image/png', data: PNG_VALIDO }]);
  const r1 = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/foto`, headers: png.headers, payload: png.payload });
  expect(r1.statusCode).toBe(200);
  expect(r1.json().foto).toBe(`/fotos/${id}.png`);

  const jpeg = multipart([{ name: 'foto', filename: 'b.jpg', contentType: 'image/jpeg', data: JPEG_FALSO }]);
  const r2 = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/foto`, headers: jpeg.headers, payload: jpeg.payload });
  expect(r2.statusCode).toBe(200);
  expect(r2.json().foto).toBe(`/fotos/${id}.jpg`);

  const viejo = await ctx.app.inject({ method: 'GET', url: `/fotos/${id}.png` });
  expect(viejo.statusCode).toBe(404);
  const nuevo = await ctx.app.inject({ method: 'GET', url: `/fotos/${id}.jpg` });
  expect(nuevo.statusCode).toBe(200);
});

// --- Ronda de arreglo 2 ---

test('cuerpo JSON de más de 1 MB responde 413 con el mensaje genérico, no el de la foto', async () => {
  const grande = { categoria_id: categoriaId, nombre: 'Grande', precio: 1, controla_stock: false, descripcion: 'x'.repeat(1_200_000) };
  const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: grande });
  expect(r.statusCode).toBe(413);
  expect(r.json().error).toBe('El contenido supera el tamaño máximo permitido');
});

test('ajuste de stock y desactivación concurrentes sobre el mismo producto dejan la suma de movimientos cuadrada', async () => {
  const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Concurrencia', precio: 1, controla_stock: true, stock_actual: 20 } });
  expect(p.statusCode).toBe(201);
  const id = p.json().id;

  const [ajuste, desactivar] = await Promise.all([
    ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/stock`, payload: { stock: 35, motivo: 'Llegó pedido' } }),
    ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${id}`, payload: { controla_stock: false } }),
  ]);
  // Cuál de las dos gana la carrera lo decide quién toma primero el bloqueo
  // SELECT ... FOR UPDATE de la fila del producto: si la desactivación gana,
  // el ajuste que llega después puede fallar con 409 porque para entonces el
  // producto ya no controla stock (comportamiento correcto, no un error). Lo
  // único que no puede pasar nunca es que la suma de los movimientos deje de
  // cuadrar con el estado final del producto.
  expect([200, 409]).toContain(ajuste.statusCode);
  expect(desactivar.statusCode).toBe(200);

  const [fila] = await ctx.sql`SELECT stock_actual, controla_stock FROM producto WHERE id = ${id}`;
  expect(fila.controla_stock).toBe(false);
  expect(fila.stock_actual).toBeNull();
  const movs = await ctx.sql`SELECT cantidad FROM movimiento_stock WHERE producto_id = ${id}`;
  const suma = movs.reduce((acc: number, m: any) => acc + m.cantidad, 0);
  expect(suma).toBe(0); // el producto quedó desactivado (stock efectivo 0); la suma debe cuadrar con eso sin importar el orden real
});
