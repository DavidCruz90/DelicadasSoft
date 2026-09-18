import { and, asc, count, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Db, Tx } from '../db/conexion';
import { dispositivo, intentoFallido, sesion, usuario } from '../db/schema';
import { ErrorAcceso, ErrorNegocio, ErrorValidacion, NoEncontrado, esViolacionUnica, exigirObjetoOpcional, exigirTexto, exigirUuid } from '../errores';
import { generarToken, huellaToken } from '../seguridad/tokens';
import { NOMBRE_COOKIE_DISPOSITIVO, cookieDispositivo, leerCookies } from '../seguridad/cookies';
import { ADMIN, PUBLICO } from '../seguridad/acceso';

export type Dispositivo = typeof dispositivo.$inferSelect;
export type DispositivoPublico = Omit<Dispositivo, 'token_hash'>;

export const CADUCIDAD_PENDIENTE_MIN = 10;
export const MAXIMO_FALLOS = 5;
export const BLOQUEO_MIN = 5;
// Tope de solicitudes pendientes a la vez: sin él, cualquiera en la WiFi
// podría llenar la lista de admin (y agotar los 10 000 códigos) a base de
// pedir acceso en bucle. Las pendientes caducan solas a los 10 minutos.
const MAXIMO_PENDIENTES = 20;
const INTENTOS_DE_CODIGO = 10;

function publicoDispositivo(d: Dispositivo): DispositivoPublico {
  const { token_hash, ...resto } = d;
  return resto;
}

// Resumen legible del navegador para que el administrador reconozca el
// aparato ("Chrome en Android"). Solo informativo.
export function resumirNavegador(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  const navegador = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const sistema = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'desconocido';
  return `${navegador} en ${sistema}`;
}

