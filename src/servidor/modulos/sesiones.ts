import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, Tx } from '../db/conexion';
import { intentoFallido, sesion, usuario } from '../db/schema';
import { ErrorAcceso, exigirObjeto, exigirUuid } from '../errores';
import type { Rol } from '../../compartido/roles';
import { publico, type Usuario, type UsuarioPublico } from './usuarios';
import { HASH_SENUELO, exigirPin, verificarPin } from '../seguridad/pin';
import { generarToken, huellaToken } from '../seguridad/tokens';
import { NOMBRE_COOKIE_SESION, cookieBorrada, cookieSesion } from '../seguridad/cookies';
import { BLOQUEO_MIN, MAXIMO_FALLOS, registrarFalloDeDispositivo, reiniciarFallosDeDispositivo, type Dispositivo } from './dispositivos';
import { SOLO_DISPOSITIVO, TODOS } from '../seguridad/acceso';

export type Sesion = typeof sesion.$inferSelect;
export type SesionViva = { sesion: Sesion; usuario: UsuarioPublico };

// Spec 2 y 4.3: caja 30 minutos de inactividad, admin 15, mesero nunca (su
// sesión la cierra "Salir" o el cierre de la jornada, regla 29).
export const DURACION_SESION_MIN: Record<Rol, number | null> = { mesero: null, caja: 30, admin: 15 };

function expiracionPara(rol: Rol): Date | null {
  const minutos = DURACION_SESION_MIN[rol];
  return minutos === null ? null : new Date(Date.now() + minutos * 60000);
}

// Lista para el teclado de PIN: activos con PIN, y solo id, nombre y rol.
// Nada del PIN sale nunca, ni siquiera tiene_pin (aquí todos lo tienen).
export async function listarUsuariosParaEntrar(db: Db): Promise<{ id: string; nombre: string; rol: Rol }[]> {
  return db.select({ id: usuario.id, nombre: usuario.nombre, rol: usuario.rol }).from(usuario)
    .where(and(eq(usuario.activo, true), isNotNull(usuario.pin_hash)))
    .orderBy(asc(usuario.nombre));
}

// Abre una sesión para un usuario YA verificado. La llaman iniciarSesion
// (después del PIN), la instalación inicial (Task 5) y las pruebas. El token
// sale de aquí una sola vez; en la base queda su huella. Se salta el PIN a
// propósito: solo para pruebas y para la instalación; nunca exponer por una ruta.
export async function abrirSesion(db: Db | Tx, u: Usuario | UsuarioPublico, dispositivoId: string | null): Promise<{ token: string; sesion: Sesion }> {
  const token = generarToken();
  const [s] = await db.insert(sesion).values({
    usuario_id: u.id,
    dispositivo_id: dispositivoId,
    token_hash: huellaToken(token),
    expira_en: expiracionPara(u.rol),
  }).returning();
  return { token, sesion: s };
}

// Bloqueo de la PC de caja, que no tiene fila de dispositivo: mismo criterio
// (5 fallos, 5 minutos), en memoria del proceso (spec 4.4). Se pierde al
// reiniciar el servidor, y reiniciarlo exige acceso físico a esa máquina.
// Los intentos sí quedan en intento_fallido con dispositivo_id nulo, para
// que admin los vea como "PC de caja".
const bloqueoLocal = { fallos: 0, hasta: null as Date | null };

export function reiniciarBloqueoLocal() {
  bloqueoLocal.fallos = 0;
  bloqueoLocal.hasta = null;
}

function exigirNoBloqueado(dispositivo: Dispositivo | null) {
  const hasta = dispositivo ? dispositivo.bloqueado_hasta : bloqueoLocal.hasta;
  if (hasta && hasta.getTime() > Date.now()) {
    throw new ErrorAcceso(429, `Demasiados intentos. Espera ${BLOQUEO_MIN} minutos.`, 'dispositivo_bloqueado');
  }
}

