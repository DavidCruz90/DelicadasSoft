import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { configuracion } from '../db/schema';
import { ErrorValidacion, exigirObjeto } from '../errores';

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

const INTERRUPTORES: (keyof CamposEditables)[] = ['cocina_activa', 'sonido_cocina', 'permitir_items_libres'];
const UMBRAL_STOCK_MAXIMO = 1_000_000;
const SIMBOLO_MONEDA_LARGO_MAXIMO = 5;
const PATRON_NUMERO_LIMPIO = /^\d+(\.\d+)?$/;

// Exige un texto no vacio (y lo recorta) para un campo de configuracion.
// typeof descarta numeros, booleanos, objetos y null: "null" no debe colarse
// como el texto literal "null" via String(null).
function limpiarTexto(valor: unknown, nombreCampo: string): string {
  if (typeof valor !== 'string') throw new ErrorValidacion(`El campo ${nombreCampo} debe ser texto`);
  const limpio = valor.trim();
  if (!limpio) throw new ErrorValidacion(`El campo ${nombreCampo} no puede estar vacío`);
  return limpio;
}

// La propina admite un numero o una cadena numerica limpia (sin simbolos ni
// espacios internos), nunca un booleano: Number(true) da 1 y colaria sin
// esta comprobacion de tipo.
function limpiarNumero(valor: unknown, nombreCampo: string): number {
  if (typeof valor === 'number') {
    if (Number.isNaN(valor)) throw new ErrorValidacion(`El campo ${nombreCampo} debe ser un número`);
    return valor;
  }
  if (typeof valor === 'string' && PATRON_NUMERO_LIMPIO.test(valor.trim())) return Number(valor.trim());
  throw new ErrorValidacion(`El campo ${nombreCampo} debe ser un número`);
}

export async function actualizarConfiguracion(db: Db, cambios: Partial<Record<keyof CamposEditables, unknown>>): Promise<Configuracion> {
  const actual = await asegurarConfiguracion(db);
  const limpio: Partial<CamposEditables> = {};

  if (cambios.nombre_local !== undefined) limpio.nombre_local = limpiarTexto(cambios.nombre_local, 'nombre_local');
  if (cambios.simbolo_moneda !== undefined) {
    const t = limpiarTexto(cambios.simbolo_moneda, 'simbolo_moneda');
    if (t.length > SIMBOLO_MONEDA_LARGO_MAXIMO) throw new ErrorValidacion(`El símbolo de moneda no puede tener más de ${SIMBOLO_MONEDA_LARGO_MAXIMO} caracteres`);
    limpio.simbolo_moneda = t;
  }
  for (const campo of INTERRUPTORES) {
    const valor = cambios[campo];
    if (valor === undefined) continue;
    if (typeof valor !== 'boolean') throw new ErrorValidacion(`El campo ${campo} debe ser verdadero o falso`);
    (limpio as any)[campo] = valor;
  }
  if (cambios.cantidad_mesas !== undefined) {
    const n = cambios.cantidad_mesas;
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 200)
      throw new ErrorValidacion('La cantidad de mesas debe estar entre 1 y 200');
    limpio.cantidad_mesas = n as number;
  }
  if (cambios.umbral_stock_bajo !== undefined) {
    const n = cambios.umbral_stock_bajo;
    if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > UMBRAL_STOCK_MAXIMO)
      throw new ErrorValidacion(`El umbral de stock bajo debe ser un entero entre 0 y ${UMBRAL_STOCK_MAXIMO}`);
    limpio.umbral_stock_bajo = n as number;
  }
  if (cambios.propina_sugerida_pct !== undefined) {
    const n = limpiarNumero(cambios.propina_sugerida_pct, 'propina_sugerida_pct');
    if (n < 0 || n > 100) throw new ErrorValidacion('La propina sugerida debe estar entre 0 y 100');
    limpio.propina_sugerida_pct = n.toFixed(2);
  }

  const [actualizada] = await db.update(configuracion).set({ ...limpio, actualizado_en: new Date() }).where(eq(configuracion.id, actual.id)).returning();
  return actualizada;
}

// Un cuerpo ausente (sin Content-Type o sin payload) llega como undefined:
// se trata como "sin cambios" y la peticion responde 200 sin modificar nada.
// Un cuerpo presente pero que no sea un objeto (texto, numero, arreglo) si
// se rechaza con 400.
function cuerpoComoObjeto(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) return {};
  return exigirObjeto(body);
}

export function rutasConfiguracion(app: FastifyInstance) {
  app.get('/api/admin/configuracion', async () => obtenerConfiguracion(app.db));
  app.patch('/api/admin/configuracion', async (req) => {
    const cambios = cuerpoComoObjeto(req.body);
    const r = await actualizarConfiguracion(app.db, cambios);
    app.bus.emitir('config');
    return r;
  });
}
