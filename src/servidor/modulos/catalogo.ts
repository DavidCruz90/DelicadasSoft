import { asc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db, Tx } from '../db/conexion';
import { categoria, producto, movimientoStock, jornada } from '../db/schema';
import { ENTERO_MAXIMO, ErrorNegocio, ErrorTamano, ErrorValidacion, NoEncontrado, exigirBooleano, exigirEntero, exigirMonto, exigirObjeto, exigirObjetoOpcional, exigirTexto, exigirUuid } from '../errores';
import { config } from '../config';
import { ADMIN, SOLO_DISPOSITIVO } from '../seguridad/acceso';

export type Categoria = typeof categoria.$inferSelect;
export type Producto = typeof producto.$inferSelect;

// ---- Categorías

export async function listarCategorias(db: Db) {
  return db.select().from(categoria).orderBy(asc(categoria.orden), asc(categoria.nombre));
}

export async function crearCategoria(db: Db, datos: { nombre?: unknown; orden?: unknown }) {
  const nombre = exigirTexto(
    datos.nombre,
    'El nombre de la categoría debe ser texto',
    'El nombre de la categoría no puede estar vacío',
  );
  const orden = datos.orden !== undefined ? exigirEntero(datos.orden, 'El orden debe ser un entero entre 0 y 1000000') : 0;
  const [c] = await db.insert(categoria).values({ nombre, orden }).returning();
  return c;
}

export async function editarCategoria(db: Db, id: string, datos: { nombre?: unknown; orden?: unknown; activa?: unknown }) {
  exigirUuid(id, 'El identificador de la categoría no es válido');

  const cambios: Partial<typeof categoria.$inferInsert> = {};
  if (datos.nombre !== undefined) {
    cambios.nombre = exigirTexto(
      datos.nombre,
      'El nombre de la categoría debe ser texto',
      'El nombre de la categoría no puede estar vacío',
    );
  }
  if (datos.orden !== undefined) cambios.orden = exigirEntero(datos.orden, 'El orden debe ser un entero entre 0 y 1000000');
  if (datos.activa !== undefined) cambios.activa = exigirBooleano(datos.activa, 'El estado activo de la categoría debe ser verdadero o falso');

  // Patrón único de edición (el mismo que editarProducto y editarMesero):
  // fila leída con FOR UPDATE dentro de la transacción que la escribe, y
  // solo los campos recibidos. Sin cambios, se devuelve la fila tal cual.
  return db.transaction(async (tx) => {
    const [existe] = await tx.select().from(categoria).where(eq(categoria.id, id)).for('update');
    if (!existe) throw new NoEncontrado('La categoría no existe');
    if (Object.keys(cambios).length === 0) return existe;
    const [c] = await tx.update(categoria).set(cambios).where(eq(categoria.id, id)).returning();
    return c;
  });
}

// ---- Productos

type DatosProducto = {
  categoria_id?: unknown;
  nombre?: unknown;
  descripcion?: unknown;
  precio?: unknown;
  activo?: unknown;
  controla_stock?: unknown;
  stock_actual?: unknown;
  orden?: unknown;
};

