# Plan 4 de 4 — Entrega del Núcleo POS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Dave pueda instalar el sistema en la PC de caja con Windows sin conocimientos técnicos: una carpeta, doble clic, respaldos desde pantalla, registro de errores descargable, y una prueba automática de extremo a extremo que recorre un día completo.

**Architecture:** El lanzador es el mismo servidor Node con un arranque previo que enciende PostgreSQL portátil; se empaqueta con esbuild en un solo archivo y se convierte en `Cafeteria.exe` con Node SEA. Los respaldos llaman a `pg_dump`/`pg_restore` del PostgreSQL portátil (o del contenedor Docker en desarrollo). El log va a archivo con rotación diaria.

**Tech Stack:** el de los planes anteriores más `esbuild`, `postject` (empaquetado), `qrcode` (QR en la página de conexión) y `@playwright/test` (E2E).

**Spec:** `docs/superpowers/specs/2026-09-12-nucleo-pos-design.md` secciones 3.1, 3.3, 7.4 (respaldos, log), 8 (errores del servidor, PostgreSQL no arranca), 9 (E2E). **Requiere planes 1, 2 y 3 terminados.**

**Modelos y skills:** no hay modelo por defecto. Cada tarea indica abajo su modelo ejecutor, su skill, su revisor y su motivo. Resumen de este plan:

| Tarea | Modelo ejecutor | Skill principal | Revisor |
|---|---|---|---|
| Task 1 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 2 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 3 | `claude-fable-5-1` | `superpowers:test-driven-development` para conectar.ts y `superpowers:systematic-debugging` si el arranque en Windows falla | `claude-fable-5-1` |
| Task 4 | `claude-fable-5-1` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 5 | `claude-sonnet-5` | `superpowers:verification-before-completion` (redacción y comprobación de textos; sin TDD porque no hay código) | `claude-fable-5-1` |

**Revisión de cada tarea:** el revisor usa `superpowers:requesting-code-review` con modelo `claude-fable-5-1`: primero revisa contra la spec (¿hace lo que el plan pide, ni más ni menos?), luego calidad del código. Si hay observaciones, el ejecutor las atiende con `superpowers:receiving-code-review` y se vuelve a revisar. La tarea solo se marca terminada cuando el revisor aprueba y `superpowers:verification-before-completion` confirma la salida del comando de verificación.

## Global Constraints

- Las de los planes anteriores.
- Variables de entorno nuevas (todas con valor por defecto): `PG_BIN` (carpeta con `pg_dump`, `pg_restore`, `pg_ctl`, `initdb`; por defecto `pgsql/bin` relativo a la carpeta del programa), `PG_DOCKER` (nombre de contenedor; si está definida, los comandos se ejecutan con `docker exec`; en esta Mac: `cafeteria-pg`), `CARPETA_RESPALDOS` (por defecto `Respaldos`), `CARPETA_LOGS` (por defecto `logs`), `CARPETA_DATOS_PG` (por defecto `datos`).
- El ejecutable y la carpeta final se llaman `Cafeteria`. Windows 10 u 11 de 64 bits.

## File Structure

```
src/servidor/logs.ts                  crearLogger(): pino a archivo diario + consola; limpiarLogsViejos(); rutaLogs
src/servidor/respaldos.ts             crearRespaldo, listarRespaldos, restaurarRespaldo, rutasRespaldos
src/servidor/pg.ts                    ejecutarPg(herramienta, args): usa PG_BIN o docker exec
src/servidor/lanzador.ts              arranque completo: PostgreSQL portátil + servidor + página /conectar
src/servidor/conectar.ts              GET /conectar: IP local, URL por rol y QR
scripts/empaquetar.mjs                construye build/Cafeteria/ (Windows) o build/Cafeteria-mac/
sea-config.json                       configuración de Node SEA
src/web/admin/Respaldos.tsx           crear, listar, restaurar, descargar log
tests/respaldos.test.ts, tests/logs.test.ts
e2e/dia-completo.spec.ts, playwright.config.ts
docs/MANUAL.md                        manual de instalación y uso para Dave
```

---

### Task 1: Registro de errores en archivo
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/logs.ts`, `tests/logs.test.ts`
- Modify: `src/servidor/config.ts`, `src/servidor/app.ts` (usar el logger y exponer descarga), `src/web/admin/Configuracion.tsx` (botón "Descargar registro de hoy")

**Interfaces:**
- Produces:
  - `crearLogger(carpeta: string)`: devuelve un logger pino que escribe en `<carpeta>/servidor-AAAA-MM-DD.log` (fecha del arranque; si el proceso cruza medianoche, sigue en el mismo archivo hasta reiniciar) y también en consola. Nivel `info`; errores 500 se registran con `error`.
  - `limpiarLogsViejos(carpeta, dias = 30)`: borra `servidor-*.log` con más de `dias` días.
  - `GET /api/admin/logs` → descarga el archivo de hoy como `text/plain`; `GET /api/admin/logs?fecha=AAAA-MM-DD` uno anterior; 404 si no existe.
  - `crearApp({ db, logger? })`: si se pasa `logger`, Fastify lo usa; el `setErrorHandler` registra los 500 con `app.log.error({ err, url: req.url })`.

- [ ] **Step 1: Escribir la prueba**

`tests/logs.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, utimesSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepararBaseDePrueba } from './ayuda/db';
import { crearApp } from '../src/servidor/app';
import { crearLogger, limpiarLogsViejos } from '../src/servidor/logs';

const carpeta = mkdtempSync(join(tmpdir(), 'logs-'));
let ctx: Awaited<ReturnType<typeof prepararBaseDePrueba>>;
let app: Awaited<ReturnType<typeof crearApp>>;
beforeAll(async () => {
  ctx = await prepararBaseDePrueba();
  process.env.CARPETA_LOGS = carpeta;
  app = await crearApp({ db: ctx.db, logger: crearLogger(carpeta) });
  app.get('/api/explota', async () => { throw new Error('boom'); });
  await app.ready();
});
afterAll(async () => { await app.close(); await ctx.sql.end(); });

test('un error 500 queda en el archivo del dia y se puede descargar', async () => {
  const r = await app.inject({ method: 'GET', url: '/api/explota' });
  expect(r.statusCode).toBe(500);
  expect(r.json().error).toBe('Error inesperado del servidor');
  await new Promise((res) => setTimeout(res, 200));
  const hoy = new Date().toISOString().slice(0, 10);
  const archivo = join(carpeta, `servidor-${hoy}.log`);
  expect(existsSync(archivo)).toBe(true);
  expect(readFileSync(archivo, 'utf8')).toContain('boom');
  const d = await app.inject({ method: 'GET', url: '/api/admin/logs' });
  expect(d.statusCode).toBe(200);
  expect(d.headers['content-type']).toContain('text/plain');
  expect(d.body).toContain('boom');
  const no = await app.inject({ method: 'GET', url: '/api/admin/logs?fecha=2000-01-01' });
  expect(no.statusCode).toBe(404);
});

test('limpiarLogsViejos borra archivos de mas de 30 dias', () => {
  const viejo = join(carpeta, 'servidor-2020-01-01.log');
  writeFileSync(viejo, 'x');
  const hace40 = new Date(Date.now() - 40 * 86400000);
  utimesSync(viejo, hace40, hace40);
  limpiarLogsViejos(carpeta, 30);
  expect(existsSync(viejo)).toBe(false);
});
```

- [ ] **Step 2: Ejecutar** → FAIL (módulo no existe).

- [ ] **Step 3: Escribir logs.ts**

`src/servidor/logs.ts`:
```ts
import pino from 'pino';
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { NoEncontrado, ErrorValidacion } from './errores';

