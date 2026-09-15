import { config } from './config';
import { crearDb } from './db/conexion';
import { ejecutarMigraciones } from './db/migrar';
import { asegurarConfiguracion } from './modulos/configuracion';
import { crearApp } from './app';

const { db } = crearDb(config.databaseUrl);
await ejecutarMigraciones(db);
await asegurarConfiguracion(db);
const app = await crearApp({ db });
await app.listen({ port: config.puerto, host: '0.0.0.0' });
console.log(`Servidor en http://0.0.0.0:${config.puerto}`);
