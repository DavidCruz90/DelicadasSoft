import { test, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { crearAppDePrueba } from './ayuda/app';
import { crearUsuarioDePrueba, abrirSesionDePrueba } from './ayuda/acceso';
import { verificarPin } from '../src/servidor/seguridad/pin';

const ejecutar = promisify(execFile);
const URL = process.env.DATABASE_URL_TEST ?? 'postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria_test';
const TSX = join('node_modules', '.bin', 'tsx');

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

type Salida = { code?: number; stdout: string; stderr: string };
// El comando lee DATABASE_URL; dotenv no pisa una variable que ya viene en el entorno.
const correr = (args: string[], url = URL): Promise<Salida> =>
  ejecutar(TSX, ['src/servidor/restablecer-pin.ts', ...args], { env: { ...process.env, DATABASE_URL: url } })
    .then((r) => ({ code: 0, ...r }), (e) => e as Salida);

test('el comando escribe el PIN nuevo del administrador, avisa por consola y cierra sus sesiones abiertas', async () => {
  // Antes: la sesión del admin de prueba (abierta en la PC de caja) entra.
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion' })).statusCode).toBe(200);
  const otraSesion = await abrirSesionDePrueba(ctx.db, ctx.admin);

  const r = await correr(['--nombre', 'admin de prueba', '--pin', '9876']);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('PIN restablecido para Admin de prueba');
  expect(r.stdout + r.stderr).not.toContain('9876');
  const [fila] = await ctx.sql`SELECT pin_hash FROM usuario WHERE id = ${ctx.admin.id}`;
  expect(await verificarPin('9876', fila.pin_hash)).toBe(true);
  expect(await verificarPin('1234', fila.pin_hash)).toBe(false);

  // Después: todas sus sesiones quedaron cerradas (decisión de Dave: cambiar
  // el PIN saca al instante). Esta parte no distingue un comando defectuoso
  // de uno correcto, porque el cierre ya vive en cambiarPin; queda como
  // guarda de que el comando siga pasando por ahí.
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion' })).statusCode).toBe(401);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', headers: { cookie: otraSesion } })).statusCode).toBe(401);
  expect(await ctx.sql`SELECT id FROM sesion WHERE usuario_id = ${ctx.admin.id} AND cerrada_en IS NULL`).toHaveLength(0);
});

test('con un nombre que no es de un admin activo (nadie, mesero, admin inactivo) termina con código 1 y el motivo, sin tocar ningún PIN', async () => {
  const mesero = await crearUsuarioDePrueba(ctx.db, 'Mesero Uno', 'mesero', '1111');
  const inactivo = await crearUsuarioDePrueba(ctx.db, 'Admin Dormido', 'admin', '2222');
  await ctx.sql`UPDATE usuario SET activo = false WHERE id = ${inactivo.id}`;

  const nadie = await correr(['--nombre', 'Nadie', '--pin', '9876']);
  expect(nadie.code).toBe(1);
  expect(nadie.stderr).toContain('No hay un administrador activo llamado "Nadie"');
  const noAdmin = await correr(['--nombre', 'Mesero Uno', '--pin', '9876']);
  expect(noAdmin.code).toBe(1);
  expect(noAdmin.stderr).toContain('No hay un administrador activo llamado "Mesero Uno"');
  const dormido = await correr(['--nombre', 'Admin Dormido', '--pin', '9876']);
  expect(dormido.code).toBe(1);
  expect(dormido.stderr).toContain('No hay un administrador activo llamado "Admin Dormido"');

  const [m] = await ctx.sql`SELECT pin_hash FROM usuario WHERE id = ${mesero.id}`;
  expect(await verificarPin('1111', m.pin_hash)).toBe(true);
  const [d] = await ctx.sql`SELECT pin_hash FROM usuario WHERE id = ${inactivo.id}`;
  expect(await verificarPin('2222', d.pin_hash)).toBe(true);
});

test('con un PIN inválido (3 o 5 dígitos, letras, vacío) termina con código 1 y el motivo', async () => {
  for (const pin of ['987', '98765', '98a6', '']) {
    const r = await correr(['--nombre', 'Admin de prueba', '--pin', pin]);
    expect(r.code, `pin "${pin}"`).toBe(1);
    expect(r.stderr, `pin "${pin}"`).toContain('El PIN debe tener exactamente 4 dígitos');
  }
  const [fila] = await ctx.sql`SELECT pin_hash FROM usuario WHERE id = ${ctx.admin.id}`;
  expect(await verificarPin('9876', fila.pin_hash)).toBe(true);
});

// Modo interactivo: las respuestas llegan por la entrada estándar, todas de
// golpe (así las manda un lanzador o una tubería, sin terminal). El comando
// tiene que leerlas en orden y no perder ninguna.
const correrConEntrada = (args: string[], entrada: string): Promise<Salida> => {
  const p = ejecutar(TSX, ['src/servidor/restablecer-pin.ts', ...args], { env: { ...process.env, DATABASE_URL: URL } });
  p.child.stdin!.end(entrada);
  return p.then((r) => ({ code: 0, ...r }), (e) => e as Salida);
};

test('sin argumentos pregunta nombre, PIN y confirmación por la entrada estándar y restablece', async () => {
  const r = await correrConEntrada([], 'admin de prueba\n4321\n4321\n');
  expect(r.stderr).toBe('');
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('Nombre del administrador:');
  expect(r.stdout).toContain('PIN restablecido para Admin de prueba');
  const [fila] = await ctx.sql`SELECT pin_hash FROM usuario WHERE id = ${ctx.admin.id}`;
  expect(await verificarPin('4321', fila.pin_hash)).toBe(true);
});

test('si la confirmación del PIN no coincide, o la entrada se acaba antes de responder, termina con código 1 sin cambiar nada', async () => {
  const distinto = await correrConEntrada(['--nombre', 'Admin de prueba'], '5555\n5556\n');
  expect(distinto.code).toBe(1);
  expect(distinto.stderr).toContain('Los PIN no coinciden. No se cambió nada.');
  const cortada = await correrConEntrada(['--nombre', 'Admin de prueba'], '5555\n');
  expect(cortada.code).toBe(1);
  expect(cortada.stderr).not.toContain('await');
  const [fila] = await ctx.sql`SELECT pin_hash FROM usuario WHERE id = ${ctx.admin.id}`;
  expect(await verificarPin('4321', fila.pin_hash)).toBe(true);
});

test('si la base de datos no responde, termina con código 1 y un mensaje en español, no con una traza', async () => {
  // Puerto cerrado: la conexión se rechaza al instante.
  const r = await correr(['--nombre', 'Admin de prueba', '--pin', '9876'], 'postgres://cafeteria:cafeteria@127.0.0.1:1/cafeteria_test');
  expect(r.code).toBe(1);
  expect(r.stderr).toContain('No se pudo conectar con la base de datos (¿está encendida?)');
  expect(r.stderr).not.toContain('ECONNREFUSED');
  expect(r.stderr).not.toMatch(/\n\s+at /);
});

test('con un argumento desconocido o sin nombre termina con código 1 y un mensaje claro, no con una traza', async () => {
  const raro = await correr(['--usuario', 'Dave', '--pin', '1234']);
  expect(raro.code).toBe(1);
  expect(raro.stderr).toContain('--nombre');
  expect(raro.stderr).not.toContain('at ');
  const sinNombre = await correr(['--nombre', '', '--pin', '1234']);
  expect(sinNombre.code).toBe(1);
  expect(sinNombre.stderr).toContain('El nombre del usuario no puede estar vacío');
});