export const nombreLog = (fecha = new Date()) => `servidor-${fecha.toISOString().slice(0, 10)}.log`;

export function crearLogger(carpeta: string) {
  mkdirSync(carpeta, { recursive: true });
  const archivo = createWriteStream(join(carpeta, nombreLog()), { flags: 'a' });
  const consola = pino.destination(1);
  const multi = pino.multistream([{ stream: archivo }, { stream: consola }]);
  return pino({ level: 'info', timestamp: pino.stdTimeFunctions.isoTime }, multi);
}

export function limpiarLogsViejos(carpeta: string, dias = 30) {
  if (!existsSync(carpeta)) return;
  const limite = Date.now() - dias * 86400000;
  for (const f of readdirSync(carpeta)) {
    if (!/^servidor-\d{4}-\d{2}-\d{2}\.log$/.test(f)) continue;
    const ruta = join(carpeta, f);
    if (statSync(ruta).mtimeMs < limite) unlinkSync(ruta);
  }
}

export function rutaLogs(app: FastifyInstance, carpeta: string) {
  app.get<{ Querystring: { fecha?: string } }>('/api/admin/logs', async (req, reply) => {
    const fecha = req.query.fecha ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ErrorValidacion('Fecha inválida');
    const ruta = join(carpeta, `servidor-${fecha}.log`);
    if (!existsSync(ruta)) throw new NoEncontrado('No hay registro para esa fecha');
    reply.type('text/plain; charset=utf-8').header('Content-Disposition', `attachment; filename="servidor-${fecha}.log"`);
    return (await import('node:fs/promises')).readFile(ruta, 'utf8');
  });
}
```

`pino` viene con Fastify; agregarlo explícito: `npm install pino@9`.

- [ ] **Step 4: Integrar en config.ts y app.ts**

En `config.ts` agregar `carpetaLogs: process.env.CARPETA_LOGS ?? 'logs'`, `carpetaRespaldos: process.env.CARPETA_RESPALDOS ?? 'Respaldos'`, `carpetaDatosPg: process.env.CARPETA_DATOS_PG ?? 'datos'`, `pgBin: process.env.PG_BIN ?? join('pgsql', 'bin')`, `pgDocker: process.env.PG_DOCKER ?? ''` (importar `join` de `node:path`).

En `app.ts`: firma `crearApp({ db, logger }: { db: Db; logger?: any })`, `Fastify({ logger: logger ?? false })`; en el error handler, para 500: `app.log.error({ err, url: req.url }, 'Error inesperado');` (el handler recibe `req` como segundo parámetro). Registrar `rutaLogs(app, process.env.CARPETA_LOGS ?? config.carpetaLogs)` (leer `process.env` en el momento para que las pruebas puedan cambiar la carpeta).

En `index.ts`: `const logger = crearLogger(config.carpetaLogs); limpiarLogsViejos(config.carpetaLogs);` y pasar `logger` a `crearApp`.

En `Configuracion.tsx`: al final del formulario, `<a href="/api/admin/logs" download><button type="button">Descargar registro de hoy</button></a>`.

- [ ] **Step 5: Ejecutar** → `npm run typecheck && npm test` → pasa.

- [ ] **Step 6: Commit y push**

```bash
git add -A && git commit -m "Registro de errores en archivo diario con descarga desde admin" && git push origin main
```

---

### Task 2: Respaldos y restauración
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/pg.ts`, `src/servidor/respaldos.ts`, `tests/respaldos.test.ts`, `src/web/admin/Respaldos.tsx`
- Modify: `src/servidor/app.ts`, `src/servidor/modulos/jornada.ts` (respaldo automático al cerrar), `src/web/admin/AppAdmin.tsx` (pestaña Respaldos)

**Interfaces:**
- Produces:
  - `ejecutarPg(herramienta: 'pg_dump' | 'pg_restore' | 'pg_ctl' | 'initdb' | 'createdb' | 'psql', args: string[], opciones?: { entrada?: string }): Promise<{ codigo: number; salida: string; error: string }>`. Si `config.pgDocker` está definido: `docker exec -i <contenedor> <herramienta> ...args`; si no: `<PG_BIN>/<herramienta>(.exe en Windows) ...args`. Pasa `PGPASSWORD=cafeteria` en el entorno.
  - `crearRespaldo(db)` → `{ archivo: 'cafeteria-AAAA-MM-DD-HHMM.backup', fotos: 'cafeteria-AAAA-MM-DD-HHMM.fotos.tar' | null, bytes }`. Usa `pg_dump -Fc -h 127.0.0.1 -p 5433 -U cafeteria -d <base> -f -` y escribe la salida estándar al archivo (con Docker el archivo no está en el contenedor, por eso se usa stdout). Fotos: `tar -cf` de la carpeta `fotos/` si existe y no está vacía.
  - `listarRespaldos()` → `[{ archivo, bytes, fecha }]` orden descendente.
  - `restaurarRespaldo(db, archivo, confirmacion)` → 400 si `confirmacion !== 'RESTAURAR'`; 409 `Hay caja abierta` si hay jornada abierta; 404 si el archivo no existe; ejecuta `pg_restore --clean --if-exists --no-owner -h 127.0.0.1 -p 5433 -U cafeteria -d <base>` leyendo el archivo por stdin; luego extrae el `.tar` de fotos si existe. Devuelve `{ restaurado: true }`.
  - Rutas: `GET /api/admin/respaldos`, `POST /api/admin/respaldos` (201), `POST /api/admin/respaldos/restaurar` `{ archivo, confirmacion }`, `GET /api/admin/respaldos/:archivo` (descarga).
  - Cierre de caja: después de cerrar, `rutasJornada` llama a `crearRespaldo`; si falla, se registra en el log y el cierre NO falla; la respuesta incluye `respaldo: { archivo } | { error }`.
- La base a respaldar se toma de `config.databaseUrl` (nombre tras la última `/`), para que las pruebas respalden `cafeteria_test`.

- [ ] **Step 1: Escribir la prueba**

`tests/respaldos.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearAppDePrueba } from './ayuda/app';

const carpeta = mkdtempSync(join(tmpdir(), 'resp-'));
let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => {
  process.env.CARPETA_RESPALDOS = carpeta;
  process.env.PG_DOCKER = process.env.PG_DOCKER ?? 'cafeteria-pg';
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? 'postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria_test';
  ctx = await crearAppDePrueba();
});
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('respaldar, listar, restaurar y rechazar sin confirmacion', async () => {
  await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { nombre_local: 'Antes' } });
  const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/respaldos' });
  expect(r.statusCode).toBe(201);
  const archivo = r.json().archivo;
  expect(archivo).toMatch(/^cafeteria-\d{4}-\d{2}-\d{2}-\d{4}\.backup$/);
  expect(existsSync(join(carpeta, archivo))).toBe(true);
  expect(statSync(join(carpeta, archivo)).size).toBeGreaterThan(1000);
  const lista = await ctx.app.inject({ method: 'GET', url: '/api/admin/respaldos' });
  expect(lista.json()[0].archivo).toBe(archivo);
  await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { nombre_local: 'Después' } });
  const sin = await ctx.app.inject({ method: 'POST', url: '/api/admin/respaldos/restaurar', payload: { archivo, confirmacion: 'no' } });
  expect(sin.statusCode).toBe(400);
  await ctx.app.inject({ method: 'POST', url: '/api/jornadas/abrir', payload: { fondo_inicial: 0 } });
  const conCaja = await ctx.app.inject({ method: 'POST', url: '/api/admin/respaldos/restaurar', payload: { archivo, confirmacion: 'RESTAURAR' } });
  expect(conCaja.statusCode).toBe(409);
  const cierre = await ctx.app.inject({ method: 'POST', url: '/api/jornadas/cerrar', payload: { efectivo_contado: 0 } });
  expect(cierre.json().respaldo?.archivo).toMatch(/\.backup$/);
  const ok = await ctx.app.inject({ method: 'POST', url: '/api/admin/respaldos/restaurar', payload: { archivo, confirmacion: 'RESTAURAR' } });
  expect(ok.statusCode).toBe(200);
  const cfg = await ctx.app.inject({ method: 'GET', url: '/api/admin/configuracion' });
  expect(cfg.json().nombre_local).toBe('Antes');
  const desc = await ctx.app.inject({ method: 'GET', url: `/api/admin/respaldos/${archivo}` });
  expect(desc.statusCode).toBe(200);
  const inexistente = await ctx.app.inject({ method: 'POST', url: '/api/admin/respaldos/restaurar', payload: { archivo: 'no-existe.backup', confirmacion: 'RESTAURAR' } });
  expect(inexistente.statusCode).toBe(404);
}, 60000);
```

