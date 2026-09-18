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
});

test('el hash señuelo es un hash válido de 0000 (sirve para igualar tiempos, nunca para entrar)', async () => {
  expect(await verificarPin('0000', HASH_SENUELO)).toBe(true);
});
