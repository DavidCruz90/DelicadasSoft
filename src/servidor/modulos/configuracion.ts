import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { configuracion } from '../db/schema';
import { ErrorValidacion, exigirBooleano, exigirEntero, exigirMonto, exigirObjetoOpcional, exigirTexto } from '../errores';

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

// Los mensajes nombran cada interruptor como lo ve el dueño en la pantalla,
// no por su nombre de columna.
const INTERRUPTORES: Record<'cocina_activa' | 'sonido_cocina' | 'permitir_items_libres', string> = {
  cocina_activa: 'La cocina activa debe ser verdadero o falso',
  sonido_cocina: 'El sonido de cocina debe ser verdadero o falso',
  permitir_items_libres: 'Permitir ítems libres debe ser verdadero o falso',
};
const UMBRAL_STOCK_MAXIMO = 1_000_000;
const SIMBOLO_MONEDA_LARGO_MAXIMO = 5;
const PROPINA_MAXIMA_PCT = 100;

export async function actualizarConfiguracion(db: Db, cambios: Partial<Record<keyof CamposEditables, unknown>>): Promise<Configuracion> {
  const actual = await asegurarConfiguracion(db);
  const limpio: Partial<CamposEditables> = {};

  if (cambios.nombre_local !== undefined) {
    limpio.nombre_local = exigirTexto(cambios.nombre_local, 'El nombre del local debe ser texto', 'El nombre del local no puede estar vacío');
  }
  if (cambios.simbolo_moneda !== undefined) {
    const t = exigirTexto(cambios.simbolo_moneda, 'El símbolo de moneda debe ser texto', 'El símbolo de moneda no puede estar vacío');
    if (t.length > SIMBOLO_MONEDA_LARGO_MAXIMO) throw new ErrorValidacion(`El símbolo de moneda no puede tener más de ${SIMBOLO_MONEDA_LARGO_MAXIMO} caracteres`);
    limpio.simbolo_moneda = t;
  }
  for (const campo of Object.keys(INTERRUPTORES) as (keyof typeof INTERRUPTORES)[]) {
    if (cambios[campo] !== undefined) limpio[campo] = exigirBooleano(cambios[campo], INTERRUPTORES[campo]);
  }
  if (cambios.cantidad_mesas !== undefined) {
    limpio.cantidad_mesas = exigirEntero(cambios.cantidad_mesas, 'La cantidad de mesas debe estar entre 1 y 200', { minimo: 1, maximo: 200 });
  }
  if (cambios.umbral_stock_bajo !== undefined) {
    limpio.umbral_stock_bajo = exigirEntero(cambios.umbral_stock_bajo, `El umbral de stock bajo debe ser un entero entre 0 y ${UMBRAL_STOCK_MAXIMO}`, { maximo: UMBRAL_STOCK_MAXIMO });
  }
  if (cambios.propina_sugerida_pct !== undefined) {
    // Pasa por exigirMonto como todo numero con dos decimales: numero o
    // cadena numerica limpia, nunca booleano, y un tercer decimal (12.555)
    // se rechaza en vez de redondearse en silencio.
    limpio.propina_sugerida_pct = exigirMonto(
      cambios.propina_sugerida_pct,
      `La propina sugerida debe ser un número entre 0 y ${PROPINA_MAXIMA_PCT}, con hasta 2 decimales`,
      { maximo: PROPINA_MAXIMA_PCT },
    );
  }

  // Drizzle rechaza un UPDATE sin columnas ("No values to set"): sin cambios
  // se devuelve la fila actual sin escribir nada.
  if (Object.keys(limpio).length === 0) return actual;
  const [actualizada] = await db.update(configuracion).set(limpio).where(eq(configuracion.id, actual.id)).returning();
  return actualizada;
}

export function rutasConfiguracion(app: FastifyInstance) {
  app.get('/api/admin/configuracion', async () => obtenerConfiguracion(app.db));
  app.patch('/api/admin/configuracion', async (req) => {
    // Sin cuerpo: responde 200 sin modificar nada.
    const cambios = exigirObjetoOpcional(req.body);
    const r = await actualizarConfiguracion(app.db, cambios);
    app.bus.emitir('config');
    return r;
  });
}