- [ ] **Step 2: Ejecutar** → FAIL (404). Verificar antes que `docker exec cafeteria-pg pg_dump --version` responde `pg_dump (PostgreSQL) 16.x`.

- [ ] **Step 3: Escribir pg.ts**

`src/servidor/pg.ts`:
```ts
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { config } from './config';

type Herramienta = 'pg_dump' | 'pg_restore' | 'pg_ctl' | 'initdb' | 'createdb' | 'psql';

export function ejecutarPg(herramienta: Herramienta, args: string[], opciones: { entrada?: Buffer | string; salidaBinaria?: boolean } = {}) {
  const docker = process.env.PG_DOCKER ?? config.pgDocker;
  const cmd = docker ? 'docker' : join(process.env.PG_BIN ?? config.pgBin, process.platform === 'win32' ? `${herramienta}.exe` : herramienta);
  const argumentos = docker ? ['exec', '-i', '-e', 'PGPASSWORD=cafeteria', docker, herramienta, ...args] : args;
  return new Promise<{ codigo: number; salida: Buffer; error: string }>((resolver) => {
    const p = spawn(cmd, argumentos, { env: { ...process.env, PGPASSWORD: 'cafeteria' } });
    const trozos: Buffer[] = []; let error = '';
    p.stdout.on('data', (d) => trozos.push(d));
    p.stderr.on('data', (d) => { error += d.toString(); });
    p.on('error', (e) => resolver({ codigo: -1, salida: Buffer.alloc(0), error: e.message }));
    p.on('close', (codigo) => resolver({ codigo: codigo ?? -1, salida: Buffer.concat(trozos), error }));
    if (opciones.entrada !== undefined) p.stdin.end(opciones.entrada); else p.stdin.end();
  });
}

export function nombreBase(url = config.databaseUrl) {
  return new URL(url).pathname.replace(/^\//, '');
}
export function hostYPuerto(url = config.databaseUrl) {
  const u = new URL(url);
  const docker = process.env.PG_DOCKER ?? config.pgDocker;
  return { host: docker ? '127.0.0.1' : u.hostname, puerto: docker ? '5432' : u.port || '5432', usuario: u.username || 'cafeteria' };
}
```

- [ ] **Step 4: Escribir respaldos.ts**

`src/servidor/respaldos.ts`:
```ts
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import type { Db } from './db/conexion';
import { config } from './config';
import { ErrorNegocio, ErrorValidacion, NoEncontrado } from './errores';
import { obtenerJornadaAbierta } from './modulos/jornada';
import { ejecutarPg, nombreBase, hostYPuerto } from './pg';

const carpetaRespaldos = () => process.env.CARPETA_RESPALDOS ?? config.carpetaRespaldos;
const sello = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };

export async function crearRespaldo(_db: Db) {
  const carpeta = carpetaRespaldos(); mkdirSync(carpeta, { recursive: true });
  const base = nombreBase(process.env.DATABASE_URL ?? config.databaseUrl);
  const { host, puerto, usuario } = hostYPuerto(process.env.DATABASE_URL ?? config.databaseUrl);
  const nombre = `cafeteria-${sello()}.backup`;
  const r = await ejecutarPg('pg_dump', ['-Fc', '-h', host, '-p', puerto, '-U', usuario, '-d', base]);
  if (r.codigo !== 0) throw new ErrorNegocio(`No se pudo crear el respaldo: ${r.error.trim() || 'pg_dump falló'}`);
  writeFileSync(join(carpeta, nombre), r.salida);
  let fotos: string | null = null;
  const carpetaFotos = config.carpetaFotos;
  if (existsSync(carpetaFotos) && readdirSync(carpetaFotos).length) {
    fotos = nombre.replace(/\.backup$/, '.fotos.tar');
    const t = spawnSync('tar', ['-cf', join(carpeta, fotos), '-C', carpetaFotos, '.']);
    if (t.status !== 0) fotos = null;
  }
  return { archivo: nombre, fotos, bytes: r.salida.length };
}

export function listarRespaldos() {
  const carpeta = carpetaRespaldos();
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta).filter((f) => f.endsWith('.backup')).map((f) => { const s = statSync(join(carpeta, f)); return { archivo: f, bytes: s.size, fecha: s.mtime }; }).sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
}

export async function restaurarRespaldo(db: Db, archivo: string, confirmacion: string) {
  if (confirmacion !== 'RESTAURAR') throw new ErrorValidacion('Escribe RESTAURAR para confirmar');
  if (await obtenerJornadaAbierta(db)) throw new ErrorNegocio('Hay caja abierta; cierra la caja antes de restaurar');
  const nombre = basename(String(archivo));
  const ruta = join(carpetaRespaldos(), nombre);
  if (!nombre.endsWith('.backup') || !existsSync(ruta)) throw new NoEncontrado('El respaldo no existe');
  const base = nombreBase(process.env.DATABASE_URL ?? config.databaseUrl);
  const { host, puerto, usuario } = hostYPuerto(process.env.DATABASE_URL ?? config.databaseUrl);
  const r = await ejecutarPg('pg_restore', ['--clean', '--if-exists', '--no-owner', '-h', host, '-p', puerto, '-U', usuario, '-d', base], { entrada: readFileSync(ruta) });
  if (r.codigo !== 0 && !/ya existe|already exists|does not exist/i.test(r.error)) throw new ErrorNegocio(`No se pudo restaurar: ${r.error.trim()}`);
  const fotos = ruta.replace(/\.backup$/, '.fotos.tar');
  if (existsSync(fotos)) { mkdirSync(config.carpetaFotos, { recursive: true }); spawnSync('tar', ['-xf', fotos, '-C', config.carpetaFotos]); }
  return { restaurado: true };
}

export function rutasRespaldos(app: FastifyInstance) {
  app.get('/api/admin/respaldos', async () => listarRespaldos());
  app.post('/api/admin/respaldos', async (_req, reply) => reply.status(201).send(await crearRespaldo(app.db)));
  app.post('/api/admin/respaldos/restaurar', async (req) => {
    const b = req.body as { archivo: string; confirmacion: string };
    const r = await restaurarRespaldo(app.db, b?.archivo, b?.confirmacion);
    app.bus.emitir('config'); app.bus.emitir('catalogo'); app.bus.emitir('jornada');
    return r;
  });
  app.get<{ Params: { archivo: string } }>('/api/admin/respaldos/:archivo', async (req, reply) => {
    const nombre = basename(req.params.archivo); const ruta = join(carpetaRespaldos(), nombre);
    if (!nombre.endsWith('.backup') || !existsSync(ruta)) throw new NoEncontrado('El respaldo no existe');
    reply.type('application/octet-stream').header('Content-Disposition', `attachment; filename="${nombre}"`);
    return readFileSync(ruta);
  });
}
```