async function registrarFallo(db: Db, dispositivo: Dispositivo | null, usuarioId: string | null) {
  if (dispositivo) {
    await registrarFalloDeDispositivo(db, dispositivo.id, usuarioId);
    return;
  }
  await db.insert(intentoFallido).values({ dispositivo_id: null, usuario_id: usuarioId });
  bloqueoLocal.fallos += 1;
  if (bloqueoLocal.fallos >= MAXIMO_FALLOS) {
    bloqueoLocal.fallos = 0;
    bloqueoLocal.hasta = new Date(Date.now() + BLOQUEO_MIN * 60000);
  }
}

async function reiniciarFallos(db: Db, dispositivo: Dispositivo | null) {
  if (dispositivo) await reiniciarFallosDeDispositivo(db, dispositivo.id);
  else reiniciarBloqueoLocal();
}

// dispositivo: el aparato autorizado que hace la petición (req.dispositivoActual),
// o null si es la PC de caja. Orden: tipo de los datos (400, no cuenta como
// intento), bloqueo (429, antes de tocar el PIN), y recién entonces el PIN.
export async function iniciarSesion(
  db: Db,
  datos: { usuario_id?: unknown; pin?: unknown },
  dispositivo: Dispositivo | null,
): Promise<{ token: string; sesion: Sesion; usuario: UsuarioPublico }> {
  const usuarioId = exigirUuid(datos.usuario_id, 'El usuario no es válido');
  const pin = exigirPin(datos.pin);
  exigirNoBloqueado(dispositivo);

  const [u] = await db.select().from(usuario).where(eq(usuario.id, usuarioId));
  // Mismo mensaje y mismo tiempo (scrypt contra un hash señuelo) exista o no
  // el usuario, esté activo o no, tenga PIN o no: la respuesta no delata nada
  // (spec 5.3.4). Regla 25: el PIN se compara solo contra el usuario elegido.
  const puedeEntrar = u !== undefined && u.activo && u.pin_hash !== null;
  const correcto = await verificarPin(pin, puedeEntrar ? (u.pin_hash as string) : HASH_SENUELO);
  if (!puedeEntrar || !correcto) {
    await registrarFallo(db, dispositivo, u ? u.id : null);
    throw new ErrorAcceso(401, 'PIN incorrecto', 'pin_incorrecto');
  }
  // El PIN se verificó contra una lectura sin bloqueo, y scrypt tarda. En ese
  // hueco pudieron desactivar al usuario o cambiarle el PIN (editarUsuario y
  // cambiarPin cierran sus sesiones en su propia transacción): si la sesión
  // se escribiera aquí fuera de toda transacción, quedaría viva después de ese
  // cierre (revive al reactivar; sobrevive al cambio de PIN). Por eso se relee
  // la fila con FOR SHARE dentro de la transacción que escribe la sesión:
  //   - editarUsuario bloquea con FOR UPDATE y cambiarPin con un UPDATE normal
  //     (FOR NO KEY UPDATE); FOR SHARE choca con ambos y espera a que
  //     confirmen. FOR KEY SHARE no bastaría: no choca con FOR NO KEY UPDATE.
  //   - Al retomar se ve la fila confirmada: si ya no está activo o el hash
  //     cambió, se responde igual que un PIN incorrecto, sin contar intento
  //     (el PIN sí era correcto cuando se escribió).
  //   - Sin interbloqueo posible: esta transacción solo toma FOR SHARE sobre
  //     una fila de usuario y luego inserta en sesion (la clave foránea toma
  //     KEY SHARE sobre usuario, ya cubierto, y sobre dispositivo). Nadie que
  //     bloquee usuario (editarUsuario, cambiarPin) espera después por sesion
  //     ni por dispositivo; revocarDispositivo bloquea dispositivo y luego
  //     escribe sesion, pero nunca espera por usuario. Entre dos entradas a la
  //     vez, FOR SHARE es compatible con FOR SHARE.
  // Este trabajo extra ocurre solo tras un PIN correcto: los caminos de fallo
  // no cambian de tiempo.
  const abierta = await db.transaction(async (tx) => {
    const [fresco] = await tx.select({ activo: usuario.activo, pin_hash: usuario.pin_hash })
      .from(usuario).where(eq(usuario.id, u.id)).for('share');
    if (!fresco || !fresco.activo || fresco.pin_hash !== u.pin_hash) return null;
    return abrirSesion(tx, u, dispositivo ? dispositivo.id : null);
  });
  if (!abierta) throw new ErrorAcceso(401, 'PIN incorrecto', 'pin_incorrecto');
  // Regla 26: solo un ingreso que de verdad abrió sesión reinicia el contador.
  await reiniciarFallos(db, dispositivo);
  return { token: abierta.token, sesion: abierta.sesion, usuario: publico(u) };
}