async function validarProducto(db: Db | Tx, datos: DatosProducto, esNuevo: boolean) {
  const cambios: Partial<typeof producto.$inferInsert> = {};

  if (esNuevo || datos.categoria_id !== undefined) {
    const categoriaId = exigirUuid(datos.categoria_id, 'La categoría no es válida');
    const [c] = await db.select({ id: categoria.id }).from(categoria).where(eq(categoria.id, categoriaId));
    if (!c) throw new NoEncontrado('La categoría no existe');
    cambios.categoria_id = c.id;
  }

  if (esNuevo || datos.nombre !== undefined) {
    cambios.nombre = exigirTexto(
      datos.nombre,
      'El nombre del producto debe ser texto',
      'El nombre del producto no puede estar vacío',
    );
  }

  if (esNuevo || datos.precio !== undefined) cambios.precio = exigirMonto(datos.precio, 'El precio debe ser un número mayor o igual a 0, con hasta 2 decimales');

  if (datos.descripcion !== undefined) {
    if (datos.descripcion !== null && typeof datos.descripcion !== 'string') {
      throw new ErrorValidacion('La descripción debe ser texto');
    }
    const t = typeof datos.descripcion === 'string' ? datos.descripcion.trim() : '';
    cambios.descripcion = t ? t : null;
  }

  if (datos.activo !== undefined) cambios.activo = exigirBooleano(datos.activo, 'El estado activo del producto debe ser verdadero o falso');

  if (datos.orden !== undefined) cambios.orden = exigirEntero(datos.orden, 'El orden debe ser un entero entre 0 y 1000000');

  if (esNuevo || datos.controla_stock !== undefined) {
    const controlaStock = exigirBooleano(datos.controla_stock, 'El control de stock debe ser verdadero o falso');
    cambios.controla_stock = controlaStock;
    if (controlaStock) {
      if (datos.stock_actual === undefined) throw new ErrorValidacion('Un producto con control de stock necesita stock inicial');
      cambios.stock_actual = exigirEntero(datos.stock_actual, 'El stock debe ser un entero entre 0 y 1000000');
    } else {
      cambios.stock_actual = null;
    }
  } else if (datos.stock_actual !== undefined) {
    throw new ErrorValidacion('Para cambiar el stock usa el ajuste de stock con motivo');
  }

  return cambios;
}

export async function listarProductos(db: Db) {
  return db.select().from(producto).orderBy(asc(producto.orden), asc(producto.nombre));
}

// Inserta el rastro de todo cambio de stock (creación con stock inicial,
// activación/desactivación de control de stock, ajuste manual). Recibe la
// conexión activa (la de la base o la de una transacción abierta con
// db.transaction) para que la escritura del producto y la del movimiento
// queden en la misma transacción: si una falla, la otra tampoco se guarda.
async function insertarMovimientoStock(
  tx: Tx,
  datos: { productoId: string; cantidad: number; stockResultante: number; origen: 'ajuste_manual' | 'apertura'; motivo: string },
) {
  const [abierta] = await tx.select({ id: jornada.id }).from(jornada).where(isNull(jornada.cerrada_en));
  await tx.insert(movimientoStock).values({
    producto_id: datos.productoId,
    jornada_id: abierta?.id ?? null,
    cantidad: datos.cantidad,
    stock_resultante: datos.stockResultante,
    origen: datos.origen,
    motivo: datos.motivo,
  });
}

export async function crearProducto(db: Db, datos: DatosProducto) {
  const cambios = await validarProducto(db, datos, true);
  return db.transaction(async (tx) => {
    const [p] = await tx.insert(producto).values(cambios as typeof producto.$inferInsert).returning();
    if (cambios.controla_stock && typeof cambios.stock_actual === 'number') {
      await insertarMovimientoStock(tx, {
        productoId: p.id,
        cantidad: cambios.stock_actual,
        stockResultante: cambios.stock_actual,
        origen: 'ajuste_manual',
        motivo: 'Stock inicial',
      });
    }
    return p;
  });
}

export async function editarProducto(db: Db, id: string, datos: DatosProducto) {
  exigirUuid(id, 'El identificador del producto no es válido');

  // La lectura del producto existente (para decidir la guarda de abajo y
  // para calcular el movimiento de desactivación) va con SELECT ... FOR
  // UPDATE dentro de la misma transacción que la escritura, igual que en
  // ajustarStock: si se leyera fuera de la transacción, un ajuste de stock
  // concurrente podría colarse entre la lectura y la escritura, y el
  // movimiento de desactivación quedaría calculado sobre un stock_actual ya
  // obsoleto (la suma de movimientos dejaría de cuadrar con el stock real).
  return db.transaction(async (tx) => {
    const [existe] = await tx.select().from(producto).where(eq(producto.id, id)).for('update');
    if (!existe) throw new NoEncontrado('El producto no existe');

    // Guarda del brief, restaurada: si el producto ya controla stock, tocar
    // stock_actual por esta vía (incluso reafirmando controla_stock: true) es
    // la puerta trasera al ajuste con motivo; se bloquea siempre. El único
    // caso permitido es reafirmar controla_stock: true SIN mandar stock_actual,
    // que conserva el valor existente sin registrar ningún movimiento.
    if (datos.controla_stock === true && existe.controla_stock && datos.stock_actual !== undefined) {
      throw new ErrorValidacion('Para cambiar el stock usa el ajuste de stock con motivo');
    }
    const datosParaValidar: DatosProducto = { ...datos };
    if (datos.controla_stock === true && existe.controla_stock) {
      datosParaValidar.stock_actual = existe.stock_actual;
    }

    const cambios = await validarProducto(tx, datosParaValidar, false);
    if (Object.keys(cambios).length === 0) return existe;

    const [p] = await tx.update(producto).set(cambios).where(eq(producto.id, id)).returning();

    const activandoControl = datos.controla_stock === true && !existe.controla_stock;
    const desactivandoControl = datos.controla_stock === false && existe.controla_stock;

    if (activandoControl && typeof cambios.stock_actual === 'number') {
      await insertarMovimientoStock(tx, {
        productoId: id,
        cantidad: cambios.stock_actual,
        stockResultante: cambios.stock_actual,
        origen: 'ajuste_manual',
        motivo: 'Stock inicial',
      });
    } else if (desactivandoControl) {
      const stockPrevio = existe.stock_actual ?? 0;
      await insertarMovimientoStock(tx, {
        productoId: id,
        cantidad: -stockPrevio,
        stockResultante: 0,
        origen: 'ajuste_manual',
        motivo: 'Control de stock desactivado',
      });
    }

    return p;
  });
}

