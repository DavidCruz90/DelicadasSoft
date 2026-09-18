// Cookies leídas y escritas a mano: dos nombres y un formato fijo no
// justifican @fastify/cookie. Los tokens son hexadecimales, así que no hay
// nada que codificar.
export const NOMBRE_COOKIE_DISPOSITIVO = 'dispositivo';
export const NOMBRE_COOKIE_SESION = 'sesion';

const DIAS_COOKIE_DISPOSITIVO = 400; // tope que aceptan los navegadores
const DIAS_COOKIE_SESION = 1; // la vigencia real la decide el servidor (expira_en)

export function leerCookies(cabecera: string | undefined): Record<string, string> {
  const resultado: Record<string, string> = {};
  if (!cabecera) return resultado;
  for (const parte of cabecera.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const nombre = parte.slice(0, i).trim();
    const valor = parte.slice(i + 1).trim();
    if (nombre && valor) resultado[nombre] = valor;
  }
  return resultado;
}

// HttpOnly: el JavaScript de la pantalla no puede leerlas. SameSite=Strict:
// solo viajan en peticiones que nacen en la propia pantalla. Sin Secure: la
// red local va por HTTP (spec sección 11).
function cookie(nombre: string, valor: string, segundos: number): string {
  return `${nombre}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${segundos}`;
}

export const cookieDispositivo = (token: string) => cookie(NOMBRE_COOKIE_DISPOSITIVO, token, DIAS_COOKIE_DISPOSITIVO * 86400);
export const cookieSesion = (token: string) => cookie(NOMBRE_COOKIE_SESION, token, DIAS_COOKIE_SESION * 86400);
export const cookieBorrada = (nombre: string) => cookie(nombre, '', 0);
