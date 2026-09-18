import { test, expect } from 'vitest';
import { ErrorValidacion } from '../src/servidor/errores';
import { HASH_SENUELO, cifrarPin, exigirPin, verificarPin } from '../src/servidor/seguridad/pin';

test('exigirPin acepta exactamente 4 dígitos como texto y conserva el cero inicial', () => {
  expect(exigirPin('0123')).toBe('0123');
  expect(exigirPin('9999')).toBe('9999');
});

test('exigirPin rechaza números, otros largos, letras, espacios y nada', () => {
  for (const malo of [1234, '123', '12345', 'abcd', '12 4', ' 1234', '', null, undefined, {}, [], true]) {
    expect(() => exigirPin(malo), `valor ${String(malo)}`).toThrow(ErrorValidacion);
    expect(() => exigirPin(malo), `valor ${String(malo)}`).toThrow('El PIN debe tener exactamente 4 dígitos');
  }
});

test('cifrarPin usa sal distinta cada vez y verificarPin distingue el PIN correcto del incorrecto', async () => {
  const a = await cifrarPin('1234');
  const b = await cifrarPin('1234');
  expect(a).not.toBe(b);
  expect(a).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
  expect(await verificarPin('1234', a)).toBe(true);
  expect(await verificarPin('1234', b)).toBe(true);
  expect(await verificarPin('1235', a)).toBe(false);
  expect(await verificarPin('0000', a)).toBe(false);
});

test('verificarPin devuelve false ante un hash malformado en vez de lanzar', async () => {
  expect(await verificarPin('1234', 'no-es-un-hash')).toBe(false);
  expect(await verificarPin('1234', '')).toBe(false);
  expect(await verificarPin('1234', 'ab:abc')).toBe(false);
});

// Desde que verificarPin decide accesos, la sal y la clave tienen que medir
// exactamente lo que escribe cifrarPin (16 y 32 bytes en hexadecimal). Sin
// esa comprobación, una clave de largo impar verificaba 33 de cada 10 000
// PIN, y una clave recortada (los primeros bytes de la derivación son los
// mismos) verificaba el PIN correcto aunque el hash esté roto.
test('verificarPin exige el largo exacto de sal y clave: recortadas, alargadas o de largo impar dan false aunque el PIN sea el correcto', async () => {
  const valido = await cifrarPin('1234');
  const [sal, clave] = valido.split(':');
  expect(await verificarPin('1234', `${sal}:${clave.slice(0, -1)}`)).toBe(false); // clave de largo impar
  expect(await verificarPin('1234', `${sal}:${clave.slice(0, -2)}`)).toBe(false); // clave recortada un byte
  expect(await verificarPin('1234', `${sal}:${clave}ab`)).toBe(false); // clave alargada
  expect(await verificarPin('1234', `${sal.slice(0, -2)}:${clave}`)).toBe(false); // sal recortada
  expect(await verificarPin('1234', `${sal}ab:${clave}`)).toBe(false); // sal alargada
  expect(await verificarPin('1234', valido)).toBe(true);
});

test('el hash señuelo es un hash válido de 0000 (sirve para igualar tiempos, nunca para entrar)', async () => {
  expect(await verificarPin('0000', HASH_SENUELO)).toBe(true);
});