// origen no viene del cliente: la ruta HTTP siempre llama con el valor por
// defecto ('ajuste_manual'), y solo el módulo de jornada (plan 2) pasará
// 'apertura' desde código propio. Si se leyera del cuerpo, cualquiera podría
// forjar desde admin un movimiento de apertura sin jornada abierta.
export async function ajustarStock(
  db: Db,
  productoId: string,
  datos: { stock?: unknown; motivo?: unknown },
  origen: 'ajuste_manual' | 'apertura' = 'ajuste_manual',
) {
  exigirUuid(productoId, 'El identificador del producto no es válido');
  const motivo = exigirTexto(
    datos.motivo,
    'El motivo del ajuste debe ser texto',
    'El ajuste de stock necesita un motivo',
  );
  if (typeof datos.stock !== 'number' || !Number.isInteger(datos.stock)) throw new ErrorValidacion('El stock debe ser un número entero');
  if (datos.stock < 0) throw new ErrorValidacion('El stock no puede ser negativo');
  if (datos.stock > ENTERO_MAXIMO) throw new ErrorValidacion('El stock debe ser un entero entre 0 y 1000000');
  const nuevo = datos.stock;

  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(producto).where(eq(producto.id, productoId)).for('update');
    if (!p) throw new NoEncontrado('El producto no existe');
    if (!p.controla_stock) throw new ErrorNegocio('Este producto no controla stock');
    const [actualizado] = await tx.update(producto).set({ stock_actual: nuevo }).where(eq(producto.id, productoId)).returning();
    await insertarMovimientoStock(tx, {
      productoId,
      cantidad: nuevo - (p.stock_actual ?? 0),
      stockResultante: nuevo,
      origen,
      motivo,
    });
    return actualizado;
  });
}

export async function obtenerCatalogo(db: Db) {
  const cats = await db.select().from(categoria).where(eq(categoria.activa, true)).orderBy(asc(categoria.orden), asc(categoria.nombre));
  const prods = await db.select().from(producto).where(eq(producto.activo, true)).orderBy(asc(producto.orden), asc(producto.nombre));
  return { categorias: cats.map((c) => ({ ...c, productos: prods.filter((p) => p.categoria_id === c.id) })) };
}

