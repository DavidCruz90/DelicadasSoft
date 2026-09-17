import { asc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db } from '../db/conexion';
import { categoria, producto, movimientoStock, jornada } from '../db/schema';
import { ErrorNegocio, ErrorValidacion, NoEncontrado, exigirObjeto, exigirUuid } from '../errores';
import { config } from '../config';

export type Categoria = typeof categoria.$inferSelect;
export type Producto = typeof producto.$inferSelect;

// Tope para columnas integer de PostgreSQL que aquí solo guardan cantidades
// razonables (stock, orden de aparición): sin este límite, un número enorme
// (p. ej. 99999999999) desborda el entero de la base y produce un 500 en vez
// de un 400 claro. Ver docs/APRENDIZAJES.md, entrada de la ronda de arreglo 1
// de la Tarea 4: el mismo defecto ya se detectó en umbral_stock_bajo.
const ENTERO_MAXIMO = 1_000_000;
const PATRON_NUMERO_LIMPIO = /^\d+(\.\d+)?$/;

// El precio admite un numero o una cadena numerica limpia (igual que la
// propina en configuracion.ts), nunca un booleano ni null: Number(true) da 1
// y Number(null) da 0, y ambos colarian sin esta comprobacion de tipo.
function precioValido(v: unknown): string {
  let n: number;
  if (typeof v === 'number') {
    if (Number.isNaN(v)) throw new ErrorValidacion('El precio debe ser un número mayor o igual a 0');
    n = v;
  } else if (typeof v === 'string' && PATRON_NUMERO_LIMPIO.test(v.trim())) {
    n = Number(v.trim());
  } else {
    throw new ErrorValidacion('El precio debe ser un número mayor o igual a 0');
  }
  if (n < 0) throw new ErrorValidacion('El precio debe ser un número mayor o igual a 0');
  return n.toFixed(2);
}

function textoObligatorio(v: unknown, mensajeTipo: string, mensajeVacio: string): string {
  if (typeof v !== 'string') throw new ErrorValidacion(mensajeTipo);
  const t = v.trim();
  if (!t) throw new ErrorValidacion(mensajeVacio);
  return t;
}

// stock y orden son columnas integer normales (no numeric): exigimos
// typeof 'number' en vez de convertir con Number(), porque una cadena como
// "12" o un booleano no deben colarse en silencio como en el defecto ya
// corregido en la Tarea 4 (ver APRENDIZAJES.md).
function enteroEnRango(v: unknown, mensaje: string, maximo = ENTERO_MAXIMO): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > maximo) throw new ErrorValidacion(mensaje);
  return v;
}

function booleanoObligatorio(v: unknown, mensaje: string): boolean {
  if (typeof v !== 'boolean') throw new ErrorValidacion(mensaje);
  return v;
}

// ---- Categorías

export async function listarCategorias(db: Db) {
  return db.select().from(categoria).orderBy(asc(categoria.orden), asc(categoria.nombre));
}

export async function crearCategoria(db: Db, datos: { nombre?: unknown; orden?: unknown }) {
  const nombre = textoObligatorio(
    datos.nombre,
    'El nombre de la categoría debe ser texto',
    'El nombre de la categoría no puede estar vacío',
  );
  const orden = datos.orden !== undefined ? enteroEnRango(datos.orden, 'El orden debe ser un entero entre 0 y 1000000') : 0;
  const [c] = await db.insert(categoria).values({ nombre, orden }).returning();
  return c;
}

