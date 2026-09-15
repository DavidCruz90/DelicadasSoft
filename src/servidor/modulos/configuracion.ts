import type { Db } from '../db/conexion';
import { configuracion } from '../db/schema';

export type Configuracion = typeof configuracion.$inferSelect;

export async function asegurarConfiguracion(db: Db): Promise<Configuracion> {
  const [existente] = await db.select().from(configuracion).limit(1);
  if (existente) return existente;
  const [nueva] = await db.insert(configuracion).values({}).returning();
  return nueva;
}

export async function obtenerConfiguracion(db: Db): Promise<Configuracion> {
  return asegurarConfiguracion(db);
}
