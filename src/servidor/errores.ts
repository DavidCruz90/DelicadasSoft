export class ErrorNegocio extends Error { estado = 409; }
export class ErrorValidacion extends Error { estado = 400; }
export class NoEncontrado extends Error { estado = 404; constructor(m = 'No existe') { super(m); } }
export class ErrorTamano extends Error { estado = 413; }

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

// numeric(10,2) de PostgreSQL guarda hasta 8 digitos enteros y 2 decimales
// (maximo 99999999.99); un monto fuera de ese rango revienta la restriccion
// de precision en la base y el manejador global lo devuelve como 500 en vez
// de un 400 claro. La comprobacion de decimales se hace sobre la
// representacion en texto del valor, nunca con aritmetica de coma flotante:
// comparar 4.005*100 contra Number.isInteger() da resultados inconsistentes
// por el redondeo binario de los floats, y toFixed(2) por si solo redondea
// en silencio (4.005 quedaria guardado como 4.00 sin que nadie lo pida).
const PATRON_MONTO_LIMPIO = /^\d+(\.\d{1,2})?$/;
const MONTO_MAXIMO = 99_999_999.99;

export function exigirMonto(valor: unknown, mensaje: string): string {
  let texto: string;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new ErrorValidacion(mensaje);
    texto = valor.toString();
  } else if (typeof valor === 'string' && valor.trim() !== '') {
    texto = valor.trim();
  } else {
    throw new ErrorValidacion(mensaje);
  }
  if (!PATRON_MONTO_LIMPIO.test(texto)) throw new ErrorValidacion(mensaje);
  const n = Number(texto);
  if (n < 0 || n > MONTO_MAXIMO) throw new ErrorValidacion(mensaje);
  return n.toFixed(2);
}