// Capa 2 del guardia, sin escribir: la sesión del token, si no está cerrada
// ni vencida y su usuario sigue activo.
export async function buscarSesionViva(db: Db, token: string): Promise<SesionViva | null> {
  const [fila] = await db.select({ s: sesion, u: usuario }).from(sesion)
    .innerJoin(usuario, eq(sesion.usuario_id, usuario.id))
    .where(and(eq(sesion.token_hash, huellaToken(token)), isNull(sesion.cerrada_en)));
  if (!fila || !fila.u.activo) return null;
  if (fila.s.expira_en && fila.s.expira_en.getTime() <= Date.now()) return null;
  return { sesion: fila.s, usuario: publico(fila.u) };
}

// Cada petición aceptada renueva la expiración según el rol (caja 30, admin
// 15, mesero sin expiración) y anota el último uso.
export async function renovarSesion(db: Db, s: Sesion, rol: Rol): Promise<Sesion> {
  const [renovada] = await db.update(sesion).set({ ultimo_uso_en: new Date(), expira_en: expiracionPara(rol) }).where(eq(sesion.id, s.id)).returning();
  return renovada;
}

// Cierra la sesión que el guardia ya validó (req.sesionActual): la ruta de
// salir no vuelve a leer la cookie, cierra exactamente la sesión con la que
// entró la petición.
export async function cerrarSesionPorId(db: Db, id: string) {
  await db.update(sesion).set({ cerrada_en: new Date() })
    .where(and(eq(sesion.id, id), isNull(sesion.cerrada_en)));
}

// Regla 29: al cerrar la jornada (plan 2, módulo jornada) se cierran todas las
// sesiones de rol mesero, dentro de la misma transacción del cierre.
export async function cerrarSesionesDeRol(db: Db | Tx, rol: Rol): Promise<number> {
  const filas = await db.update(sesion).set({ cerrada_en: new Date() })
    .where(and(isNull(sesion.cerrada_en), sql`${sesion.usuario_id} IN (SELECT ${usuario.id} FROM ${usuario} WHERE ${usuario.rol} = ${rol})`))
    .returning({ id: sesion.id });
  return filas.length;
}

export function rutasSesion(app: FastifyInstance) {
  app.get('/api/sesion/usuarios', { config: { acceso: SOLO_DISPOSITIVO } }, async () => listarUsuariosParaEntrar(app.db));
  app.post('/api/sesion', { config: { acceso: SOLO_DISPOSITIVO } }, async (req, reply) => {
    const datos = exigirObjeto(req.body);
    const { token, sesion: s, usuario: u } = await iniciarSesion(app.db, datos, req.dispositivoActual);
    // El token viaja solo en la cookie HttpOnly (spec sección 7): la pantalla
    // no lo necesita leer y así ningún script de la página puede verlo.
    reply.header('set-cookie', cookieSesion(token));
    return reply.status(201).send({ usuario: u, expira_en: s.expira_en });
  });
  app.get('/api/sesion', { config: { acceso: TODOS } }, async (req) => ({
    usuario: req.usuarioActual,
    expira_en: req.sesionActual?.expira_en ?? null,
  }));
  app.delete('/api/sesion', { config: { acceso: TODOS } }, async (req, reply) => {
    // TODOS exige sesión viva: el guardia ya dejó en sesionActual la sesión
    // de esta cookie, atada a este aparato. Se cierra esa, sin releer la cookie.
    await cerrarSesionPorId(app.db, req.sesionActual!.id);
    // Solo se borra la cookie de sesión: el aparato sigue autorizado (spec 5.4).
    reply.header('set-cookie', cookieBorrada(NOMBRE_COOKIE_SESION));
    return reply.status(204).send();
  });
}
