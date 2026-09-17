import http from 'node:http';
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';
import { crearApp } from '../src/servidor/app';
import { ErrorNegocio, ErrorValidacion, NoEncontrado } from '../src/servidor/errores';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('GET /api/estado devuelve configuracion y jornada nula, sin lista de usuarios', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/estado' });
  expect(r.statusCode).toBe(200);
  const cuerpo = r.json();
  expect(cuerpo.configuracion.nombre_local).toBe('Cafetería');
  expect(cuerpo.jornada).toBeNull();
  expect('meseros' in cuerpo).toBe(false);
});

test('una ruta inexistente responde 404 con {error}', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/no-existe' });
  expect(r.statusCode).toBe(404);
  expect(r.json().error).toBe('No existe');
});

test('el bus de eventos entrega lo emitido a los suscriptores', async () => {
  const recibidos: string[] = [];
  const cancelar = ctx.app.bus.suscribir((e) => recibidos.push(e.nombre));
  ctx.app.bus.emitir('stock', { producto_id: 'x' });
  cancelar();
  ctx.app.bus.emitir('stock');
  expect(recibidos).toEqual(['stock']);
});

test('GET /api/eventos responde como text/event-stream', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/eventos', payloadAsStream: true });
  expect(r.statusCode).toBe(200);
  expect(r.headers['content-type']).toContain('text/event-stream');
  r.stream().destroy();
});

test('un suscriptor que lanza no rompe emitir ni impide avisar al resto', () => {
  const recibidos: string[] = [];
  const cancelarRoto = ctx.app.bus.suscribir(() => { throw new Error('suscriptor roto'); });
  const cancelarSano = ctx.app.bus.suscribir((e) => recibidos.push(e.nombre));
  expect(() => ctx.app.bus.emitir('config')).not.toThrow();
  cancelarRoto();
  cancelarSano();
  expect(recibidos).toEqual(['config']);
});

test('el manejador de errores traduce cada tipo a su codigo HTTP y cuerpo {error}', async () => {
  const appPrueba = await crearApp({ db: ctx.db });
  appPrueba.get('/api/prueba/negocio', async () => { throw new ErrorNegocio('conflicto de negocio'); });
  appPrueba.get('/api/prueba/validacion', async () => { throw new ErrorValidacion('dato invalido'); });
  appPrueba.get('/api/prueba/no-encontrado', async () => { throw new NoEncontrado('recurso no existe'); });
  appPrueba.get('/api/prueba/generico', async () => { throw new Error('detalle interno secreto'); });
  appPrueba.post('/api/prueba/cuerpo', async (req) => ({ recibido: req.body }));
  await appPrueba.ready();

  const rNegocio = await appPrueba.inject({ method: 'GET', url: '/api/prueba/negocio' });
  expect(rNegocio.statusCode).toBe(409);
  expect(rNegocio.json()).toEqual({ error: 'conflicto de negocio' });

  const rValidacion = await appPrueba.inject({ method: 'GET', url: '/api/prueba/validacion' });
  expect(rValidacion.statusCode).toBe(400);
  expect(rValidacion.json()).toEqual({ error: 'dato invalido' });

  const rNoEncontrado = await appPrueba.inject({ method: 'GET', url: '/api/prueba/no-encontrado' });
  expect(rNoEncontrado.statusCode).toBe(404);
  expect(rNoEncontrado.json()).toEqual({ error: 'recurso no existe' });

  const rGenerico = await appPrueba.inject({ method: 'GET', url: '/api/prueba/generico' });
  expect(rGenerico.statusCode).toBe(500);
  expect(rGenerico.json().error).toBe('Error inesperado del servidor');
  expect(rGenerico.json().error).not.toContain('detalle interno secreto');

  const rCuerpoMalo = await appPrueba.inject({
    method: 'POST',
    url: '/api/prueba/cuerpo',
    headers: { 'content-type': 'application/json' },
    payload: '{ esto no es json',
  });
  expect(rCuerpoMalo.statusCode).toBe(400);
  expect(rCuerpoMalo.json()).toEqual({ error: 'Cuerpo inválido' });

  await appPrueba.close();
});

test('app.close() termina rapido con una conexion abierta a /api/eventos', async () => {
  const appTemp = await crearApp({ db: ctx.db });
  await appTemp.listen({ port: 0, host: '127.0.0.1' });
  const direccion = appTemp.server.address();
  const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;

  await new Promise<void>((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${puerto}/api/eventos`, (res) => {
      res.on('data', () => {});
      resolve();
    });
    req.on('error', reject);
  });

  const inicio = Date.now();
  await appTemp.close();
  const duracion = Date.now() - inicio;
  expect(duracion).toBeLessThan(2000);
});
