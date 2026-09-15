import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { mesero } from '../db/schema';
import { ErrorNegocio, ErrorValidacion, NoEncontrado } from '../errores';

export async function listarMeseros(db: Db) {
  return db.select().from(mesero).orderBy(mesero.nombre);
}

// Postgres lanza un error de sintaxis (que el manejador global traduciria
// como 500) si se consulta una columna uuid con un texto que no tiene forma
// de uuid. Se valida antes de tocar la base para devolver un 400 claro.
const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validarUuid(id: string) {
  if (!PATRON_UUID.test(id)) throw new ErrorValidacion('El identificador del mesero no es válido');
}

async function verificarNombre(db: Db, nombre: string, exceptoId?: string) {
  const limpio = nombre.trim();
  if (!limpio) throw new ErrorValidacion('El nombre del mesero no puede estar vacío');
  const [dup] = await db.select({ id: mesero.id }).from(mesero)
    .where(sql`lower(${mesero.nombre}) = lower(${limpio}) AND ${mesero.activo} = true ${exceptoId ? sql`AND ${mesero.id} <> ${exceptoId}` : sql``}`);
  if (dup) throw new ErrorNegocio('Ya existe un mesero con ese nombre');
  return limpio;
}

export async function crearMesero(db: Db, datos: { nombre: string }) {
  const nombre = await verificarNombre(db, String(datos.nombre ?? ''));
  const [m] = await db.insert(mesero).values({ nombre }).returning();
  return m;
}

export async function editarMesero(db: Db, id: string, datos: { nombre?: string; activo?: boolean }) {
  validarUuid(id);
  const [existente] = await db.select().from(mesero).where(eq(mesero.id, id));
  if (!existente) throw new NoEncontrado('El mesero no existe');
  const cambios: Partial<typeof mesero.$inferInsert> = { actualizado_en: new Date() };
  if (datos.nombre !== undefined) cambios.nombre = await verificarNombre(db, datos.nombre, id);
  if (datos.activo !== undefined) cambios.activo = Boolean(datos.activo);
  const [m] = await db.update(mesero).set(cambios).where(eq(mesero.id, id)).returning();
  return m;
}

export function rutasMeseros(app: FastifyInstance) {
  app.get('/api/admin/meseros', async () => listarMeseros(app.db));
  app.post('/api/admin/meseros', async (req, reply) => {
    const m = await crearMesero(app.db, req.body as { nombre: string });
    app.bus.emitir('config');
    return reply.status(201).send(m);
  });
  app.patch<{ Params: { id: string } }>('/api/admin/meseros/:id', async (req) => {
    const m = await editarMesero(app.db, req.params.id, req.body as { nombre?: string; activo?: boolean });
    app.bus.emitir('config');
    return m;
  });
}
