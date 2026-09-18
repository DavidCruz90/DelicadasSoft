// Error que lanza toda llamada a la API que no fue exitosa. Lleva el estado
// HTTP y, en los errores de acceso, el codigo de lista cerrada del servidor
// (sin_sesion, dispositivo_no_autorizado, sin_permiso...), para que la
// pantalla decida sin leer el mensaje.
export class ErrorApi extends Error {
  constructor(mensaje: string, public estado: number, public codigo: string | null) {
    super(mensaje);
  }
}

// Ganchos que registra el componente Acceso cuando la pantalla ya está
// dentro: qué hacer si el servidor dice que no hay sesión (poner el teclado
// de PIN encima y avisar cuando se desbloqueó) o que el aparato ya no está
// autorizado (volver a pedir código).
type Ganchos = { esperarDesbloqueo: (() => Promise<void>) | null; dispositivoNoAutorizado: (() => void) | null };
let ganchos: Ganchos = { esperarDesbloqueo: null, dispositivoNoAutorizado: null };
export function registrarGanchosDeAcceso(nuevos: Ganchos) {
  ganchos = nuevos;
}

// Opciones de una llamada. automatica: la petición no la inició la persona
// (un intervalo, un aviso en vivo, el sondeo del aparato pendiente). Viaja
// como cabecera X-Automatica: 1 y el servidor la valida igual pero NO
// renueva la sesión (spec 4.3): así una pantalla abierta sin que nadie la
// toque vence en su plazo aunque siga recargando datos.
export type OpcionesApi = { automatica?: boolean };

// En estas rutas un 401 es parte del flujo normal de entrada (PIN
// incorrecto, sin sesión al arrancar) y no dispara el gancho de bloqueo. El
// 403 dispositivo_no_autorizado sí se atiende en toda ruta: su código es de
// lista cerrada y significa siempre lo mismo (por ejemplo, "Salir" desde un
// aparato ya revocado tiene que llevar a la pantalla de código, no a un
// teclado con error).
const RUTAS_DE_ACCESO = ['/api/sesion', '/api/instalacion', '/api/dispositivos/'];
const esRutaDeAcceso = (url: string) => RUTAS_DE_ACCESO.some((r) => url.startsWith(r));

// Lee el cuerpo de una respuesta ya obtenida con fetch: lo intenta parsear
// como JSON (puede venir vacio) y, si la respuesta no fue exitosa, lanza el
// mensaje de error del servidor con su estado y su código. Si el cuerpo no
// es JSON valido (por ejemplo, una pagina HTML de error de un proxy) no
// revienta con el mensaje tecnico de JSON.parse, sino con uno en espanol.
async function leerRespuesta(r: Response) {
  const texto = await r.text();
  let datos: any = null;
  if (texto) {
    try {
      datos = JSON.parse(texto);
    } catch {
      throw new ErrorApi('Respuesta inválida del servidor', r.status, null);
    }
  }
  if (!r.ok) throw new ErrorApi(datos?.error ?? `Error ${r.status}`, r.status, datos?.codigo ?? null);
  return datos;
}

// fetch lanza (no devuelve una respuesta con estado de error) cuando no hay
// red o el servidor no responde: "Failed to fetch" en Chrome, mensajes
// distintos en otros navegadores. Se traduce a un mensaje en espanol.
async function buscar(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ErrorApi('Sin conexión con el servidor', 0, null);
  }
}

async function pedir(url: string, init: RequestInit) {
  let r = await buscar(url, init);
  // Sesión vencida (spec 5.4): el teclado de PIN se pone encima sin
  // desmontar la pantalla, y al desbloquear se reintenta esta misma
  // petición, con el mismo cuerpo, y la pantalla sigue donde estaba.
  if (r.status === 401 && !esRutaDeAcceso(url) && ganchos.esperarDesbloqueo) {
    await ganchos.esperarDesbloqueo();
    r = await buscar(url, init);
  }
  if (r.status === 403 && ganchos.dispositivoNoAutorizado) {
    const datos = await r.clone().json().catch(() => null);
    if (datos?.codigo === 'dispositivo_no_autorizado') ganchos.dispositivoNoAutorizado();
  }
  return leerRespuesta(r);
}

function cabeceras(opciones: OpcionesApi | undefined, base: Record<string, string>): Record<string, string> {
  return opciones?.automatica ? { ...base, 'X-Automatica': '1' } : base;
}

async function llamar(metodo: string, url: string, cuerpo?: unknown, opciones?: OpcionesApi) {
  return pedir(url, {
    method: metodo,
    headers: cabeceras(opciones, cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

export const api = {
  get: (url: string, opciones?: OpcionesApi) => llamar('GET', url, undefined, opciones),
  post: (url: string, cuerpo?: unknown) => llamar('POST', url, cuerpo ?? {}),
  patch: (url: string, cuerpo: unknown) => llamar('PATCH', url, cuerpo),
  del: (url: string) => llamar('DELETE', url),
  subirArchivo(url: string, campo: string, archivo: File) {
    const fd = new FormData(); fd.append(campo, archivo);
    return pedir(url, { method: 'POST', body: fd });
  },
};
