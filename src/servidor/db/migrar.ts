import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Db } from './conexion';

const carpeta = join(dirname(fileURLToPath(import.meta.url)), 'migraciones');

export async function ejecutarMigraciones(db: Db) {
  await migrate(db, { migrationsFolder: carpeta });
}
