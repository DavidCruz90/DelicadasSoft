async function llamar(metodo: string, url: string, cuerpo?: unknown) {
  const r = await fetch(url, {
    method: metodo,
    headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new Error(datos?.error ?? `Error ${r.status}`);
  return datos;
}
export const api = {
  get: (url: string) => llamar('GET', url),
  post: (url: string, cuerpo?: unknown) => llamar('POST', url, cuerpo ?? {}),
  patch: (url: string, cuerpo: unknown) => llamar('PATCH', url, cuerpo),
  del: (url: string) => llamar('DELETE', url),
  async subirArchivo(url: string, campo: string, archivo: File) {
    const fd = new FormData(); fd.append(campo, archivo);
    const r = await fetch(url, { method: 'POST', body: fd });
    const datos = await r.json();
    if (!r.ok) throw new Error(datos?.error ?? `Error ${r.status}`);
    return datos;
  },
};