- [ ] **Step 5: Integrar**: en `app.ts` registrar `rutasRespaldos(app)`. En `modulos/jornada.ts`, en la ruta `POST /api/jornadas/cerrar`:
```ts
  app.post('/api/jornadas/cerrar', async (req) => {
    const j = await cerrarJornada(app.db, req.body as any);
    app.bus.emitir('jornada');
    let respaldo: any;
    try { respaldo = await crearRespaldo(app.db); } catch (e: any) { app.log.error({ err: e }, 'Respaldo automático falló'); respaldo = { error: e.message }; }
    return { ...j, respaldo };
  });
```
con `import { crearRespaldo } from '../respaldos';`. Nota: `jornada.test.ts` del plan 2 sigue pasando porque solo comprueba campos de `j`; si en el entorno de prueba no hay `PG_DOCKER`, `respaldo` tendrá `error` y no rompe.

- [ ] **Step 6: Escribir Respaldos.tsx y la pestaña**

`src/web/admin/Respaldos.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { Aviso } from '../componentes/Aviso';

export function Respaldos() {
  const [lista, setLista] = useState<any[]>([]);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const cargar = () => api.get('/api/admin/respaldos').then(setLista);
  useEffect(() => { cargar(); }, []);
  const crear = async () => { setAviso(null); try { const r = await api.post('/api/admin/respaldos'); setAviso({ tipo: 'ok', texto: `Respaldo creado: ${r.archivo}` }); cargar(); } catch (e: any) { setAviso({ tipo: 'error', texto: e.message }); } };
  const restaurar = async (archivo: string) => {
    const c = prompt(`Se reemplazarán TODOS los datos actuales por los del respaldo ${archivo}. Escribe RESTAURAR para confirmar.`);
    if (c === null) return; setAviso(null);
    try { await api.post('/api/admin/respaldos/restaurar', { archivo, confirmacion: c }); setAviso({ tipo: 'ok', texto: 'Respaldo restaurado. Recarga las demás pantallas.' }); } catch (e: any) { setAviso({ tipo: 'error', texto: e.message }); }
  };
  return (
    <div style="display:grid;gap:12px">
      <p>Los respaldos se guardan en la carpeta <code>Respaldos</code> junto al programa. Se crea uno automáticamente al cerrar caja. Copia esa carpeta a un pendrive o a la nube con regularidad.</p>
      <div class="fila"><button class="primario" onClick={crear} style="flex:0 0 auto">Respaldar ahora</button></div>
      <Aviso tipo={aviso?.tipo ?? 'ok'} texto={aviso?.texto ?? null} />
      <table><thead><tr><th>Archivo</th><th>Fecha</th><th>Tamaño</th><th></th></tr></thead>
        <tbody>{lista.map((r) => <tr key={r.archivo}><td>{r.archivo}</td><td>{new Date(r.fecha).toLocaleString('es-EC')}</td><td>{(r.bytes / 1024).toFixed(0)} KB</td>
          <td><a href={`/api/admin/respaldos/${r.archivo}`} download><button>Descargar</button></a> <button class="peligro" onClick={() => restaurar(r.archivo)}>Restaurar</button></td></tr>)}</tbody></table>
    </div>
  );
}
```

En `AppAdmin.tsx`: pestaña `['respaldos', 'Respaldos']` → `<Respaldos />`.

- [ ] **Step 7: Ejecutar** → `npm run typecheck && npm run build && npm test` → todo pasa (la prueba de respaldos tarda unos segundos).

- [ ] **Step 8: Commit y push**

```bash
git add -A && git commit -m "Respaldos con pg_dump/pg_restore, automático al cerrar caja, y restauración desde admin" && git push origin main
```

---

### Task 3: Lanzador, página de conexión y empaquetado para Windows
**Modelo ejecutor:** `claude-fable-5-1`. **Motivo:** la tarea exige criterio propio (concurrencia, dinero, depuración o selectores que el plan no puede anticipar del todo).
**Skill del ejecutor:** `superpowers:test-driven-development` para conectar.ts y `superpowers:systematic-debugging` si el arranque en Windows falla. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/conectar.ts`, `src/servidor/lanzador.ts`, `scripts/empaquetar.mjs`, `sea-config.json`, `docs/MANUAL.md` (sección de instalación; el resto en Task 5)
- Modify: `package.json` (scripts `empaquetar`), `src/servidor/app.ts` (registrar `/conectar`)

**Interfaces:**
- Produces:
  - `GET /conectar` (HTML, sin `/api`): muestra la IP local detectada, las cuatro URL (`http://<ip>:3000/mesero`, `/caja`, `/cocina`, `/admin`) y un código QR por cada una (SVG generado con `qrcode`). Si `cocina_activa` es falso, no muestra cocina.
  - `lanzador.ts`: arranque para producción. Pasos en orden: (1) resolver la carpeta base (`process.cwd()` en desarrollo; la carpeta del ejecutable en SEA, `dirname(process.execPath)`); (2) si `PG_DOCKER` no está definida y existe `pgsql/bin`: si no existe `datos/`, ejecutar `initdb -U cafeteria -A trust -E UTF8 --locale=C -D datos`; luego `pg_ctl -D datos -o "-p 5433" -l logs/postgres.log -w start`; comprobar con `psql -p 5433 -U cafeteria -d postgres -c "select 1"`; crear la base si falta: `createdb -p 5433 -U cafeteria cafeteria`; (3) arrancar el servidor como `index.ts` (migraciones, configuración, escuchar en 3000); (4) imprimir en consola la IP y las URL; (5) abrir el navegador en `http://localhost:3000/conectar` (`start` en Windows, `open` en Mac); (6) al recibir `SIGINT`/`SIGTERM` o cerrarse la consola: cerrar Fastify y `pg_ctl -D datos -w stop`. Si PostgreSQL no arranca, imprime el error, muestra las últimas 30 líneas de `logs/postgres.log` y espera Enter antes de salir ("PostgreSQL no arrancó. Ver registro arriba. Pulsa Enter para reintentar, o cierra la ventana").
  - `scripts/empaquetar.mjs`: construye `build/Cafeteria/` con: `Cafeteria.exe` (o `Cafeteria` en Mac para pruebas), `servidor/cafeteria.cjs` (bundle esbuild de `lanzador.ts`), `servidor/migraciones/` (copia), `servidor/web/` (copia de `dist/web`), `.env` (con `DATABASE_URL`, `PUERTO`, `PG_BIN=pgsql/bin`), carpetas vacías `fotos/`, `Respaldos/`, `logs/`, y `LEEME.txt` con el enlace de descarga de PostgreSQL y dónde descomprimirlo. El bundle busca migraciones y web relativas a la carpeta base (`servidor/migraciones`, `servidor/web`), así que `migrar.ts` y `app.ts` deben resolver esas rutas con una función `rutaRecurso(nombre)` que use `process.env.CARPETA_RECURSOS ?? dirname(fileURLToPath(import.meta.url))`; el lanzador fija `CARPETA_RECURSOS = <base>/servidor`.
  - Node SEA: `sea-config.json` `{ "main": "build/tmp/cafeteria.cjs", "output": "build/tmp/sea-prep.blob", "disableExperimentalSEAWarning": true }`; pasos `node --experimental-sea-config sea-config.json`, copiar `node.exe` (o `process.execPath` en Mac) a `build/Cafeteria/Cafeteria.exe`, `npx postject build/Cafeteria/Cafeteria.exe NODE_SEA_BLOB build/tmp/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2` (en Mac agregar `--macho-segment-name NODE_SEA`).
  - **Alternativa documentada si postject falla en Windows:** `build/Cafeteria/node/node.exe` (Node portátil descargado del zip oficial) + `Cafeteria.bat` con `@echo off` / `cd /d %~dp0` / `node\node.exe servidor\cafeteria.cjs` / `pause`. El manual explica ambas.
