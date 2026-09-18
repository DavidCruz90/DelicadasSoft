import type { Db } from '../../src/servidor/db/conexion';
import { dispositivo } from '../../src/servidor/db/schema';
import { generarToken, huellaToken } from '../../src/servidor/seguridad/tokens';
import { crearUsuario, type UsuarioPublico } from '../../src/servidor/modulos/usuarios';
import { abrirSesion } from '../../src/servidor/modulos/sesiones';
import type { Rol } from '../../src/compartido/roles';

// Cualquier IP que no sea la de la PC de caja: con remoteAddress: IP_REMOTA,
// inject deja de ser "local" y el guardia aplica la capa 1. Por omisión
// inject viene de 127.0.0.1, que se salta esa capa.
export const IP_REMOTA = '192.168.1.50';

export async function autorizarDispositivoDePrueba(db: Db, nombre = 'Celular de prueba') {
  const token = generarToken();
  const [d] = await db.insert(dispositivo).values({
    nombre, token_hash: huellaToken(token), estado: 'autorizado', autorizado_en: new Date(), descripcion: 'Prueba',
  }).returning();
  return { dispositivo: d, token, cookie: `dispositivo=${token}` };
}

export function crearUsuarioDePrueba(db: Db, nombre: string, rol: Rol, pin = '1234'): Promise<UsuarioPublico> {
  return crearUsuario(db, { nombre, rol, pin });
}

// Abre una sesión sin pasar por el PIN y devuelve la cookie lista para
// headers: { cookie }. dispositivoId nulo = abierta en la PC de caja.
export async function abrirSesionDePrueba(db: Db, u: UsuarioPublico, dispositivoId: string | null = null): Promise<string> {
  const { token } = await abrirSesion(db, u, dispositivoId);
  return `sesion=${token}`;
}
