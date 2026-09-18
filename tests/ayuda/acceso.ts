import type { Db } from '../../src/servidor/db/conexion';
import { dispositivo } from '../../src/servidor/db/schema';
import { generarToken, huellaToken } from '../../src/servidor/seguridad/tokens';

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
