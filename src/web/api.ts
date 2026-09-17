// Lee el cuerpo de una respuesta ya obtenida con fetch: lo intenta parsear
// como JSON (puede venir vacio) y, si la respuesta no fue exitosa, lanza el
// mensaje de error del servidor. Si el cuerpo no es JSON valido (por
// ejemplo, una pagina HTML de error de un proxy) no revienta con el mensaje
// tecnico de JSON.parse, sino con uno en espanol.
async function leerRespuesta(r: Response) {
  const texto = await r.text();
  let datos: any = null;
  if (texto) {
    try {
      datos = JSON.parse(texto);
    } catch {
      throw new Error('Respuesta inválida del servidor');
    }
  }
  if (!r.ok) throw new Error(datos?.error ?? `Error ${r.status}`);
  return datos;
}

// fetch lanza (no devuelve una respuesta con estado de error) cuando no hay
// red o el servidor no responde: "Failed to fetch" en Chrome, mensajes
// distintos en otros navegadores. Se traduce a un mensaje en espanol y se
// deja pasar cualquier otro error (por ejemplo, el de leerRespuesta).
async function pedir(url: string, init: RequestInit) {
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch {
    throw new Error('Sin conexión con el servidor');
  }
  return leerRespuesta(r);
}

async function llamar(metodo: string, url: string, cuerpo?: unknown) {
  return pedir(url, {
    method: metodo,
    headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

export const api = {
  get: (url: string) => llamar('GET', url),
  post: (url: string, cuerpo?: unknown) => llamar('POST', url, cuerpo ?? {}),
  patch: (url: string, cuerpo: unknown) => llamar('PATCH', url, cuerpo),
  del: (url: string) => llamar('DELETE', url),
  subirArchivo(url: string, campo: string, archivo: File) {
    const fd = new FormData(); fd.append(campo, archivo);
    return pedir(url, { method: 'POST', body: fd });
  },
};
