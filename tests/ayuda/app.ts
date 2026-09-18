import type { InjectOptions } from 'fastify';
import { prepararBaseDePrueba } from './db';
import { crearApp } from '../../src/servidor/app';
import { crearUsuario } from '../../src/servidor/modulos/usuarios';
import { abrirSesion } from '../../src/servidor/modulos/sesiones';

export const PIN_ADMIN_PRUEBA = '1234';

// Crea la app sobre una base limpia, un administrador de prueba y una sesión
// suya abierta desde la PC de caja, y hace que app.inject mande esa cookie
// salvo que la prueba traiga su propia cabecera cookie:
//   headers: { cookie: '' }                            → sin sesión
//   headers: { cookie: 'dispositivo=...; sesion=...' } → la que la prueba quiera
// Así las pruebas del plan 1 siguen valiendo tal cual: todas hablan como el
// administrador desde la PC de caja.
export async function crearAppDePrueba() {
  const { db, sql } = await prepararBaseDePrueba();
  const app = await crearApp({ db });
  await app.ready();
  const admin = await crearUsuario(db, { nombre: 'Admin de prueba', rol: 'admin', pin: PIN_ADMIN_PRUEBA });
  const { token } = await abrirSesion(db, admin, null);
  const cookieAdmin = `sesion=${token}`;
  const injectOriginal = app.inject.bind(app);
  (app as { inject: unknown }).inject = (opciones: InjectOptions) =>
    injectOriginal({ ...opciones, headers: { cookie: cookieAdmin, ...(opciones.headers ?? {}) } });
  return { app, db, sql, admin, cookieAdmin };
}