function generarCodigo(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

function estaCaducada(d: Dispositivo): boolean {
  return d.solicitado_en.getTime() < Date.now() - CADUCIDAD_PENDIENTE_MIN * 60000;
}

export async function limpiarPendientesCaducados(db: Db | Tx) {
  await db.delete(dispositivo).where(
    sql`${dispositivo.estado} = 'pendiente' AND ${dispositivo.solicitado_en} < now() - make_interval(mins => ${CADUCIDAD_PENDIENTE_MIN}::int)`,
  );
}

// El token se genera aquí, se entrega una sola vez (cookie) y solo empieza a
// servir cuando el administrador autoriza. En la base queda su huella. No va
// en una transacción a propósito: un choque de código (índice parcial
// dispositivo_codigo_pendiente_unico) abortaría la transacción entera y no
// se podría reintentar dentro de ella.
export async function solicitarDispositivo(db: Db, descripcion: string): Promise<{ dispositivo: Dispositivo; token: string }> {
  await limpiarPendientesCaducados(db);
  const [{ pendientes }] = await db.select({ pendientes: count() }).from(dispositivo).where(eq(dispositivo.estado, 'pendiente'));
  if (pendientes >= MAXIMO_PENDIENTES) throw new ErrorNegocio('Hay demasiadas solicitudes pendientes; espera a que el administrador las atienda');
  const token = generarToken();
  for (let intento = 0; intento < INTENTOS_DE_CODIGO; intento++) {
    try {
      const [d] = await db.insert(dispositivo).values({ codigo: generarCodigo(), token_hash: huellaToken(token), descripcion }).returning();
      return { dispositivo: d, token };
    } catch (err) {
      // El 23505 llega envuelto por Drizzle (en err.cause): esViolacionUnica
      // mira en los dos sitios. Cualquier otro error se propaga tal cual.
      if (!esViolacionUnica(err, 'dispositivo_codigo_pendiente_unico')) throw err;
    }
  }
  throw new ErrorNegocio('No se pudo generar un código de autorización; inténtalo de nuevo');
}

// El aparato pendiente pregunta si ya lo autorizaron. Solo responde si la
// cookie que trae es la de esa misma solicitud: el espera_id por sí solo no
// da acceso a nada.
export async function consultarSolicitud(db: Db, esperaId: unknown, token: string | undefined): Promise<{ estado: 'pendiente' | 'autorizado' | 'revocado' }> {
  const id = exigirUuid(esperaId, 'La solicitud no es válida');
  const caducada = () => new ErrorAcceso(404, 'La solicitud caducó o no existe; el aparato debe pedir acceso de nuevo', 'solicitud_caducada');
  if (!token) throw caducada();
  const [d] = await db.select().from(dispositivo).where(and(eq(dispositivo.id, id), eq(dispositivo.token_hash, huellaToken(token))));
  if (!d) throw caducada();
  if (d.estado === 'pendiente' && estaCaducada(d)) {
    await db.delete(dispositivo).where(eq(dispositivo.id, id));
    throw caducada();
  }
  return { estado: d.estado };
}

// Capa 1 del guardia: devuelve el aparato si la cookie corresponde a uno
// autorizado, y de paso anota el último uso. Un solo UPDATE ... RETURNING.
export async function buscarDispositivoAutorizado(db: Db, token: string): Promise<Dispositivo | null> {
  const [d] = await db.update(dispositivo).set({ ultimo_uso_en: new Date() })
    .where(and(eq(dispositivo.token_hash, huellaToken(token)), eq(dispositivo.estado, 'autorizado')))
    .returning();
  return d ?? null;
}

export async function listarDispositivos(db: Db) {
  await limpiarPendientesCaducados(db);
  const filas = await db.select().from(dispositivo).where(ne(dispositivo.estado, 'revocado')).orderBy(asc(dispositivo.solicitado_en));
  const intentos = await db.select({
    id: intentoFallido.id,
    ocurrido_en: intentoFallido.creado_en,
    dispositivo: dispositivo.nombre,
    usuario: usuario.nombre,
  }).from(intentoFallido)
    .leftJoin(dispositivo, eq(intentoFallido.dispositivo_id, dispositivo.id))
    .leftJoin(usuario, eq(intentoFallido.usuario_id, usuario.id))
    .orderBy(desc(intentoFallido.creado_en))
    .limit(20);
  return {
    pendientes: filas.filter((d) => d.estado === 'pendiente').map(publicoDispositivo),
    autorizados: filas.filter((d) => d.estado === 'autorizado').map(publicoDispositivo),
    intentos_fallidos: intentos.map((i) => ({
      ...i,
      dispositivo: i.dispositivo ?? 'PC de caja',
      usuario: i.usuario ?? 'Usuario desconocido',
    })),
  };
}

// Ausente o vacío: "ponle un nombre" (es lo que el administrador olvidó).
// Presente con otro tipo: "debe ser texto" (tipo antes que rango).
function exigirNombreDispositivo(valor: unknown): string {
  if (valor === undefined) throw new ErrorValidacion('Ponle un nombre al dispositivo antes de autorizarlo');
  return exigirTexto(valor, 'El nombre del dispositivo debe ser texto', 'Ponle un nombre al dispositivo antes de autorizarlo');
}

export async function autorizarDispositivo(db: Db, id: string, datos: { nombre?: unknown }, autorizadoPorId: string | null): Promise<DispositivoPublico> {
  exigirUuid(id, 'El identificador del dispositivo no es válido');
  const nombre = exigirNombreDispositivo(datos.nombre);
  return db.transaction(async (tx) => {
    const [d] = await tx.select().from(dispositivo).where(eq(dispositivo.id, id)).for('update');
    if (!d) throw new NoEncontrado('El dispositivo no existe');
    if (d.estado === 'autorizado') throw new ErrorNegocio('Este dispositivo ya está autorizado');
    if (d.estado === 'revocado') throw new ErrorNegocio('Este dispositivo fue revocado; debe solicitar acceso de nuevo');
    if (estaCaducada(d)) throw new ErrorNegocio('La solicitud caducó; el aparato debe pedir acceso de nuevo');
    const [a] = await tx.update(dispositivo)
      .set({ nombre, estado: 'autorizado', codigo: null, autorizado_en: new Date(), autorizado_por: autorizadoPorId })
      .where(eq(dispositivo.id, id)).returning();
    return publicoDispositivo(a);
  });
}

// Regla 28: el token deja de servir en la siguiente petición (buscarDispositivoAutorizado
// solo acepta estado autorizado) y las sesiones abiertas desde el aparato se
// cierran en la misma transacción.
export async function revocarDispositivo(db: Db, id: string): Promise<DispositivoPublico> {
  exigirUuid(id, 'El identificador del dispositivo no es válido');
  return db.transaction(async (tx) => {
    const [d] = await tx.select().from(dispositivo).where(eq(dispositivo.id, id)).for('update');
    if (!d) throw new NoEncontrado('El dispositivo no existe');
    if (d.estado === 'revocado') return publicoDispositivo(d);
    const [r] = await tx.update(dispositivo).set({ estado: 'revocado', codigo: null }).where(eq(dispositivo.id, id)).returning();
    await tx.update(sesion).set({ cerrada_en: new Date() }).where(and(eq(sesion.dispositivo_id, id), isNull(sesion.cerrada_en)));
    return publicoDispositivo(r);
  });
}

// Regla 26. Anota el intento y suma uno al contador del aparato de forma
// atómica (UPDATE ... = ... + 1 RETURNING: dos fallos simultáneos no se pisan).
// Al quinto, bloquea 5 minutos y pone el contador en 0: pasado el bloqueo se
// vuelven a tener 5 intentos. Devuelve hasta cuándo queda bloqueado, o null.
export async function registrarFalloDeDispositivo(db: Db, dispositivoId: string, usuarioId: string | null): Promise<Date | null> {
  await db.insert(intentoFallido).values({ dispositivo_id: dispositivoId, usuario_id: usuarioId });
  const [d] = await db.update(dispositivo)
    .set({ intentos_fallidos: sql`${dispositivo.intentos_fallidos} + 1` })
    .where(eq(dispositivo.id, dispositivoId))
    .returning({ intentos: dispositivo.intentos_fallidos });
  if (!d || d.intentos < MAXIMO_FALLOS) return null;
  const hasta = new Date(Date.now() + BLOQUEO_MIN * 60000);
  await db.update(dispositivo).set({ intentos_fallidos: 0, bloqueado_hasta: hasta }).where(eq(dispositivo.id, dispositivoId));
  return hasta;
}

export async function reiniciarFallosDeDispositivo(db: Db, dispositivoId: string) {
  await db.update(dispositivo).set({ intentos_fallidos: 0, bloqueado_hasta: null }).where(eq(dispositivo.id, dispositivoId));
}

export function rutasDispositivos(app: FastifyInstance) {
  app.post('/api/dispositivos/solicitar', { config: { acceso: PUBLICO } }, async (req, reply) => {
    const { dispositivo: d, token } = await solicitarDispositivo(app.db, resumirNavegador(req.headers['user-agent']));
    reply.header('set-cookie', cookieDispositivo(token));
    app.bus.emitir('dispositivos');
    return reply.status(201).send({ codigo: d.codigo, espera_id: d.id });
  });
  app.get<{ Querystring: { espera_id?: string } }>('/api/dispositivos/estado', { config: { acceso: PUBLICO } }, async (req) => {
    const token = leerCookies(req.headers.cookie)[NOMBRE_COOKIE_DISPOSITIVO];
    return consultarSolicitud(app.db, req.query.espera_id, token);
  });
  app.get('/api/admin/dispositivos', { config: { acceso: ADMIN } }, async () => listarDispositivos(app.db));
  app.post<{ Params: { id: string } }>('/api/admin/dispositivos/:id/autorizar', { config: { acceso: ADMIN } }, async (req) => {
    const datos = exigirObjetoOpcional(req.body);
    // usuarioActual lo llena la capa 2 del guardia (ADMIN exige sesión).
    const d = await autorizarDispositivo(app.db, req.params.id, datos, req.usuarioActual?.id ?? null);
    app.bus.emitir('dispositivos');
    return d;
  });
  app.post<{ Params: { id: string } }>('/api/admin/dispositivos/:id/revocar', { config: { acceso: ADMIN } }, async (req) => {
    const d = await revocarDispositivo(app.db, req.params.id);
    app.bus.emitir('dispositivos');
    return d;
  });
}
