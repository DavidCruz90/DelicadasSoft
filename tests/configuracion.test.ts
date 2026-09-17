import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('PATCH actualiza campos y emite evento config', async () => {
  const eventos: string[] = [];
  ctx.app.bus.suscribir((e) => eventos.push(e.nombre));
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { nombre_local: 'Delicadas', cantidad_mesas: 8, cocina_activa: true } });
  expect(r.statusCode).toBe(200);
  expect(r.json().nombre_local).toBe('Delicadas');
  expect(r.json().cantidad_mesas).toBe(8);
  expect(eventos).toContain('config');
  const g = await ctx.app.inject({ method: 'GET', url: '/api/admin/configuracion' });
  expect(g.json().cocina_activa).toBe(true);
});

test('PATCH rechaza cantidad de mesas fuera de rango', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { cantidad_mesas: 0 } });
  expect(r.statusCode).toBe(400);
  expect(r.json().error).toBe('La cantidad de mesas debe estar entre 1 y 200');
});

test('PATCH ignora campos desconocidos', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { id: 'x', otro: 1 } });
  expect(r.statusCode).toBe(200);
});

test('PATCH rechaza un booleano enviado como texto en vez de guardarlo mal', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { cocina_activa: 'true' } });
  expect(r.statusCode).toBe(400);
  const g = await ctx.app.inject({ method: 'GET', url: '/api/admin/configuracion' });
  expect(g.json().cocina_activa).toBe(true); // sigue el valor de la primera prueba, no se sobrescribió con basura
});

test('PATCH rechaza null en un campo de texto obligatorio con 400, no 500, y el mensaje no usa el nombre técnico del campo', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { nombre_local: null } });
  expect(r.statusCode).toBe(400);
  expect(r.json().error).toBe('El nombre del local debe ser texto');
});

test('PATCH con un cuerpo que no es un objeto responde 400, no 500', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', headers: { 'content-type': 'application/json' }, payload: '1' });
  expect(r.statusCode).toBe(400);
});

test('PATCH sin cuerpo sigue respondiendo 200, sin cambios', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion' });
  expect(r.statusCode).toBe(200);
});

test('PATCH rechaza un umbral de stock bajo desmesurado', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { umbral_stock_bajo: 99999999999 } });
  expect(r.statusCode).toBe(400);
});

test('PATCH recorta los espacios del nombre del local', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { nombre_local: '  Delicadas  ' } });
  expect(r.statusCode).toBe(200);
  expect(r.json().nombre_local).toBe('Delicadas');
});

test('PATCH rechaza simbolo de moneda vacio o demasiado largo', async () => {
  const vacio = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { simbolo_moneda: '   ' } });
  expect(vacio.statusCode).toBe(400);
  const largo = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { simbolo_moneda: '123456' } });
  expect(largo.statusCode).toBe(400);
});

test('PATCH acepta la propina como cadena numerica limpia y rechaza una cadena sucia', async () => {
  const limpia = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { propina_sugerida_pct: '12.5' } });
  expect(limpia.statusCode).toBe(200);
  expect(limpia.json().propina_sugerida_pct).toBe('12.50');
  const sucia = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { propina_sugerida_pct: '12.5%' } });
  expect(sucia.statusCode).toBe(400);
});

// --- Ronda final del plan 1 ---

test('la propina pasa por exigirMonto: un tercer decimal se rechaza en vez de redondearse, y el tope es 100', async () => {
  const tresDecimales = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { propina_sugerida_pct: 12.555 } });
  expect(tresDecimales.statusCode).toBe(400);
  const g = await ctx.app.inject({ method: 'GET', url: '/api/admin/configuracion' });
  expect(g.json().propina_sugerida_pct).toBe('12.50'); // sigue el valor de la prueba anterior
  const pasa = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { propina_sugerida_pct: 100 } });
  expect(pasa.statusCode).toBe(200);
  expect(pasa.json().propina_sugerida_pct).toBe('100.00');
  const excede = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { propina_sugerida_pct: 100.01 } });
  expect(excede.statusCode).toBe(400);
  const booleano = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { propina_sugerida_pct: true } });
  expect(booleano.statusCode).toBe(400);
});

test('los mensajes de tipo de los interruptores no usan el nombre técnico de la columna', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { sonido_cocina: 'sí' } });
  expect(r.statusCode).toBe(400);
  expect(r.json().error).toBe('El sonido de cocina debe ser verdadero o falso');
});

test('PATCH mueve actualizado_en sin que el módulo lo escriba a mano', async () => {
  const antes = new Date((await ctx.app.inject({ method: 'GET', url: '/api/admin/configuracion' })).json().actualizado_en).getTime();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { cantidad_mesas: 9 } });
  expect(r.statusCode).toBe(200);
  expect(new Date(r.json().actualizado_en).getTime()).toBeGreaterThan(antes);
});