const EXTENSIONES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// El mimetype que declara el cliente en la petición multipart no es
// confiable (un HTML puede declararse "image/png"); se comprueban además los
// primeros bytes del archivo contra la firma real de cada formato.
function tipoImagenValido(mimetype: string, buffer: Buffer): boolean {
  if (mimetype === 'image/png') {
    return buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mimetype === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === 'image/webp') {
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

// Borra la foto anterior de fotos/ cuando la nueva queda con otro nombre de
// archivo (cambió la extensión); si ya no existe (ya se borró, o nunca se
// escribió), se ignora: no es un error que la foto vieja no esté.
async function borrarFotoAnterior(rutaAnterior: string | null) {
  if (!rutaAnterior) return;
  const nombre = rutaAnterior.replace(/^\/fotos\//, '');
  try {
    await unlink(join(config.carpetaFotos, nombre));
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') throw err;
  }
}

export function rutasCatalogo(app: FastifyInstance) {
  app.get('/api/catalogo', { config: { acceso: SOLO_DISPOSITIVO } }, async () => obtenerCatalogo(app.db));

  app.get('/api/admin/categorias', { config: { acceso: ADMIN } }, async () => listarCategorias(app.db));
  app.post('/api/admin/categorias', { config: { acceso: ADMIN } }, async (req, reply) => {
    const datos = exigirObjeto(req.body);
    const c = await crearCategoria(app.db, datos);
    app.bus.emitir('catalogo');
    return reply.status(201).send(c);
  });
  app.patch<{ Params: { id: string } }>('/api/admin/categorias/:id', { config: { acceso: ADMIN } }, async (req) => {
    const datos = exigirObjetoOpcional(req.body);
    const c = await editarCategoria(app.db, req.params.id, datos);
    app.bus.emitir('catalogo');
    return c;
  });

  app.get('/api/admin/productos', { config: { acceso: ADMIN } }, async () => listarProductos(app.db));
  app.post('/api/admin/productos', { config: { acceso: ADMIN } }, async (req, reply) => {
    const datos = exigirObjeto(req.body);
    const p = await crearProducto(app.db, datos);
    app.bus.emitir('catalogo');
    return reply.status(201).send(p);
  });
  app.patch<{ Params: { id: string } }>('/api/admin/productos/:id', { config: { acceso: ADMIN } }, async (req) => {
    const datos = exigirObjetoOpcional(req.body);
    const p = await editarProducto(app.db, req.params.id, datos);
    app.bus.emitir('catalogo');
    return p;
  });
  app.post<{ Params: { id: string } }>('/api/admin/productos/:id/stock', { config: { acceso: ADMIN } }, async (req) => {
    const { stock, motivo } = exigirObjeto(req.body);
    // Solo stock y motivo: un "origen" en el cuerpo se ignora a propósito.
    const p = await ajustarStock(app.db, req.params.id, { stock, motivo });
    app.bus.emitir('stock', { producto_id: p.id, stock_actual: p.stock_actual });
    return p;
  });
  app.post<{ Params: { id: string } }>('/api/admin/productos/:id/foto', { config: { acceso: ADMIN } }, async (req) => {
    const id = exigirUuid(req.params.id, 'El identificador del producto no es válido');
    const [existe] = await app.db.select().from(producto).where(eq(producto.id, id));
    if (!existe) throw new NoEncontrado('El producto no existe');
    const archivo = await req.file({ limits: { fileSize: 5 * 1024 * 1024 } });
    if (!archivo || archivo.fieldname !== 'foto') throw new ErrorValidacion('Falta el archivo de foto');
    const ext = EXTENSIONES[archivo.mimetype];
    if (!ext) throw new ErrorValidacion('La foto debe ser JPG, PNG o WEBP');
    let buffer: Buffer;
    try {
      buffer = await archivo.toBuffer();
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === 'FST_REQ_FILE_TOO_LARGE') throw new ErrorTamano('La foto supera el tamaño máximo de 5 MB');
      throw err;
    }
    if (!tipoImagenValido(archivo.mimetype, buffer)) throw new ErrorValidacion('La foto debe ser JPG, PNG o WEBP');
    await mkdir(config.carpetaFotos, { recursive: true });
    const nombre = `${id}.${ext}`;
    const rutaNueva = `/fotos/${nombre}`;
    // Orden importa: se escribe el archivo nuevo y se actualiza el producto
    // ANTES de borrar el anterior. Si la escritura fallara y se hubiera
    // borrado primero, el producto quedaría apuntando a un archivo que ya
    // no existe; con este orden, si algo falla antes de la actualización,
    // la foto anterior sigue intacta y el producto sigue apuntando a ella.
    await writeFile(join(config.carpetaFotos, nombre), buffer);
    const [p] = await app.db.update(producto).set({ foto: rutaNueva }).where(eq(producto.id, id)).returning();
    if (existe.foto && existe.foto !== rutaNueva) await borrarFotoAnterior(existe.foto);
    app.bus.emitir('catalogo');
    return p;
  });
}
