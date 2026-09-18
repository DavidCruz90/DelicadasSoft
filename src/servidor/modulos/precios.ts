import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, Tx } from '../db/conexion';
import { cambioPrecio, producto, usuario } from '../db/schema';
import { NoEncontrado, exigirUuid } from '../errores';
import { ADMIN } from '../seguridad/acceso';

// Regla 30. Se llama DENTRO de la transacción que cambia el precio, y solo
// cuando cambia de verdad (quien llama compara antes). Todo camino que
// escriba producto.precio pasa por aquí: hoy editarProducto (catalogo.ts);
// en el plan 3, la carga masiva por CSV. Un cambio de precio sin su registro
// es un error, igual que un cambio de stock sin movimiento_stock.
export async function registrarCambioPrecio(
  tx: Tx,
  datos: { productoId: string; precioAnterior: string; precioNuevo: string; usuarioId: string },
) {
  await tx.insert(cambioPrecio).values({
    producto_id: datos.productoId,
    precio_anterior: datos.precioAnterior,
    precio_nuevo: datos.precioNuevo,
    usuario_id: datos.usuarioId,
  });
}

export async function listarCambiosPrecio(db: Db, productoId: string) {
  const id = exigirUuid(productoId, 'El identificador del producto no es válido');
  const [p] = await db.select({ id: producto.id }).from(producto).where(eq(producto.id, id));
  if (!p) throw new NoEncontrado('El producto no existe');
  return db.select({
    id: cambioPrecio.id,
    precio_anterior: cambioPrecio.precio_anterior,
    precio_nuevo: cambioPrecio.precio_nuevo,
    usuario_id: cambioPrecio.usuario_id,
    usuario_nombre: usuario.nombre,
    creado_en: cambioPrecio.creado_en,
  }).from(cambioPrecio)
    .innerJoin(usuario, eq(cambioPrecio.usuario_id, usuario.id))
    .where(eq(cambioPrecio.producto_id, id))
    .orderBy(desc(cambioPrecio.creado_en));
}

export function rutasPrecios(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/admin/productos/:id/precios', { config: { acceso: ADMIN } }, async (req) => listarCambiosPrecio(app.db, req.params.id));
}
