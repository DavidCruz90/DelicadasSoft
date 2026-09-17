import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, Tx } from '../db/conexion';
import { mesero } from '../db/schema';
import { ErrorNegocio, NoEncontrado, exigirBooleano, exigirObjetoOpcional, exigirTexto, exigirUuid } from '../errores';

export async function listarMeseros(db: Db) {
  return db.select().from(mesero).orderBy(mesero.nombre);
}

// Comprueba en la aplicacion que ningun otro mesero activo tenga el mismo
// nombre (sin distinguir mayusculas). Esto por si solo tiene una ventana
// entre la comprobacion y la escritura; el indice unico parcial
// mesero_nombre_activo_unico (migracion 0003) es la garantia real contra
// dos peticiones simultaneas, y traducirConflictoNombre() convierte su
// violacion en un 409 en vez de un 500.
async function verificarNombreUnico(db: Db | Tx, nombre: string, exceptoId?: string) {
  const [dup] = await db.select({ id: mesero.id }).from(mesero)
    .where(sql`lower(${mesero.nombre}) = lower(${nombre}) AND ${mesero.activo} = true ${exceptoId ? sql`AND ${mesero.id} <> ${exceptoId}` : sql``}`);
  if (dup) throw new ErrorNegocio('Ya existe un mesero con ese nombre');
}

// El nombre es lo unico que identifica a un mesero (no hay contrasenas), asi
// que se exige texto de verdad: rechaza numeros, booleanos, objetos, null y
// ausencia de valor con 400 antes de tocar la base.
function limpiarNombre(valor: unknown): string {
  return exigirTexto(valor, 'El nombre del mesero debe ser texto', 'El nombre del mesero no puede estar vacío');
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

  const cambios: Partial<typeof mesero.$inferInsert> = {};
  if (datos.nombre !== undefined) cambios.nombre = limpiarNombre(datos.nombre);
  if (datos.activo !== undefined) cambios.activo = exigirBooleano(datos.activo, 'El estado activo del mesero debe ser verdadero o falso');

  // Patrón único de edición (el mismo que editarProducto): la fila se lee
  // con SELECT ... FOR UPDATE dentro de la transacción que la escribe, y se
  // escriben solo los campos que llegaron en la petición. Leer sin bloqueo
  // y escribir todos los campos perdía cambios: un PATCH {activo:false}
  // que esperaba el bloqueo detrás de un renombre ya confirmado volvía a
  // escribir el nombre viejo al retomar.
  return db.transaction(async (tx) => {
    const [existente] = await tx.select().from(mesero).where(eq(mesero.id, id)).for('update');
    if (!existente) throw new NoEncontrado('El mesero no existe');

    // El nombre unico solo aplica entre activos: si el resultado final de
    // esta edicion (ya sea porque cambia el nombre, o porque reactiva al
    // mesero) deja a alguien activo, su nombre final no puede chocar con
    // otro activo.
    const nombreFinal = cambios.nombre ?? existente.nombre;
    const activoFinal = cambios.activo ?? existente.activo;
    if (activoFinal) await verificarNombreUnico(tx, nombreFinal, id);
    if (Object.keys(cambios).length === 0) return existente;

    try {
      const [m] = await tx.update(mesero).set(cambios).where(eq(mesero.id, id)).returning();
      return m;
    } catch (err) {
      throw traducirConflictoNombre(err);
    }
  });
}

export function rutasMeseros(app: FastifyInstance) {
  app.get('/api/admin/meseros', async () => listarMeseros(app.db));
  app.post('/api/admin/meseros', async (req, reply) => {
    // Un cuerpo ausente vale como objeto vacio: limpiarNombre lo rechaza
    // despues con el mensaje del nombre, no con uno generico de cuerpo.
    const datos = exigirObjetoOpcional(req.body);
    const m = await crearMesero(app.db, datos as { nombre?: unknown });
    app.bus.emitir('config');
    return reply.status(201).send(m);
  });
  app.patch<{ Params: { id: string } }>('/api/admin/meseros/:id', async (req) => {
    const datos = exigirObjetoOpcional(req.body);
    const m = await editarMesero(app.db, req.params.id, datos as { nombre?: unknown; activo?: unknown });
    app.bus.emitir('config');
    return m;
  });
}