- Dependencias: `npm install qrcode@1` y `npm install -D esbuild@0.24 postject@1 @types/qrcode@1`.

- [ ] **Step 1: Escribir conectar.ts y registrarlo**

`src/servidor/conectar.ts`:
```ts
import { networkInterfaces } from 'node:os';
import QRCode from 'qrcode';
import type { FastifyInstance } from 'fastify';
import { obtenerConfiguracion } from './modulos/configuracion';

export function ipLocal(): string {
  for (const lista of Object.values(networkInterfaces())) for (const i of lista ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  return '127.0.0.1';
}

export function rutaConectar(app: FastifyInstance, puerto: number) {
  app.get('/conectar', async (_req, reply) => {
    const cfg = await obtenerConfiguracion(app.db);
    const ip = ipLocal();
    const roles = [['mesero', 'Mesero'], ['caja', 'Caja'], ['admin', 'Admin'], ...(cfg.cocina_activa ? [['cocina', 'Cocina']] : [])];
    const tarjetas = await Promise.all(roles.map(async ([r, t]) => {
      const url = `http://${ip}:${puerto}/${r}`;
      const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 180 });
      return `<div class="c"><h2>${t}</h2>${svg}<p><a href="${url}">${url}</a></p></div>`;
    }));
    reply.type('text/html; charset=utf-8');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar dispositivos</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;color:#1b1f1c;background:#fff}h1{margin:0 0 4px}p.s{color:#7c877f;margin:0 0 20px}.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.c{border:1px solid #d9dfda;border-radius:8px;padding:16px;text-align:center}.c h2{margin:0 0 8px}svg{max-width:180px;height:auto}a{color:#1e6b55;word-break:break-all}</style></head>
<body><h1>${cfg.nombre_local}</h1><p class="s">Conecta cada dispositivo al mismo WiFi y escanea el código de su puesto. Esta PC: <b>${ip}</b></p><div class="g">${tarjetas.join('')}</div></body></html>`;
  });
}
```

En `app.ts`: `rutaConectar(app, config.puerto);` (importar). Añadir prueba en `tests/web.test.ts`:
```ts
test('GET /conectar muestra las URL por rol', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/conectar' });
  expect(r.statusCode).toBe(200);
  expect(r.body).toContain('/mesero');
  expect(r.body).toContain('<svg');
});
```

- [ ] **Step 2: Hacer relocalizables las migraciones y la web**

En `src/servidor/db/migrar.ts`:
```ts
const carpeta = process.env.CARPETA_RECURSOS ? join(process.env.CARPETA_RECURSOS, 'migraciones') : join(dirname(fileURLToPath(import.meta.url)), 'migraciones');
```
En `src/servidor/app.ts`: `const carpetaWeb = process.env.CARPETA_RECURSOS ? join(process.env.CARPETA_RECURSOS, 'web') : resolve('dist/web');`.

Ejecutar `npm test` para confirmar que nada cambió en desarrollo.

- [ ] **Step 3: Escribir lanzador.ts**

`src/servidor/lanzador.ts`:
```ts
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const esSea = typeof (process as any).isSea === 'function' ? (process as any).isSea() : false;
const base = esSea ? dirname(process.execPath) : process.cwd();
process.chdir(base);
process.env.CARPETA_RECURSOS = process.env.CARPETA_RECURSOS ?? join(base, 'servidor');
if (existsSync(join(base, '.env'))) {
  for (const linea of readFileSync(join(base, '.env'), 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
for (const c of ['fotos', 'Respaldos', 'logs']) mkdirSync(join(base, c), { recursive: true });

const { config } = await import('./config');
const { ejecutarPg } = await import('./pg');

async function arrancarPostgres(): Promise<boolean> {
  if (process.env.PG_DOCKER) return true;
  const bin = process.env.PG_BIN ?? config.pgBin;
  if (!existsSync(bin)) { console.error(`No se encontró PostgreSQL en ${bin}. Lee LEEME.txt para instalarlo.`); return false; }
  const datos = config.carpetaDatosPg;
  if (!existsSync(join(datos, 'PG_VERSION'))) {
    console.log('Primera vez: creando la base de datos…');
    const r = await ejecutarPg('initdb', ['-U', 'cafeteria', '-A', 'trust', '-E', 'UTF8', '--locale=C', '-D', datos]);
    if (r.codigo !== 0) { console.error(r.error); return false; }
  }
  const s = await ejecutarPg('pg_ctl', ['-D', datos, '-o', '-p 5433', '-l', join('logs', 'postgres.log'), '-w', 'start']);
  if (s.codigo !== 0 && !/already running|ya se está ejecutando/i.test(s.salida.toString() + s.error)) {
    console.error(s.error || s.salida.toString());
    if (existsSync(join('logs', 'postgres.log'))) console.error(readFileSync(join('logs', 'postgres.log'), 'utf8').split('\n').slice(-30).join('\n'));
    return false;
  }
  const c = await ejecutarPg('createdb', ['-p', '5433', '-U', 'cafeteria', 'cafeteria']);
  if (c.codigo !== 0 && !/already exists|ya existe/i.test(c.error)) { console.error(c.error); return false; }
  return true;
}

async function esperarEnter(mensaje: string) {
  return new Promise<void>((res) => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(mensaje, () => { rl.close(); res(); }); });
}

let ok = await arrancarPostgres();
while (!ok) { await esperarEnter('\nPostgreSQL no arrancó. Revisa el registro arriba. Pulsa Enter para reintentar o cierra la ventana. '); ok = await arrancarPostgres(); }

const { crearDb } = await import('./db/conexion');
const { ejecutarMigraciones } = await import('./db/migrar');
const { asegurarConfiguracion } = await import('./modulos/configuracion');
const { crearApp } = await import('./app');
const { crearLogger, limpiarLogsViejos } = await import('./logs');
const { ipLocal } = await import('./conectar');

const logger = crearLogger(config.carpetaLogs); limpiarLogsViejos(config.carpetaLogs);
const { db, sql } = crearDb(config.databaseUrl);
await ejecutarMigraciones(db);
await asegurarConfiguracion(db);
const app = await crearApp({ db, logger });
await app.listen({ port: config.puerto, host: '0.0.0.0' });
const ip = ipLocal();
console.log('\n==============================================');
console.log(`  Cafetería en marcha. Dirección: http://${ip}:${config.puerto}`);
console.log(`  Mesero: http://${ip}:${config.puerto}/mesero`);
console.log(`  Caja:   http://${ip}:${config.puerto}/caja`);
console.log(`  Admin:  http://${ip}:${config.puerto}/admin`);
console.log('  Códigos QR: http://localhost:' + config.puerto + '/conectar');
console.log('  Para apagar: cierra esta ventana o pulsa Ctrl+C');
console.log('==============================================\n');
const abrir = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', `http://localhost:${config.puerto}/conectar`]] : ['open', [`http://localhost:${config.puerto}/conectar`]];
try { spawn(abrir[0] as string, abrir[1] as string[], { detached: true, stdio: 'ignore' }).unref(); } catch {}

