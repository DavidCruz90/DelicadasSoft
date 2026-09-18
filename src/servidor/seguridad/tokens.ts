import { createHash, randomBytes } from 'node:crypto';

// 32 bytes aleatorios (256 bits) en hexadecimal: 64 caracteres. Imposible de
// adivinar, así que en la base basta con su huella SHA-256 (rápida): a
// diferencia del PIN, no hay un espacio pequeño que recorrer.
export function generarToken(): string {
  return randomBytes(32).toString('hex');
}

export function huellaToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
