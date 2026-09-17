import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export function crearDb(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export type Db = ReturnType<typeof crearDb>['db'];

// Tipo del "tx" que recibe el callback de db.transaction(async (tx) => ...):
// una transacción de Drizzle no es asignable al tipo Db completo (le falta
// $client, entre otras cosas), pero sí soporta select/insert/update/where
// igual que Db. Se extrae así en vez de escribirlo a mano para que siga el
// tipo real de la conexión si cambia. Toda función de módulo que pueda
// correr dentro de una transacción ajena (catálogo hoy, jornada en el plan
// 2) recibe Db | Tx.
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
