export class ErrorNegocio extends Error { estado = 409; }
export class ErrorValidacion extends Error { estado = 400; }
export class NoEncontrado extends Error { estado = 404; constructor(m = 'No existe') { super(m); } }
export class ErrorTamano extends Error { estado = 413; }

// Validación compartida de datos que llegan por HTTP. Toda función "exigir…"
// recibe el valor sin tipar y el mensaje en español que verá el dueño si el
// dato no sirve; devuelve el valor ya limpio y tipado, o lanza
// ErrorValidacion (400). Los módulos no repiten typeof a mano: usan estas
// funciones, así el criterio (tipo primero, rango después) es uno solo.

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

// Para rutas donde el cuerpo puede faltar (PATCH sin cambios, POST cuya
// validación de campos obligatorios ya rechaza el vacío): un cuerpo ausente
// (sin Content-Type o sin payload llega como undefined) vale como objeto
// vacío; un cuerpo presente que no sea un objeto se rechaza con 400.
export function exigirObjetoOpcional(valor: unknown, mensaje?: string): Record<string, unknown> {
  if (valor === undefined || valor === null) return {};
  return exigirObjeto(valor, mensaje);
}

// Texto obligatorio: rechaza todo lo que no sea string (numeros, booleanos,
// objetos, null; String(null) colaria el texto literal "null") y lo
// devuelve recortado; el vacío tras recortar es su propio mensaje porque el
// dueño lo ve como un caso distinto ("te faltó escribirlo" frente a "eso no
// es un texto").
export function exigirTexto(valor: unknown, mensajeTipo: string, mensajeVacio: string): string {
  if (typeof valor !== 'string') throw new ErrorValidacion(mensajeTipo);
  const limpio = valor.trim();
  if (!limpio) throw new ErrorValidacion(mensajeVacio);
  return limpio;
}

export function exigirBooleano(valor: unknown, mensaje: string): boolean {
  if (typeof valor !== 'boolean') throw new ErrorValidacion(mensaje);
  return valor;
}

// Tope para columnas integer de PostgreSQL que aquí guardan cantidades
// razonables (stock, orden de aparición, umbral): sin este límite, un número
// enorme (p. ej. 99999999999) desborda el entero de la base y produce un
// 500 en vez de un 400 claro. Se exige typeof 'number' entero, nunca
// Number(): "12" o true no deben colarse en silencio.
export const ENTERO_MAXIMO = 1_000_000;

export function exigirEntero(
  valor: unknown,
  mensaje: string,
  { minimo = 0, maximo = ENTERO_MAXIMO }: { minimo?: number; maximo?: number } = {},
): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo || valor > maximo) throw new ErrorValidacion(mensaje);
  return valor;
}

// numeric(10,2) de PostgreSQL guarda hasta 8 digitos enteros y 2 decimales
// (maximo 99999999.99); un monto fuera de ese rango revienta la restriccion
// de precision en la base y el manejador global lo devuelve como 500 en vez
// de un 400 claro. La comprobacion de decimales se hace sobre la
// representacion en texto del valor, nunca con aritmetica de coma flotante:
// comparar 4.005*100 contra Number.isInteger() da resultados inconsistentes
// por el redondeo binario de los floats, y toFixed(2) por si solo redondea
// en silencio (4.005 quedaria guardado como 4.00 sin que nadie lo pida).
// El minimo por defecto es 0 (un precio puede ser 0); un pago o un abono
// pasan { minimo: 0.01 } para que un monto de 0 no cuente como dinero.
const PATRON_MONTO_LIMPIO = /^\d+(\.\d{1,2})?$/;
const MONTO_MAXIMO = 99_999_999.99;

export function exigirMonto(
  valor: unknown,
  mensaje: string,
  { minimo = 0, maximo = MONTO_MAXIMO }: { minimo?: number; maximo?: number } = {},
): string {
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
  if (n < minimo || n > maximo) throw new ErrorValidacion(mensaje);
  return n.toFixed(2);
}
