import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { ErrorNegocio, exigirObjeto } from '../errores';
import { PUBLICO } from '../seguridad/acceso';
import { exigirLocal } from '../seguridad/guardia';
import { cookieSesion } from '../seguridad/cookies';
import { crearUsuario, hayAdminActivo, type UsuarioPublico } from './usuarios';
import { abrirSesion, type Sesion } from './sesiones';

// Un número fijo cualquiera para el bloqueo consultivo de PostgreSQL: solo
// tiene que ser el mismo en todas las instalaciones simultáneas (y en la
// prueba de carrera de tests/instalacion.test.ts, que lo toma desde fuera).
const CERROJO_INSTALACION = 20260917;

// "Instalado" = existe al menos un admin activo (spec 5.1 y regla 31). Un
// admin inactivo no cuenta: si solo quedan inactivos, el sistema vuelve a
// estar sin instalar y la PC de caja puede crear otro.
export async function estaInstalado(db: Db): Promise<boolean> {
  return hayAdminActivo(db);
}

// Crea el primer administrador y abre su sesión desde la PC de caja. Va en
// una transacción con un bloqueo consultivo: dos instalaciones a la vez (dos
// pestañas abiertas) no pueden crear dos admins; la segunda espera, ve al
// primero y responde 409. El rol no se lee del cuerpo: siempre admin. La
// sesión nace con dispositivo_id nulo (PC de caja), como entrar con PIN desde
// ahí, y solo vale desde ahí.
export async function instalar(db: Db, datos: { nombre?: unknown; pin?: unknown }): Promise<{ usuario: UsuarioPublico; token: string; sesion: Sesion }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${CERROJO_INSTALACION})`);
    if (await hayAdminActivo(tx)) throw new ErrorNegocio('El sistema ya está configurado');
    const usuario = await crearUsuario(tx, { nombre: datos.nombre, rol: 'admin', pin: datos.pin });
    const { token, sesion } = await abrirSesion(tx, usuario, null);
    return { usuario, token, sesion };
  });
}

export function rutasInstalacion(app: FastifyInstance) {
  // Regla 31: las dos rutas solo responden desde la propia PC de caja. Son
  // PUBLICO para el guardia (no hay usuarios todavía) y exigirLocal es la
  // única barrera: req.ip es la dirección real del socket (trustProxy en
  // false), así que ninguna cabecera la finge.
  app.get('/api/instalacion', { config: { acceso: PUBLICO } }, async (req) => {
    exigirLocal(req);
    return { instalado: await estaInstalado(app.db) };
  });
  app.post('/api/instalacion', { config: { acceso: PUBLICO } }, async (req, reply) => {
    exigirLocal(req);
    const datos = exigirObjeto(req.body);
    const { usuario, token, sesion } = await instalar(app.db, datos);
    // El token viaja solo en la cookie HttpOnly (spec sección 7), igual que
    // al entrar con PIN: el cuerpo lleva lo mismo que POST /api/sesion.
    reply.header('set-cookie', cookieSesion(token));
    app.bus.emitir('config');
    return reply.status(201).send({ usuario, expira_en: sesion.expira_en });
  });
}
