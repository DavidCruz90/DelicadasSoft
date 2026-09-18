import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, Tx } from '../db/conexion';
import { sesion, usuario } from '../db/schema';
import { ErrorNegocio, ErrorValidacion, NoEncontrado, esViolacionUnica, exigirBooleano, exigirObjeto, exigirObjetoOpcional, exigirTexto, exigirUuid } from '../errores';
import { ROLES, type Rol } from '../../compartido/roles';
import { cifrarPin, exigirPin } from '../seguridad/pin';
import { ADMIN } from '../seguridad/acceso';

export type Usuario = typeof usuario.$inferSelect;
// Lo único que sale del servidor. pin_hash no sale nunca; tiene_pin es lo
// único que la pantalla necesita saber del PIN (para mostrar "Sin PIN").
export type UsuarioPublico = Omit<Usuario, 'pin_hash'> & { tiene_pin: boolean };

export function publico(u: Usuario): UsuarioPublico {
  const { pin_hash, ...resto } = u;
  return { ...resto, tiene_pin: pin_hash !== null };
}

export async function listarUsuarios(db: Db): Promise<UsuarioPublico[]> {
  const filas = await db.select().from(usuario).orderBy(asc(usuario.nombre));
  return filas.map(publico);
}

// Comprueba en la aplicacion que ningun otro usuario activo tenga el mismo
// nombre (sin distinguir mayusculas). El indice unico parcial
// usuario_nombre_activo_unico es la garantia real contra dos peticiones
// simultaneas; traducirConflictoNombre() convierte su violacion en 409.
async function verificarNombreUnico(db: Db | Tx, nombre: string, exceptoId?: string) {
  const [dup] = await db.select({ id: usuario.id }).from(usuario)
    .where(sql`lower(${usuario.nombre}) = lower(${nombre}) AND ${usuario.activo} = true ${exceptoId ? sql`AND ${usuario.id} <> ${exceptoId}` : sql``}`);
  if (dup) throw new ErrorNegocio('Ya existe un usuario con ese nombre');
}

function limpiarNombre(valor: unknown): string {
  return exigirTexto(valor, 'El nombre del usuario debe ser texto', 'El nombre del usuario no puede estar vacío');
}

export function exigirRol(valor: unknown, mensaje = 'El rol debe ser mesero, caja o admin'): Rol {
  if (typeof valor !== 'string' || !(ROLES as string[]).includes(valor)) throw new ErrorValidacion(mensaje);
  return valor as Rol;
}

// La violación del índice único parcial sale como 409 (sin esto salía como
// 500; la prueba de carrera de nombres lo detecta). esViolacionUnica mira en
// err y en err.cause porque Drizzle envuelve el error de Postgres.
function traducirConflictoNombre(err: unknown): unknown {
  if (esViolacionUnica(err, 'usuario_nombre_activo_unico')) return new ErrorNegocio('Ya existe un usuario con ese nombre');
  return err;
}

export async function hayAdminActivo(db: Db | Tx): Promise<boolean> {
  const [fila] = await db.select({ id: usuario.id }).from(usuario)
    .where(and(eq(usuario.rol, 'admin'), eq(usuario.activo, true))).limit(1);
  return fila !== undefined;
}

// Recibe Db | Tx porque la instalación inicial (Task 5) lo llama dentro de
// su propia transacción.
export async function crearUsuario(db: Db | Tx, datos: { nombre?: unknown; rol?: unknown; pin?: unknown }): Promise<UsuarioPublico> {
  const nombre = limpiarNombre(datos.nombre);
  const rol = exigirRol(datos.rol);
  const pin = exigirPin(datos.pin);
  await verificarNombreUnico(db, nombre);
  const pin_hash = await cifrarPin(pin);
  try {
    const [u] = await db.insert(usuario).values({ nombre, rol, pin_hash }).returning();
    return publico(u);
  } catch (err) {
    throw traducirConflictoNombre(err);
  }
}

