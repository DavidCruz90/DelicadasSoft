// Roles de usuario, compartidos entre servidor y web. Solo tipos y
// constantes: este archivo no puede importar nada de Node ni del navegador.
export type Rol = 'mesero' | 'caja' | 'admin';
export const ROLES: Rol[] = ['mesero', 'caja', 'admin'];

// Qué roles pueden abrir cada pantalla (spec 3.2). /cocina no lleva sesión.
export const ROLES_POR_PANTALLA: Record<'/admin' | '/caja' | '/mesero', Rol[]> = {
  '/admin': ['admin'],
  '/caja': ['caja', 'admin'],
  '/mesero': ['mesero', 'caja', 'admin'],
};