let apagando = false;
async function apagar() {
  if (apagando) return; apagando = true;
  console.log('\nApagando…');
  try { await app.close(); await sql.end(); } catch {}
  if (!process.env.PG_DOCKER) await ejecutarPg('pg_ctl', ['-D', config.carpetaDatosPg, '-w', 'stop']);
  process.exit(0);
}
process.on('SIGINT', apagar); process.on('SIGTERM', apagar); process.on('SIGHUP', apagar);
```

Agregar script en `package.json`: `"lanzar": "tsx src/servidor/lanzador.ts"`. Probar en esta Mac con Docker: `PG_DOCKER=cafeteria-pg npm run lanzar` → imprime las URL y abre `/conectar` en el navegador con los QR. Ctrl+C apaga limpio.

- [ ] **Step 4: Escribir scripts/empaquetar.mjs y sea-config.json**

`sea-config.json`:
```json
{ "main": "build/tmp/cafeteria.cjs", "output": "build/tmp/sea-prep.blob", "disableExperimentalSEAWarning": true }
```

`scripts/empaquetar.mjs`:
```js
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const win = process.platform === 'win32';
const salida = join('build', win ? 'Cafeteria' : 'Cafeteria-mac');
rmSync('build', { recursive: true, force: true });
mkdirSync(join(salida, 'servidor'), { recursive: true });
mkdirSync('build/tmp', { recursive: true });
for (const c of ['fotos', 'Respaldos', 'logs']) mkdirSync(join(salida, c), { recursive: true });

execSync('npx vite build', { stdio: 'inherit' });
await build({
  entryPoints: ['src/servidor/lanzador.ts'], bundle: true, platform: 'node', target: 'node22', format: 'cjs',
  outfile: 'build/tmp/cafeteria.cjs', external: [], sourcemap: false, minify: false,
  define: { 'import.meta.url': '"file:///servidor/cafeteria.cjs"' },
  banner: { js: 'const importMetaUrl = require("url").pathToFileURL(__filename).href;' },
});
copyFileSync('build/tmp/cafeteria.cjs', join(salida, 'servidor', 'cafeteria.cjs'));
cpSync('src/servidor/db/migraciones', join(salida, 'servidor', 'migraciones'), { recursive: true });
cpSync('dist/web', join(salida, 'servidor', 'web'), { recursive: true });
cpSync('src/servidor/recursos', join(salida, 'servidor', 'recursos'), { recursive: true });
writeFileSync(join(salida, '.env'), 'DATABASE_URL=postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria\nPUERTO=3000\nPG_BIN=pgsql/bin\n');
writeFileSync(join(salida, 'LEEME.txt'), `CAFETERIA POS

1. Descarga PostgreSQL 16 para Windows x86-64 en formato ZIP ("Binaries") desde:
   https://www.enterprisedb.com/download-postgresql-binaries
2. Descomprime el ZIP. Dentro hay una carpeta llamada "pgsql".
3. Copia esa carpeta "pgsql" dentro de esta misma carpeta, junto a Cafeteria.exe.
   Debe quedar: Cafeteria\\pgsql\\bin\\pg_ctl.exe
4. Doble clic en Cafeteria.exe. La primera vez tarda un poco (crea la base de datos).
5. Se abre el navegador con los códigos QR para conectar celulares y tablets.

Para apagar: cierra la ventana negra de Cafeteria.
Respaldos: carpeta "Respaldos". Cópiala a un pendrive con regularidad.
`);

// Ejecutable único (Node SEA)
try {
  execSync('node --experimental-sea-config sea-config.json', { stdio: 'inherit' });
  const exe = join(salida, win ? 'Cafeteria.exe' : 'Cafeteria');
  copyFileSync(process.execPath, exe);
  const extra = win ? '' : ' --macho-segment-name NODE_SEA';
  execSync(`npx postject "${exe}" NODE_SEA_BLOB build/tmp/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2${extra}`, { stdio: 'inherit' });
  if (!win) execSync(`codesign --sign - "${exe}"`, { stdio: 'inherit' });
  console.log(`\nListo: ${exe}`);
} catch (e) {
  console.error('\nNo se pudo crear el ejecutable único. Se generará la alternativa con Node portátil.');
  writeFileSync(join(salida, win ? 'Cafeteria.bat' : 'Cafeteria.command'), win
    ? '@echo off\r\ncd /d %~dp0\r\nnode\\node.exe servidor\\cafeteria.cjs\r\npause\r\n'
    : '#!/bin/bash\ncd "$(dirname "$0")"\n./node/node servidor/cafeteria.cjs\n');
  mkdirSync(join(salida, 'node'), { recursive: true });
  console.error(`Copia node.exe (descarga "Windows Binary (.zip)" de https://nodejs.org) en ${join(salida, 'node')}.`);
}
```

Agregar script: `"empaquetar": "node scripts/empaquetar.mjs"`.

Nota sobre `import.meta.url` en CommonJS: el `define` anterior lo reemplaza por una cadena; `migrar.ts` y `app.ts` ya no dependen de él cuando `CARPETA_RECURSOS` está definida, que es siempre el caso bajo el lanzador. Si esbuild reporta error por `import.meta`, cambiar `format` a `'esm'` y `outfile` a `.mjs`; Node SEA requiere CommonJS, así que en ese caso usar la alternativa `.bat`.

- [ ] **Step 5: Probar el empaquetado en esta Mac**

Run: `npm run empaquetar`
Expected: `build/Cafeteria-mac/Cafeteria` existe. Probar: `cd build/Cafeteria-mac && PG_DOCKER=cafeteria-pg ./Cafeteria` → imprime las URL y abre `/conectar`. Ctrl+C. Volver con `cd ../..`.

- [ ] **Step 6: Probar en la PC Windows de caja (obligatorio antes de dar por terminada la tarea)**

1. En Windows con Node 22+ instalado y el repo clonado: `npm install`, `npm run empaquetar`. Debe aparecer `build\Cafeteria\Cafeteria.exe`.
2. Seguir `LEEME.txt`: descargar el ZIP de PostgreSQL 16 y copiar `pgsql` dentro de `build\Cafeteria`.
3. Doble clic en `Cafeteria.exe`. Esperado: consola con las URL, navegador abierto en `/conectar`, y desde un celular en el mismo WiFi se abre `/mesero`. Si Windows Defender pregunta por el firewall, marcar "Redes privadas" y permitir.
4. Cerrar la ventana. Volver a abrir: arranca sin volver a crear la base.
5. Copiar la carpeta `build\Cafeteria` a `C:\Cafeteria` en la PC de caja. Ese es el producto entregable.
6. Anotar en `docs/BITACORA.md` la versión de Windows probada y el resultado. Si algo falla y no se resuelve, anotar en `docs/ESTADO.md` como pendiente con el error exacto.

- [ ] **Step 7: Commit y push**

```bash
git add -A && git commit -m "Lanzador con PostgreSQL portátil, página /conectar con QR y empaquetado para Windows" && git push origin main
```

---

### Task 4: Prueba de extremo a extremo con Playwright
**Modelo ejecutor:** `claude-fable-5-1`. **Motivo:** la tarea exige criterio propio (concurrencia, dinero, depuración o selectores que el plan no puede anticipar del todo).
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `playwright.config.ts`, `e2e/dia-completo.spec.ts`
- Modify: `package.json` (scripts `e2e`), `.gitignore` (`test-results/`, `playwright-report/`)

**Interfaces:**
- Produces: `npm run e2e` que (1) construye la web, (2) arranca el servidor contra `cafeteria_test` en el puerto 3100 con `DATABASE_URL_TEST`, (3) ejecuta el recorrido en Chromium. La preparación de datos (menú, mesero) y las comprobaciones numéricas se hacen por API con `request` de Playwright; la interacción de usuario se hace por pantalla.
- Dependencia: `npm install -D @playwright/test@1` y `npx playwright install chromium`.

- [ ] **Step 1: Escribir playwright.config.ts**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:3100', locale: 'es-EC' },
  webServer: {
    command: 'npx tsx src/servidor/index.ts',
    url: 'http://127.0.0.1:3100/api/estado',
    env: { PUERTO: '3100', DATABASE_URL: process.env.DATABASE_URL_TEST ?? 'postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria_test', CARPETA_LOGS: 'logs-e2e', CARPETA_RESPALDOS: 'Respaldos-e2e', PG_DOCKER: process.env.PG_DOCKER ?? 'cafeteria-pg' },
    reuseExistingServer: false,
  },
});
```

