import { randomBytes, scrypt as scryptConCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ErrorValidacion } from '../errores';

const scrypt = promisify(scryptConCallback) as (clave: string, sal: Buffer, largo: number, opciones: { N: number; r: number; p: number }) => Promise<Buffer>;

// Parámetros de scrypt: N=16384 tarda unos 50 ms en la PC de caja, suficiente
// para que probar los 10 000 PIN posibles contra un hash robado lleve minutos
// en vez de milisegundos, y bastante rápido para que entrar no se note.
const PARAMETROS = { N: 16384, r: 8, p: 1 };
const LARGO_SAL = 16;
const LARGO_CLAVE = 32;

// El PIN llega como texto, nunca como número: "0123" perdería el cero.
export function exigirPin(valor: unknown, mensaje = 'El PIN debe tener exactamente 4 dígitos'): string {
  if (typeof valor !== 'string' || !/^\d{4}$/.test(valor)) throw new ErrorValidacion(mensaje);
  return valor;
}

// Devuelve "salHex:claveHex". La sal es aleatoria por usuario: dos personas
// con el mismo PIN tienen hashes distintos, y un hash no sirve para adivinar
// el de otro.
export async function cifrarPin(pin: string): Promise<string> {
  const sal = randomBytes(LARGO_SAL);
  const clave = await scrypt(pin, sal, LARGO_CLAVE, PARAMETROS);
  return `${sal.toString('hex')}:${clave.toString('hex')}`;
}

// Sal y clave tienen que medir exactamente lo que escribe cifrarPin (en
// hexadecimal, el doble de bytes). No basta con "hexadecimal no vacío": una
// clave de largo impar la decodifica Buffer a medias y verificaba 33 de cada
// 10 000 PIN; una clave recortada verificaba el PIN correcto porque los
// primeros bytes de la derivación coinciden. Desde que verificarPin decide
// accesos, un hash con otra forma se rechaza sin llamar a scrypt.
const PATRON_SAL = new RegExp(`^[0-9a-f]{${LARGO_SAL * 2}}$`);
const PATRON_CLAVE = new RegExp(`^[0-9a-f]{${LARGO_CLAVE * 2}}$`);

export async function verificarPin(pin: string, hash: string): Promise<boolean> {
  const partes = hash.split(':');
  if (partes.length !== 2) return false;
  const [salHex, claveHex] = partes;
  if (!PATRON_SAL.test(salHex) || !PATRON_CLAVE.test(claveHex)) return false;
  const esperado = Buffer.from(claveHex, 'hex');
  const clave = await scrypt(pin, Buffer.from(salHex, 'hex'), LARGO_CLAVE, PARAMETROS);
  return timingSafeEqual(clave, esperado);
}

// Hash de "0000" con sal fija (verificado el 2026-09-17 con scryptSync y estos
// mismos parámetros). Se usa SOLO para que verificar un PIN contra un usuario
// que no existe, está inactivo o no tiene PIN tarde lo mismo que contra uno
// real: así el tiempo de respuesta no delata si el usuario existe. El
// resultado de esa verificación se ignora siempre.
export const HASH_SENUELO = '00000000000000000000000000000000:c3be8696f272cde38106ae21b68d53ad8b2cdc56866bb7facb76d0ab764104fd';
