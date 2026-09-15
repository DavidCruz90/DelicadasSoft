export class ErrorNegocio extends Error { estado = 409; }
export class ErrorValidacion extends Error { estado = 400; }
export class NoEncontrado extends Error { estado = 404; constructor(m = 'No existe') { super(m); } }

const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres lanza un error de sintaxis (que el manejador global de app.ts
// traduciria como 500) si se consulta una columna uuid con un texto que no
// tiene forma de uuid. Toda ruta con un identificador de columna uuid en el
// path o en el cuerpo debe validar el formato con esta funcion antes de
// tocar la base, en vez de repetir la expresion regular en cada modulo.
export function exigirUuid(id: unknown, mensaje = 'El identificador no es válido'): string {
  if (typeof id !== 'string' || !PATRON_UUID.test(id)) throw new ErrorValidacion(mensaje);
  return id;
}

// Valida que el cuerpo de la peticion sea un objeto plano (ni texto, ni
// numero, ni arreglo, ni null) antes de leer sus campos. Un cuerpo ausente
// (undefined) no pasa por aqui: cada ruta lo trata como "sin cambios".
export function exigirObjeto(valor: unknown, mensaje = 'El cuerpo debe ser un objeto'): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) throw new ErrorValidacion(mensaje);
  return valor as Record<string, unknown>;
}
