import { test, expect } from 'vitest';
import { DrizzleQueryError } from 'drizzle-orm';
import { ErrorValidacion, esViolacionUnica, exigirMonto, exigirUuid } from '../src/servidor/errores';

const MSG = 'monto inválido';

test('exigirMonto acepta números y cadenas limpias con hasta 2 decimales y devuelve texto con 2 decimales', () => {
  expect(exigirMonto(4.5, MSG)).toBe('4.50');
  expect(exigirMonto('4.50', MSG)).toBe('4.50');
  expect(exigirMonto(' 4.5 ', MSG)).toBe('4.50'); // recorta espacios alrededor
  expect(exigirMonto(0, MSG)).toBe('0.00');
  expect(exigirMonto(99999999.99, MSG)).toBe('99999999.99');
});

test('exigirMonto rechaza notación científica, booleanos, infinito, tres decimales y fuera de rango', () => {
  for (const malo of ['1e3', 1e21, true, Infinity, -Infinity, NaN, '4.005', -1, '-1', 100000000, '', '  ', null, undefined, {}, [], '4,50', '$4']) {
    expect(() => exigirMonto(malo, MSG), `valor ${String(malo)}`).toThrow(ErrorValidacion);
    expect(() => exigirMonto(malo, MSG), `valor ${String(malo)}`).toThrow(MSG);
  }
});

test('exigirMonto con mínimo: un monto de 0 no cuenta como dinero cuando se pide { minimo: 0.01 }', () => {
  expect(() => exigirMonto(0, MSG, { minimo: 0.01 })).toThrow(ErrorValidacion);
  expect(() => exigirMonto('0.00', MSG, { minimo: 0.01 })).toThrow(ErrorValidacion);
  expect(exigirMonto('0.01', MSG, { minimo: 0.01 })).toBe('0.01');
  expect(exigirMonto(5, MSG, { minimo: 0.01 })).toBe('5.00');
  expect(exigirMonto(0, MSG)).toBe('0.00'); // sin opciones, el mínimo sigue siendo 0
});

test('exigirMonto con máximo: tope propio por debajo del de la base', () => {
  expect(exigirMonto(100, MSG, { maximo: 100 })).toBe('100.00');
  expect(() => exigirMonto(100.01, MSG, { maximo: 100 })).toThrow(ErrorValidacion);
});

test('exigirUuid acepta la forma de uuid en minúsculas o mayúsculas y devuelve el mismo texto', () => {
  expect(exigirUuid('00000000-0000-0000-0000-000000000000')).toBe('00000000-0000-0000-0000-000000000000');
  expect(exigirUuid('2F1C5B6A-9D3E-4C7B-8A1F-0E5D4C3B2A19')).toBe('2F1C5B6A-9D3E-4C7B-8A1F-0E5D4C3B2A19');
});

test('exigirUuid rechaza lo que no tiene forma de uuid, con el mensaje dado', () => {
  for (const malo of ['no-es-un-uuid', '', 7, null, undefined, {}, '00000000-0000-0000-0000-00000000000', '00000000-0000-0000-0000-0000000000000', 'g0000000-0000-0000-0000-000000000000']) {
    expect(() => exigirUuid(malo, 'id malo'), `valor ${String(malo)}`).toThrow(ErrorValidacion);
    expect(() => exigirUuid(malo, 'id malo'), `valor ${String(malo)}`).toThrow('id malo');
  }
  expect(() => exigirUuid('x')).toThrow('El identificador no es válido');
});

test('esViolacionUnica reconoce el 23505 de PostgreSQL envuelto por Drizzle (en cause) y sin envolver, solo para la restricción pedida', () => {
  const pg = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505', constraint_name: 'x_unico' });
  const envuelto = new DrizzleQueryError('insert into x', [], pg);
  expect(esViolacionUnica(envuelto, 'x_unico')).toBe(true);
  expect(esViolacionUnica(pg, 'x_unico')).toBe(true);
  expect(esViolacionUnica(envuelto, 'otra_restriccion')).toBe(false);
  expect(esViolacionUnica(pg, 'otra_restriccion')).toBe(false);
  const otroCodigo = Object.assign(new Error('fk'), { code: '23503', constraint_name: 'x_unico' });
  expect(esViolacionUnica(otroCodigo, 'x_unico')).toBe(false);
  expect(esViolacionUnica(new DrizzleQueryError('q', [], otroCodigo), 'x_unico')).toBe(false);
  for (const raro of [null, undefined, 'texto', 42, new Error('sin código'), new DrizzleQueryError('q', [], undefined)]) {
    expect(esViolacionUnica(raro, 'x_unico'), String(raro)).toBe(false);
  }
});
