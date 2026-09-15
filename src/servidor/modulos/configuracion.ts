import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { configuracion } from '../db/schema';
import { ErrorValidacion } from '../errores';

export type Configuracion = typeof configuracion.$inferSelect;

export async function asegurarConfiguracion(db: Db): Promise<Configuracion> {
  const [existente] = await db.select().from(configuracion).limit(1);
  if (existente) return existente;
  // Solo puede haber una fila (indice unico configuracion_fila_unica). Si dos
  // peticiones llegan a la vez y ninguna encontro fila todavia, la segunda
  // insercion choca con el indice; onConflictDoNothing evita el 500 y luego
  // leemos la fila que la otra peticion ya creo.
  const [nueva] = await db.insert(configuracion).values({}).onConflictDoNothing().returning();
  if (nueva) return nueva;
  const [creada] = await db.select().from(configuracion).limit(1);
  return creada;
}

export async function obtenerConfiguracion(db: Db): Promise<Configuracion> {
  return asegurarConfiguracion(db);
}

export type CamposEditables = Pick<Configuracion,
  'nombre_local' | 'simbolo_moneda' | 'cantidad_mesas' | 'propina_sugerida_pct' | 'umbral_stock_bajo' | 'cocina_activa' | 'sonido_cocina' | 'permitir_items_libres'>;

const EDITABLES: (keyof CamposEditables)[] = ['nombre_local', 'simbolo_moneda', 'cantidad_mesas', 'propina_sugerida_pct', 'umbral_stock_bajo', 'cocina_activa', 'sonido_cocina', 'permitir_items_libres'];

export async function actualizarConfiguracion(db: Db, cambios: Partial<CamposEditables>): Promise<Configuracion> {
  const actual = await asegurarConfiguracion(db);
  const limpio: Partial<CamposEditables> = {};
  for (const k of EDITABLES) if (k in cambios) (limpio as any)[k] = (cambios as any)[k];
  if (limpio.cantidad_mesas !== undefined && (!Number.isInteger(limpio.cantidad_mesas) || limpio.cantidad_mesas < 1 || limpio.cantidad_mesas > 200))
    throw new ErrorValidacion('La cantidad de mesas debe estar entre 1 y 200');
  if (limpio.umbral_stock_bajo !== undefined && (!Number.isInteger(limpio.umbral_stock_bajo) || limpio.umbral_stock_bajo < 0))
    throw new ErrorValidacion('El umbral de stock bajo debe ser un entero mayor o igual a 0');
  if (limpio.propina_sugerida_pct !== undefined) {
    const n = Number(limpio.propina_sugerida_pct);
    if (Number.isNaN(n) || n < 0 || n > 100) throw new ErrorValidacion('La propina sugerida debe estar entre 0 y 100');
    limpio.propina_sugerida_pct = n.toFixed(2);
  }
  if (limpio.nombre_local !== undefined && !String(limpio.nombre_local).trim()) throw new ErrorValidacion('El nombre del local no puede estar vacío');
  const [actualizada] = await db.update(configuracion).set({ ...limpio, actualizado_en: new Date() }).where(eq(configuracion.id, actual.id)).returning();
  return actualizada;
}

export function rutasConfiguracion(app: FastifyInstance) {
  app.get('/api/admin/configuracion', async () => obtenerConfiguracion(app.db));
  app.patch('/api/admin/configuracion', async (req) => {
    const r = await actualizarConfiguracion(app.db, (req.body ?? {}) as Partial<CamposEditables>);
    app.bus.emitir('config');
    return r;
  });
}