Script: `"e2e": "npm run build && playwright test"`. Agregar a `.gitignore`: `test-results/`, `playwright-report/`, `logs-e2e/`, `Respaldos-e2e/`.

- [ ] **Step 2: Escribir e2e/dia-completo.spec.ts**

```ts
import { test, expect, type APIRequestContext } from '@playwright/test';
import postgres from 'postgres';

const URL_DB = process.env.DATABASE_URL_TEST ?? 'postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria_test';

async function limpiar() {
  const sql = postgres(URL_DB);
  await sql.unsafe('TRUNCATE abono, encargo_item, encargo, pago, pedido_item, ronda, cuenta, egreso, pedido, movimiento_stock, jornada, producto, categoria, cliente, mesero, configuracion RESTART IDENTITY CASCADE');
  await sql.end();
}
async function preparar(api: APIRequestContext) {
  await api.patch('/api/admin/configuracion', { data: { nombre_local: 'Delicadas', cantidad_mesas: 6, cocina_activa: true, sonido_cocina: false, umbral_stock_bajo: 3 } });
  await api.post('/api/admin/meseros', { data: { nombre: 'Carlos' } });
  const cat = await (await api.post('/api/admin/categorias', { data: { nombre: 'Todo', orden: 1 } })).json();
  await api.post('/api/admin/productos', { data: { categoria_id: cat.id, nombre: 'Capuchino', precio: 2.5, controla_stock: false } });
  await api.post('/api/admin/productos', { data: { categoria_id: cat.id, nombre: 'Bolón', precio: 3, controla_stock: true, stock_actual: 2 } });
}

test('un día completo: abrir caja, pedir, cocina, dividir, cobrar, encargo, egreso, cerrar', async ({ browser, request }) => {
  await limpiar();
  await preparar(request);

  // Caja abre la jornada
  const caja = await (await browser.newContext()).newPage();
  await caja.goto('/caja');
  await caja.getByLabel('Fondo inicial en efectivo').fill('20');
  await caja.getByRole('button', { name: 'Abrir caja' }).click();
  await expect(caja.getByText('Caja abierta')).toBeVisible();

  // Mesero toma pedido con ítem libre; el bolón se agota
  const mesero = await (await browser.newContext({ viewport: { width: 400, height: 800 } })).newPage();
  await mesero.goto('/mesero');
  await mesero.getByRole('button', { name: 'Carlos' }).click();
  await mesero.getByRole('button', { name: /^2/ }).click();
  await mesero.getByRole('button', { name: /Capuchino/ }).click();
  await mesero.getByRole('button', { name: /Capuchino/ }).click();
  await mesero.getByRole('button', { name: /Bolón/ }).click();
  await mesero.getByRole('button', { name: /Bolón/ }).click();
  await expect(mesero.getByRole('button', { name: /Bolón/ })).toBeDisabled();
  mesero.once('dialog', (d) => d.accept('Choripán sin pan'));
  const libre = mesero.getByRole('button', { name: '+ Ítem libre' });
  mesero.once('dialog', (d) => d.accept('1.50'));
  await libre.click();
  await mesero.getByRole('button', { name: /Enviar a cocina/ }).click();
  await expect(mesero.getByText('Ronda 1')).toBeVisible();

  // Cocina ve la ronda y la marca lista; el mesero recibe el aviso
  const cocina = await (await browser.newContext()).newPage();
  await cocina.goto('/cocina');
  await expect(cocina.getByText('Mesa 2 · #1')).toBeVisible();
  await expect(cocina.getByText('Agotado')).toBeVisible();
  await cocina.getByRole('button', { name: 'Listo' }).click();
  await expect(mesero.getByRole('button', { name: /Listo para servir/ })).toBeVisible();

  // Caja entra a la mesa, anula un bolón, divide y cobra con dos métodos y clientes distintos
  await caja.getByRole('button', { name: /Mesa 2/ }).click();
  caja.once('dialog', (d) => d.accept('Se cayó'));
  await caja.getByRole('listitem').filter({ hasText: 'Bolón' }).getByRole('button', { name: 'Anular' }).click();
  const stock = await (await request.get('/api/catalogo')).json();
  expect(stock.categorias[0].productos.find((p: any) => p.nombre === 'Bolón').stock_actual).toBe(2);

  await caja.getByRole('button', { name: 'Dividir cuenta' }).click();
  await caja.getByRole('button', { name: '+ Cuenta' }).click();
  caja.once('dialog', (d) => d.accept('1'));
  await caja.locator('li', { hasText: 'Capuchino' }).first().click();
  await caja.getByRole('button', { name: 'Mover aquí' }).click();
  await caja.getByRole('button', { name: 'Listo' }).click();

  const cuentas = caja.locator('.tarjeta', { hasText: /Cuenta \d de 2/ });
  await expect(cuentas).toHaveCount(2);
  const cuenta2 = cuentas.nth(1);
  caja.once('dialog', (d) => d.accept('Ana'));
  caja.once('dialog', (d) => d.accept(''));
  await cuenta2.getByRole('button', { name: '+ Nuevo' }).click();
  await expect(cuenta2.getByText('Cliente: Ana')).toBeVisible();
  const popup = caja.waitForEvent('popup');
  await cuenta2.getByRole('button', { name: 'Cobrar exacto' }).click();
  await cuenta2.getByRole('button', { name: 'Registrar pago' }).click();
  const ticket = await popup;
  await expect(ticket.locator('body')).toContainText('Cuenta 2 de 2');
  await expect(ticket.locator('body')).not.toContainText(/impuesto/i);
  await ticket.close();

  const cuenta1 = cuentas.nth(0);
  await cuenta1.getByLabel('Monto').fill('1');
  await cuenta1.getByRole('button', { name: 'Registrar pago' }).click();
  await cuenta1.getByLabel('Método').selectOption('transferencia');
  await cuenta1.getByRole('button', { name: 'Cobrar exacto' }).click();
  await cuenta1.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(caja.getByText('Pedido cobrado')).toBeVisible();
  await expect(mesero.getByRole('button', { name: /^2/ })).toContainText('libre');

  // Encargo con abono; egreso; cierre
  await caja.getByRole('button', { name: '← Mesas' }).click();
  await caja.getByRole('button', { name: 'Encargos' }).click();
  await caja.getByRole('button', { name: '+ Nuevo encargo' }).click();
  caja.once('dialog', (d) => d.accept('Rosa'));
  caja.once('dialog', (d) => d.accept(''));
  await caja.getByRole('button', { name: '+ Nuevo' }).click();
  await caja.getByRole('button', { name: /Capuchino/ }).click();
  await caja.getByRole('button', { name: /Guardar encargo/ }).click();
  await caja.getByLabel('Monto').fill('1');
  await caja.getByRole('button', { name: 'Abonar' }).click();
  await expect(caja.getByText('Caja de encargos: $ 1.00')).toBeVisible();
  await caja.getByRole('button', { name: '← Encargos' }).click();
  await caja.getByRole('button', { name: '← Mesas' }).click();

  await caja.getByRole('button', { name: 'Egresos' }).click();
  await caja.getByLabel('Monto').fill('2');
  await caja.getByLabel('Motivo').fill('Hielo');
  await caja.getByRole('button', { name: 'Registrar' }).click();
  await expect(caja.getByText('$ 2.00').first()).toBeVisible();
  await caja.getByRole('button', { name: '← Mesas' }).click();

  await caja.getByRole('button', { name: 'Cerrar caja' }).click();
  // ventas 7.00 (2 capuchinos 5.00 + libre 1.50 + 0 bolón anulado) → efectivo 1 + 2.5 = 3.5 ; transferencia 2 ; esperado 20 + 3.5 - 2 = 21.5
  await expect(caja.getByText('Efectivo esperado en caja')).toBeVisible();
  await caja.getByLabel('Efectivo contado').fill('21.5');
  caja.once('dialog', (d) => d.accept());
  await caja.getByRole('button', { name: 'Cerrar caja' }).last().click();
  await expect(caja.getByText('Abrir caja')).toBeVisible();
  const jornadas = await (await request.get('/api/jornadas')).json();
  expect(jornadas[0].total_ventas).toBe('6.50');
  expect(jornadas[0].efectivo_esperado).toBe('21.50');
  expect(jornadas[0].diferencia_efectivo).toBe('0.00');
  expect(jornadas[0].total_abonos_recibidos).toBe('1.00');
  await expect(mesero.getByText('Caja cerrada')).toBeVisible();
});
```

