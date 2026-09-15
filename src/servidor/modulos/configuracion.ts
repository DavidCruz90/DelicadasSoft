import type { Db } from '../db/conexion';
import { configuracion } from '../db/schema';

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
