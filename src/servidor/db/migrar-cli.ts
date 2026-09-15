import { config } from '../config';
import { crearDb } from './conexion';
import { ejecutarMigraciones } from './migrar';

const { db, sql } = crearDb(config.databaseUrl);
await ejecutarMigraciones(db);
await sql.end();
console.log('Migraciones aplicadas');
