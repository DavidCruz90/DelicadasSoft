import { prepararBaseDePrueba } from './db';
import { crearApp } from '../../src/servidor/app';

export async function crearAppDePrueba() {
  const { db, sql } = await prepararBaseDePrueba();
  const app = await crearApp({ db });
  await app.ready();
  return { app, db, sql };
}