export async function editarCategoria(db: Db, id: string, datos: { nombre?: unknown; orden?: unknown; activa?: unknown }) {
  exigirUuid(id, 'El identificador de la categoría no es válido');
  const [existe] = await db.select().from(categoria).where(eq(categoria.id, id));
  if (!existe) throw new NoEncontrado('La categoría no existe');

  const cambios: Partial<typeof categoria.$inferInsert> = {};
  if (datos.nombre !== undefined) {
    cambios.nombre = textoObligatorio(
      datos.nombre,
      'El nombre de la categoría debe ser texto',
      'El nombre de la categoría no puede estar vacío',
    );
  }
  if (datos.orden !== undefined) cambios.orden = enteroEnRango(datos.orden, 'El orden debe ser un entero entre 0 y 1000000');
  if (datos.activa !== undefined) cambios.activa = booleanoObligatorio(datos.activa, 'El campo activa debe ser verdadero o falso');

  const [c] = await db.update(categoria).set({ ...cambios, actualizado_en: new Date() }).where(eq(categoria.id, id)).returning();
  return c;
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

async function validarProducto(db: Db, datos: DatosProducto, esNuevo: boolean) {
  const cambios: Partial<typeof producto.$inferInsert> = {};

  if (esNuevo || datos.categoria_id !== undefined) {
    const categoriaId = exigirUuid(datos.categoria_id, 'La categoría no es válida');
    const [c] = await db.select({ id: categoria.id }).from(categoria).where(eq(categoria.id, categoriaId));
    if (!c) throw new NoEncontrado('La categoría no existe');
    cambios.categoria_id = c.id;
  }

  if (esNuevo || datos.nombre !== undefined) {
    cambios.nombre = textoObligatorio(
      datos.nombre,
      'El nombre del producto debe ser texto',
      'El nombre del producto no puede estar vacío',
    );
  }

  if (esNuevo || datos.precio !== undefined) cambios.precio = precioValido(datos.precio);

  if (datos.descripcion !== undefined) {
    if (datos.descripcion !== null && typeof datos.descripcion !== 'string') {
      throw new ErrorValidacion('La descripción debe ser texto');
    }
    const t = typeof datos.descripcion === 'string' ? datos.descripcion.trim() : '';
    cambios.descripcion = t ? t : null;
  }

  if (datos.activo !== undefined) cambios.activo = booleanoObligatorio(datos.activo, 'El campo activo debe ser verdadero o falso');

  if (datos.orden !== undefined) cambios.orden = enteroEnRango(datos.orden, 'El orden debe ser un entero entre 0 y 1000000');

  if (esNuevo || datos.controla_stock !== undefined) {
    const controlaStock = booleanoObligatorio(datos.controla_stock, 'El campo controla_stock debe ser verdadero o falso');
    cambios.controla_stock = controlaStock;
    if (controlaStock) {
      if (datos.stock_actual === undefined) throw new ErrorValidacion('Un producto con control de stock necesita stock inicial');
      cambios.stock_actual = enteroEnRango(datos.stock_actual, 'El stock debe ser un entero entre 0 y 1000000');
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

export async function crearProducto(db: Db, datos: DatosProducto) {
  const cambios = await validarProducto(db, datos, true);
  const [p] = await db.insert(producto).values(cambios as typeof producto.$inferInsert).returning();
  return p;
}

export async function editarProducto(db: Db, id: string, datos: DatosProducto) {
  exigirUuid(id, 'El identificador del producto no es válido');
  const [existe] = await db.select().from(producto).where(eq(producto.id, id));
  if (!existe) throw new NoEncontrado('El producto no existe');
  const cambios = await validarProducto(db, datos, false);
  const [p] = await db.update(producto).set({ ...cambios, actualizado_en: new Date() }).where(eq(producto.id, id)).returning();
  return p;
}

export async function ajustarStock(db: Db, productoId: string, datos: { stock?: unknown; motivo?: unknown; origen?: unknown }) {
  exigirUuid(productoId, 'El identificador del producto no es válido');
  const motivo = textoObligatorio(
    datos.motivo,
    'El motivo del ajuste debe ser texto',
    'El ajuste de stock necesita un motivo',
  );
  if (typeof datos.stock !== 'number' || !Number.isInteger(datos.stock)) throw new ErrorValidacion('El stock debe ser un número entero');
  if (datos.stock < 0) throw new ErrorValidacion('El stock no puede ser negativo');
  if (datos.stock > ENTERO_MAXIMO) throw new ErrorValidacion('El stock debe ser un entero entre 0 y 1000000');
  if (datos.origen !== undefined && datos.origen !== 'ajuste_manual' && datos.origen !== 'apertura') {
    throw new ErrorValidacion('El origen del ajuste no es válido');
  }
  const origen = (datos.origen as 'ajuste_manual' | 'apertura' | undefined) ?? 'ajuste_manual';
  const nuevo = datos.stock;

  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(producto).where(eq(producto.id, productoId)).for('update');
    if (!p) throw new NoEncontrado('El producto no existe');
    if (!p.controla_stock) throw new ErrorNegocio('Este producto no controla stock');
    const [abierta] = await tx.select({ id: jornada.id }).from(jornada).where(isNull(jornada.cerrada_en));
    const [actualizado] = await tx.update(producto).set({ stock_actual: nuevo, actualizado_en: new Date() }).where(eq(producto.id, productoId)).returning();
    await tx.insert(movimientoStock).values({
      producto_id: productoId,
      jornada_id: abierta?.id ?? null,
      cantidad: nuevo - (p.stock_actual ?? 0),
      stock_resultante: nuevo,
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

// Un cuerpo ausente (sin Content-Type o sin payload) llega como undefined:
// se trata como "sin datos" en PATCH, igual que en configuracion y meseros.
// Un cuerpo presente pero que no sea un objeto (texto, numero, arreglo) sí
// se rechaza con 400.
function cuerpoComoObjeto(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) return {};
  return exigirObjeto(body);
}

export function rutasCatalogo(app: FastifyInstance) {
  app.get('/api/catalogo', async () => obtenerCatalogo(app.db));

  app.get('/api/admin/categorias', async () => listarCategorias(app.db));
  app.post('/api/admin/categorias', async (req, reply) => {
    const datos = exigirObjeto(req.body);
    const c = await crearCategoria(app.db, datos);
    app.bus.emitir('catalogo');
    return reply.status(201).send(c);
  });
  app.patch<{ Params: { id: string } }>('/api/admin/categorias/:id', async (req) => {
    const datos = cuerpoComoObjeto(req.body);
    const c = await editarCategoria(app.db, req.params.id, datos);
    app.bus.emitir('catalogo');
    return c;
  });

  app.get('/api/admin/productos', async () => listarProductos(app.db));
  app.post('/api/admin/productos', async (req, reply) => {
    const datos = exigirObjeto(req.body);
    const p = await crearProducto(app.db, datos);
    app.bus.emitir('catalogo');
    return reply.status(201).send(p);
  });
  app.patch<{ Params: { id: string } }>('/api/admin/productos/:id', async (req) => {
    const datos = cuerpoComoObjeto(req.body);
    const p = await editarProducto(app.db, req.params.id, datos);
    app.bus.emitir('catalogo');
    return p;
  });
  app.post<{ Params: { id: string } }>('/api/admin/productos/:id/stock', async (req) => {
    const datos = exigirObjeto(req.body);
    const p = await ajustarStock(app.db, req.params.id, datos);
    app.bus.emitir('stock', { producto_id: p.id, stock_actual: p.stock_actual });
    return p;
  });
  app.post<{ Params: { id: string } }>('/api/admin/productos/:id/foto', async (req) => {
    const id = exigirUuid(req.params.id, 'El identificador del producto no es válido');
    const [existe] = await app.db.select().from(producto).where(eq(producto.id, id));
    if (!existe) throw new NoEncontrado('El producto no existe');
    const archivo = await req.file({ limits: { fileSize: 5 * 1024 * 1024 } });
    if (!archivo) throw new ErrorValidacion('Falta el archivo de foto');
    const ext = EXTENSIONES[archivo.mimetype];
    if (!ext) throw new ErrorValidacion('La foto debe ser JPG, PNG o WEBP');
    await mkdir(config.carpetaFotos, { recursive: true });
    const nombre = `${id}.${ext}`;
    await writeFile(join(config.carpetaFotos, nombre), await archivo.toBuffer());
    const [p] = await app.db.update(producto).set({ foto: `/fotos/${nombre}`, actualizado_en: new Date() }).where(eq(producto.id, id)).returning();
    app.bus.emitir('catalogo');
    return p;
  });
}
