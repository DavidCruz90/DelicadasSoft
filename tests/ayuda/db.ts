import { crearDb } from '../../src/servidor/db/conexion';
import { ejecutarMigraciones } from '../../src/servidor/db/migrar';

const URL = process.env.DATABASE_URL_TEST ?? 'postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria_test';

const TABLAS = [
  'abono', 'encargo_item', 'encargo', 'pago', 'pedido_item', 'ronda', 'cuenta', 'egreso',
  'pedido', 'movimiento_stock', 'jornada', 'cambio_precio', 'producto', 'categoria', 'cliente',
  'intento_fallido', 'sesion', 'dispositivo', 'usuario', 'configuracion',
];

export async function prepararBaseDePrueba() {
  const { db, sql } = crearDb(URL);
  await ejecutarMigraciones(db);
  await sql.unsafe(`TRUNCATE ${TABLAS.join(', ')} RESTART IDENTITY CASCADE`);
  return { db, sql };
}
