import type { Rol } from '../../compartido/roles';

// Lo que cada ruta de la API declara en config.acceso. El guardia (Task 3 y
// Task 4) lo lee en onRequest; una ruta bajo /api/ sin esta declaración hace
// fallar el arranque. Tres formas, y nada más:
//   - PUBLICO: ni dispositivo ni sesión (instalación y solicitud de aparato).
//   - SOLO_DISPOSITIVO: aparato autorizado, sin sesión (cocina, catálogo,
//     estado, eventos, lista de nombres para entrar y entrar con PIN).
//   - con roles: aparato autorizado + sesión viva + rol en la lista.
export type Acceso =
  | { dispositivo: false; sesion: false }
  | { dispositivo: true; sesion: false }
  | { dispositivo: true; sesion: true; roles: Rol[] };

export const PUBLICO: Acceso = { dispositivo: false, sesion: false };
export const SOLO_DISPOSITIVO: Acceso = { dispositivo: true, sesion: false };
export const ADMIN: Acceso = { dispositivo: true, sesion: true, roles: ['admin'] };
export const CAJA: Acceso = { dispositivo: true, sesion: true, roles: ['caja', 'admin'] };
export const TODOS: Acceso = { dispositivo: true, sesion: true, roles: ['mesero', 'caja', 'admin'] };

declare module 'fastify' {
  interface FastifyContextConfig {
    acceso?: Acceso;
  }
}