export async function editarUsuario(db: Db, id: string, datos: { nombre?: unknown; rol?: unknown; activo?: unknown }): Promise<UsuarioPublico> {
  exigirUuid(id, 'El identificador del usuario no es válido');

  const cambios: Partial<typeof usuario.$inferInsert> = {};
  if (datos.nombre !== undefined) cambios.nombre = limpiarNombre(datos.nombre);
  if (datos.rol !== undefined) cambios.rol = exigirRol(datos.rol);
  if (datos.activo !== undefined) cambios.activo = exigirBooleano(datos.activo, 'El estado activo del usuario debe ser verdadero o falso');

  // Patrón único de edición (el mismo que editarProducto y editarCategoria):
  // fila leída con SELECT ... FOR UPDATE dentro de la transacción que la
  // escribe, y solo los campos recibidos.
  return db.transaction(async (tx) => {
    // Regla 27: para saber si este es el último admin activo hay que bloquear
    // a TODOS los admins activos, no solo la fila editada. Si dos peticiones
    // desactivan a la vez a los dos únicos admins, cada una contaría al otro
    // como vigente y las dos pasarían: el sistema quedaría sin admin. Con
    // FOR UPDATE sobre todos (en orden fijo de id para que dos ediciones
    // simultáneas no se bloqueen mutuamente), la segunda espera a la primera
    // y, al retomar, vuelve a leer las filas ya confirmadas.
    const adminsActivos = await tx.select({ id: usuario.id }).from(usuario)
      .where(and(eq(usuario.rol, 'admin'), eq(usuario.activo, true)))
      .orderBy(asc(usuario.id))
      .for('update');
    const [existente] = await tx.select().from(usuario).where(eq(usuario.id, id)).for('update');
    if (!existente) throw new NoEncontrado('El usuario no existe');

    const nombreFinal = cambios.nombre ?? existente.nombre;
    const rolFinal = cambios.rol ?? existente.rol;
    const activoFinal = cambios.activo ?? existente.activo;
    const eraAdminActivo = existente.rol === 'admin' && existente.activo;
    const sigueAdminActivo = rolFinal === 'admin' && activoFinal;
    const otrosAdmins = adminsActivos.filter((a) => a.id !== id).length;
    if (eraAdminActivo && !sigueAdminActivo && otrosAdmins === 0) {
      throw new ErrorNegocio('No se puede desactivar ni cambiar de rol al último administrador activo');
    }
    if (activoFinal) await verificarNombreUnico(tx, nombreFinal, id);
    if (Object.keys(cambios).length === 0) return publico(existente);

    try {
      const [u] = await tx.update(usuario).set(cambios).where(eq(usuario.id, id)).returning();
      // Pasar de activo a inactivo cierra sus sesiones en la misma transacción
      // (mismo criterio que cambiar el PIN). Sin esto la sesión solo quedaba
      // negada mientras el usuario estuviera inactivo: una sesión de mesero no
      // vence nunca, y al reactivarlo la cookie vieja volvía a entrar sin PIN.
      // Cambiar de rol también cierra: la capa 3 lee el rol fresco, pero
      // expira_en conserva el plazo del rol viejo hasta la siguiente petición
      // manual (un mesero ascendido a admin, con la pantalla recargando sola,
      // quedaría con una sesión de admin sin vencimiento). Cambiar de rol es
      // volver a entrar. Renombrar no cierra nada.
      if ((existente.activo && !activoFinal) || rolFinal !== existente.rol) await cerrarSesionesDe(tx, id);
      return publico(u);
    } catch (err) {
      throw traducirConflictoNombre(err);
    }
  });
}

// Cierra todas las sesiones vivas de un usuario. La tabla `sesion` existe desde
// Task 1; no se importa `sesiones.ts` para no crear dependencia hacia atrás.
async function cerrarSesionesDe(tx: Db | Tx, id: string) {
  await tx.update(sesion).set({ cerrada_en: new Date() })
    .where(and(eq(sesion.usuario_id, id), isNull(sesion.cerrada_en)));
}

// Decisión de Dave del 2026-09-17: cambiarle el PIN a alguien lo saca al
// instante de donde tenga abierto. Es lo que se espera al cambiar una clave, y
// permite cortar de verdad si se sospecha que otro la conoce. Va en la misma
// transacción que el PIN nuevo: no puede quedar el PIN cambiado con la sesión
// viva. No importa `sesiones.ts` (Task 4) para no crear dependencia hacia
// atrás; la tabla `sesion` existe desde Task 1.
export async function cambiarPin(db: Db, id: string, datos: { pin?: unknown }): Promise<UsuarioPublico> {
  exigirUuid(id, 'El identificador del usuario no es válido');
  const pin = exigirPin(datos.pin);
  const pin_hash = await cifrarPin(pin);
  return db.transaction(async (tx) => {
    const [u] = await tx.update(usuario).set({ pin_hash }).where(eq(usuario.id, id)).returning();
    if (!u) throw new NoEncontrado('El usuario no existe');
    await cerrarSesionesDe(tx, id);
    return publico(u);
  });
}

// Recuperación con acceso físico (spec 5.5). Busca al administrador activo
// por nombre sin distinguir mayúsculas y le escribe el PIN. La llama solo el
// comando restablecer-pin (Task 5): a propósito NO tiene ruta HTTP.
export async function restablecerPinAdmin(db: Db, nombre: unknown, pin: unknown): Promise<UsuarioPublico> {
  const limpio = limpiarNombre(nombre);
  const pinLimpio = exigirPin(pin);
  const [admin] = await db.select().from(usuario)
    .where(sql`lower(${usuario.nombre}) = lower(${limpio}) AND ${usuario.rol} = 'admin' AND ${usuario.activo} = true`);
  if (!admin) throw new NoEncontrado(`No hay un administrador activo llamado "${limpio}"`);
  return cambiarPin(db, admin.id, { pin: pinLimpio });
}

export function rutasUsuarios(app: FastifyInstance) {
  app.get('/api/admin/usuarios', { config: { acceso: ADMIN } }, async () => listarUsuarios(app.db));
  app.post('/api/admin/usuarios', { config: { acceso: ADMIN } }, async (req, reply) => {
    // Un cuerpo ausente vale como objeto vacío: limpiarNombre lo rechaza
    // después con el mensaje del nombre, no con uno genérico de cuerpo.
    const datos = exigirObjetoOpcional(req.body);
    const u = await crearUsuario(app.db, datos);
    app.bus.emitir('config');
    return reply.status(201).send(u);
  });
  app.patch<{ Params: { id: string } }>('/api/admin/usuarios/:id', { config: { acceso: ADMIN } }, async (req) => {
    const datos = exigirObjetoOpcional(req.body);
    const u = await editarUsuario(app.db, req.params.id, datos);
    app.bus.emitir('config');
    return u;
  });
  app.post<{ Params: { id: string } }>('/api/admin/usuarios/:id/pin', { config: { acceso: ADMIN } }, async (req) => {
    const datos = exigirObjeto(req.body);
    return cambiarPin(app.db, req.params.id, datos);
  });
}
