import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { mesero } from '../db/schema';
import { ErrorNegocio, ErrorValidacion, NoEncontrado, exigirObjeto, exigirUuid } from '../errores';

export async function listarMeseros(db: Db) {
  return db.select().from(mesero).orderBy(mesero.nombre);
}

// Comprueba en la aplicacion que ningun otro mesero activo tenga el mismo
// nombre (sin distinguir mayusculas). Esto por si solo tiene una ventana
// entre la comprobacion y la escritura; el indice unico parcial
// mesero_nombre_activo_unico (migracion 0003) es la garantia real contra
// dos peticiones simultaneas, y traducirConflictoNombre() convierte su
// violacion en un 409 en vez de un 500.
async function verificarNombreUnico(db: Db, nombre: string, exceptoId?: string) {
  const [dup] = await db.select({ id: mesero.id }).from(mesero)
    .where(sql`lower(${mesero.nombre}) = lower(${nombre}) AND ${mesero.activo} = true ${exceptoId ? sql`AND ${mesero.id} <> ${exceptoId}` : sql``}`);
  if (dup) throw new ErrorNegocio('Ya existe un mesero con ese nombre');
}

// El nombre es lo unico que identifica a un mesero (no hay contrasenas), asi
// que se exige texto de verdad: rechaza numeros, booleanos, objetos, null y
// ausencia de valor con 400 antes de tocar la base.
function limpiarNombre(valor: unknown): string {
  if (typeof valor !== 'string') throw new ErrorValidacion('El nombre del mesero debe ser texto');
  const limpio = valor.trim();
  if (!limpio) throw new ErrorValidacion('El nombre del mesero no puede estar vacío');
  return limpio;
}

function traducirConflictoNombre(err: unknown): unknown {
  const e = err as { code?: string; constraint_name?: string } | null;
  if (e && e.code === '23505' && e.constraint_name === 'mesero_nombre_activo_unico') {
    return new ErrorNegocio('Ya existe un mesero con ese nombre');
  }
  return err;
}

export async function crearMesero(db: Db, datos: { nombre?: unknown }) {
  const nombre = limpiarNombre(datos.nombre);
  await verificarNombreUnico(db, nombre);
  try {
    const [m] = await db.insert(mesero).values({ nombre }).returning();
    return m;
  } catch (err) {
    throw traducirConflictoNombre(err);
  }
}

export async function editarMesero(db: Db, id: string, datos: { nombre?: unknown; activo?: unknown }) {
  exigirUuid(id, 'El identificador del mesero no es válido');
  const [existente] = await db.select().from(mesero).where(eq(mesero.id, id));
  if (!existente) throw new NoEncontrado('El mesero no existe');

  const nombreFinal = datos.nombre !== undefined ? limpiarNombre(datos.nombre) : existente.nombre;

  let activoFinal = existente.activo;
  if (datos.activo !== undefined) {
    if (typeof datos.activo !== 'boolean') throw new ErrorValidacion('El campo activo debe ser verdadero o falso');
    activoFinal = datos.activo;
  }

  // El nombre unico solo aplica entre activos: si el resultado final de esta
  // edicion (ya sea porque cambia el nombre, o porque reactiva al mesero)
  // deja a alguien activo, su nombre final no puede chocar con otro activo.
  if (activoFinal) await verificarNombreUnico(db, nombreFinal, id);

  try {
    const [m] = await db.update(mesero)
      .set({ nombre: nombreFinal, activo: activoFinal, actualizado_en: new Date() })
      .where(eq(mesero.id, id))
      .returning();
    return m;
  } catch (err) {
    throw traducirConflictoNombre(err);
  }
}

// Un cuerpo ausente (sin Content-Type o sin payload) llega como undefined:
// se trata como "sin datos", igual que en configuracion, y cada validacion
// de campo obligatorio (el nombre al crear) se encarga de rechazarlo despues.
function cuerpoComoObjeto(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) return {};
  return exigirObjeto(body);
}

export function rutasMeseros(app: FastifyInstance) {
  app.get('/api/admin/meseros', async () => listarMeseros(app.db));
  app.post('/api/admin/meseros', async (req, reply) => {
    const datos = cuerpoComoObjeto(req.body);
    const m = await crearMesero(app.db, datos as { nombre?: unknown });
    app.bus.emitir('config');
    return reply.status(201).send(m);
  });
  app.patch<{ Params: { id: string } }>('/api/admin/meseros/:id', async (req) => {
    const datos = cuerpoComoObjeto(req.body);
    const m = await editarMesero(app.db, req.params.id, datos as { nombre?: unknown; activo?: unknown });
    app.bus.emitir('config');
    return m;
  });
}