Nota de cálculo para quien ejecute: cuenta 2 = 1 capuchino (2.50) pagada en efectivo; cuenta 1 = 1 capuchino (2.50) + choripán libre (1.50) = 4.00, pagada 1.00 efectivo + 3.00 transferencia. Ventas = 6.50; efectivo = 3.50; esperado = 20 + 3.50 − 2 = 21.50. Si el recorrido difiere en textos de botones, ajustar los selectores, no las cifras.

- [ ] **Step 3: Ejecutar** → `npm run e2e` → 1 passed. Si falla por textos, corregir selectores o textos de la UI (los textos de botones definidos en los planes 2 y 3 son los que este recorrido espera).

- [ ] **Step 4: Commit y push**

```bash
git add -A && git commit -m "Prueba extremo a extremo de un día completo con Playwright" && git push origin main
```

---

### Task 5: Manual para Dave
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:verification-before-completion` (redacción y comprobación de textos; sin TDD porque no hay código). **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `docs/MANUAL.md`

**Interfaces:**
- Produces: manual en español, sin jerga, para instalar y operar. Secciones exactas: (1) Qué necesitas (PC Windows 10/11, WiFi del local, celulares o tablets con navegador); (2) Instalación (copiar carpeta `Cafeteria` a `C:\Cafeteria`, descargar PostgreSQL ZIP y copiar `pgsql`, doble clic, permitir en firewall); (3) Conectar dispositivos (página `/conectar`, escanear QR, guardar como acceso directo en pantalla de inicio del celular); (4) Primer día (admin: nombre del local, mesas, meseros, menú con fotos y stock; activar cocina si hay pantalla); (5) Cada día (abrir caja con fondo y stock; mesero; caja: agregar, anular, dividir, cobrar, ticket; egresos; encargos; cerrar caja con arqueo); (6) Reportes y CSV; (7) Respaldos (dónde están, cómo copiar, cómo restaurar); (8) Si algo falla (no arranca PostgreSQL, celular no conecta: mismo WiFi, IP cambió, firewall; pantalla en blanco: recargar; descargar registro y enviarlo); (9) Apagar y encender.
- Cada sección con pasos numerados y el texto exacto de los botones tal como aparecen en pantalla.

- [ ] **Step 1: Escribir docs/MANUAL.md** siguiendo las nueve secciones anteriores, con los nombres de botones definidos en los planes 1 a 4 ("Abrir caja", "Enviar a cocina", "Dividir cuenta", "+ Cuenta", "Mover aquí", "Cobrar exacto", "Registrar pago", "Egresos", "Encargos", "+ Nuevo encargo", "Abonar", "Entregar y cobrar saldo", "Cerrar caja", "Respaldar ahora", "Restaurar", "Descargar registro de hoy", "Importar menú", "Descargar plantilla", "Descargar menú actual", "Cargar menú de Delicadas", "Ver vista previa", "Confirmar carga"). La sección (4) Primer día explica cargar el menú de Delicadas o el propio desde CSV, con el formato de `docs/menu/formato-csv.md`, y escribir en la primera apertura de caja el stock de tortillas de maíz con queso, quimbolitos, humitas y tamales.

- [ ] **Step 2: Revisar** que cada botón mencionado existe con ese texto exacto en `src/web` (`grep -r "nombre-del-botón" src/web`).

- [ ] **Step 3: Commit y push**

```bash
git add -A && git commit -m "Manual de instalación y uso" && git push origin main
```

---

## Cierre del plan 4 y del Núcleo POS

**Modelo:** `claude-sonnet-5`. **Motivo:** son comandos y actualizaciones de documentos ya definidos. **Skill:** `superpowers:verification-before-completion`. **Revisor:** `claude-fable-5-1` confirma que ESTADO.md y BITACORA.md reflejan la salida real.


- [ ] `npm run typecheck && npm run build && npm test && npm run e2e`; pegar salida resumida en `docs/BITACORA.md`.
- [ ] Copiar `build/Cafeteria` a la PC de caja y ejecutar el primer día real con el menú de Delicadas cargado desde Admin, pestaña Importar menú. Anotar resultado en `docs/BITACORA.md`.
- [ ] Actualizar `docs/ESTADO.md`: "Núcleo POS entregado"; siguiente paso: módulo 2 Menú digital, con `superpowers:brainstorming` (modelo `claude-fable-5-1`), entrada: spec del Núcleo, sección 11 ganchos.
- [ ] `git add -A && git commit -m "Cierre del plan 4: Núcleo POS entregado" && git push origin main`.

## Self-review

- **Cobertura:** 3.1 lanzador y carpeta → Task 3; 3.3 respaldos y restaurar → Task 2; 7.4 respaldos y descargar log → Tasks 1 y 2; 8 errores del servidor y "PostgreSQL no arranca" → Tasks 1 y 3; 9 E2E → Task 4. Fuera de estos planes queda solo lo listado en la sección 10 de la spec.
- **Consistencia:** `ejecutarPg` es usado por respaldos y lanzador con la misma firma; `CARPETA_RECURSOS` lo fija el lanzador y lo leen `migrar.ts` y `app.ts`; `crearApp({ db, logger })` amplía la firma del plan 1 sin romper las pruebas anteriores.
- **Sin placeholders.** La única verificación que depende de hardware externo (Windows) está marcada como obligatoria y con criterio de "no terminada" si no se cumple.
