# Plan 1 de 4 — Cimientos del Núcleo POS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar un proyecto Node.js + TypeScript con PostgreSQL, todas las tablas de la spec migradas, servidor Fastify con eventos en vivo, API de configuración, meseros y catálogo, y la pantalla de admin funcionando en el navegador.

**Architecture:** Un solo paquete npm. El servidor (`src/servidor`) es Fastify + Drizzle sobre PostgreSQL y sirve la web compilada. La web (`src/web`) es Preact + Vite, una app por ruta (`/admin`, `/mesero`, `/caja`, `/cocina`). Las pruebas de integración usan `app.inject()` contra una base PostgreSQL real de prueba.

**Tech Stack:** Node.js 22+ (en esta Mac hay 24.19), TypeScript 5, Fastify 5, Drizzle ORM + drizzle-kit, driver `postgres` (postgres.js), PostgreSQL 16 en Docker para desarrollo, Preact 10 + Vite 6, Vitest 3, tsx.

**Spec:** `docs/superpowers/specs/2026-09-12-nucleo-pos-design.md` (secciones 3, 4.1, 4.3, 6 y 7.4). Leer también `CLAUDE.md`.

**Modelos y skills:** no hay modelo por defecto. Cada tarea indica abajo su modelo ejecutor, su skill, su revisor y su motivo. Resumen de este plan:

| Tarea | Modelo ejecutor | Skill principal | Revisor |
|---|---|---|---|
| Task 1 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 2 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 3 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 4 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 5 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 6 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 7 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |

**Revisión de cada tarea:** el revisor usa `superpowers:requesting-code-review` con modelo `claude-fable-5-1`: primero revisa contra la spec (¿hace lo que el plan pide, ni más ni menos?), luego calidad del código. Si hay observaciones, el ejecutor las atiende con `superpowers:receiving-code-review` y se vuelve a revisar. La tarea solo se marca terminada cuando el revisor aprueba y `superpowers:verification-before-completion` confirma la salida del comando de verificación.

## Global Constraints

- Todo texto visible al usuario, nombres de tablas, columnas, rutas de API y mensajes de error en español, sin tildes en identificadores de código y base de datos.
- Montos `numeric(10,2)`. Ids `uuid`. Todas las tablas con `id`, `creado_en`, `actualizado_en`.
- Errores de API: cuerpo `{ "error": "mensaje en español" }` con HTTP 400 (dato inválido), 404 (no existe) o 409 (regla de negocio).
- PostgreSQL en puerto **5433**, usuario `cafeteria`, contraseña `cafeteria`, base `cafeteria` (desarrollo) y `cafeteria_test` (pruebas).
- Servidor en puerto **3000**.
- Nunca SQLite.
- Commits en español. Cada tarea termina con commit y `git push origin main`.
- Al terminar el plan: actualizar `docs/ESTADO.md` y `docs/BITACORA.md`.

## Prerrequisitos de esta Mac (verificados el 2026-09-15)

- `node --version` → v24.19.0. `npm --version` → 11.17.0.
- `docker --version` → 29.4.0. No hay `psql`, `pg_ctl` ni `brew`: PostgreSQL corre en Docker.

## File Structure

```
package.json                 scripts, dependencias
tsconfig.json                TS del servidor y pruebas
vite.config.ts               build de la web a dist/web
vitest.config.ts             pruebas en tests/
drizzle.config.ts            migraciones en src/servidor/db/migraciones
.env.example                 DATABASE_URL, DATABASE_URL_TEST, PUERTO
.gitignore
src/servidor/config.ts       lee variables de entorno
src/servidor/db/schema.ts    TODAS las tablas de la spec (Drizzle)
src/servidor/db/conexion.ts  crearDb(url) → { db, sql }
src/servidor/db/migrar.ts    ejecutarMigraciones(db)
src/servidor/db/migraciones/ SQL generado por drizzle-kit + índices parciales
src/servidor/errores.ts      ErrorNegocio (409), ErrorValidacion (400), NoEncontrado (404)
src/servidor/eventos.ts      bus SSE: emitir(nombre, datos), rutaEventos
src/servidor/app.ts          crearApp({ db }) → Fastify con rutas y estáticos
src/servidor/index.ts        arranque: migrar, asegurar configuración, escuchar
src/servidor/modulos/configuracion.ts   asegurarConfiguracion, obtener, actualizar + rutas
src/servidor/modulos/meseros.ts         listar, crear, editar + rutas
src/servidor/modulos/catalogo.ts        categorías, productos, ajuste de stock + rutas
src/web/index.html           una sola página; el router elige la app por pathname
src/web/main.tsx             monta AppAdmin / AppMesero / AppCaja / AppCocina según ruta
src/web/api.ts               fetch con manejo de {error}
src/web/eventos.ts           hook useEventos(nombre, callback) sobre EventSource
src/web/estilos.css          estilos base táctiles
src/web/admin/AppAdmin.tsx   pestañas: Configuración, Meseros, Menú
src/web/admin/Configuracion.tsx
src/web/admin/Meseros.tsx
src/web/admin/Menu.tsx
src/web/mesero/AppMesero.tsx  placeholder "Caja cerrada" (se completa en plan 2)
src/web/caja/AppCaja.tsx      placeholder (plan 2)
src/web/cocina/AppCocina.tsx  placeholder (plan 3)
tests/ayuda/db.ts            prepararBaseDePrueba(): migra y vacía cafeteria_test
tests/ayuda/app.ts           crearAppDePrueba() → { app, db }
tests/*.test.ts              una prueba por módulo
```

---

### Task 1: Proyecto base y PostgreSQL en Docker
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore`, `tests/humo.test.ts`

**Interfaces:**
- Produces: scripts npm `test`, `dev`, `build`, `start`, `db:generar`, `db:migrar`; contenedor Docker `cafeteria-pg` con bases `cafeteria` y `cafeteria_test`.

- [ ] **Step 1: Crear package.json**

```json
{
  "name": "cafeteria-pos",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "tsx watch src/servidor/index.ts",
    "dev:web": "vite",
    "build": "vite build && tsc -p tsconfig.servidor.json",
    "start": "node dist/servidor/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "db:generar": "drizzle-kit generate",
    "db:migrar": "tsx src/servidor/db/migrar-cli.ts"
  }
}
```

- [ ] **Step 2: Instalar dependencias**

```bash
cd /Users/david/Proyectos/Cafeteria
npm install fastify@5 @fastify/static@8 @fastify/multipart@9 drizzle-orm@0.44 postgres@3 dotenv@16 preact@10
npm install -D typescript@5 tsx@4 vitest@3 drizzle-kit@0.31 vite@6 @preact/preset-vite@2 @types/node@22
```

Esperado: `package.json` con esas dependencias, `node_modules/` creado, sin errores.

- [ ] **Step 3: Crear tsconfig.json y tsconfig.servidor.json**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts", "drizzle.config.ts"]
}
```

`tsconfig.servidor.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist/servidor",
    "rootDir": "src/servidor",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src/servidor"]
}
```

- [ ] **Step 4: Crear vitest.config.ts, .env.example y .gitignore**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
```

`.env.example`:
```
DATABASE_URL=postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria
DATABASE_URL_TEST=postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria_test
PUERTO=3000
```

`.gitignore`:
```
node_modules/
dist/
.env
fotos/
Respaldos/
logs/
datos/
```

Copiar `.env.example` a `.env`: `cp .env.example .env`.

- [ ] **Step 5: Levantar PostgreSQL 16 en Docker**

```bash
docker run -d --name cafeteria-pg \
  -e POSTGRES_USER=cafeteria -e POSTGRES_PASSWORD=cafeteria -e POSTGRES_DB=cafeteria \
  -p 5433:5432 postgres:16
sleep 5
docker exec cafeteria-pg psql -U cafeteria -d cafeteria -c "CREATE DATABASE cafeteria_test;"
docker exec cafeteria-pg psql -U cafeteria -d cafeteria -c "SELECT version();"
```

Esperado: la última línea muestra `PostgreSQL 16.x`. Si el contenedor ya existe: `docker start cafeteria-pg`.

- [ ] **Step 6: Escribir prueba de humo**

`tests/humo.test.ts`:
```ts
import { test, expect } from 'vitest';
import postgres from 'postgres';

test('la base de pruebas responde', async () => {
  const sql = postgres(process.env.DATABASE_URL_TEST ?? 'postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria_test');
  const [fila] = await sql`SELECT 1 AS uno`;
  await sql.end();
  expect(fila.uno).toBe(1);
});
```

- [ ] **Step 7: Ejecutar la prueba**

Run: `npm test`
Expected: `1 passed`.

- [ ] **Step 8: Commit y push**

```bash
git add -A
git commit -m "Proyecto base con PostgreSQL en Docker y prueba de humo"
git push origin main
```

---

### Task 2: Esquema completo en Drizzle y migraciones
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/config.ts`, `src/servidor/db/schema.ts`, `src/servidor/db/conexion.ts`, `src/servidor/db/migrar.ts`, `src/servidor/db/migrar-cli.ts`, `drizzle.config.ts`, `src/servidor/db/migraciones/` (generado), `tests/ayuda/db.ts`, `tests/esquema.test.ts`

**Interfaces:**
- Produces: `crearDb(url): { db: Db, sql: postgres.Sql }`, tipo `Db`, `ejecutarMigraciones(db)`, todas las tablas exportadas desde `schema.ts` con los nombres de la spec, `prepararBaseDePrueba(): Promise<{ db, sql }>`.

- [ ] **Step 1: Escribir la prueba del esquema**

`tests/ayuda/db.ts`:
```ts
import { crearDb } from '../../src/servidor/db/conexion';
import { ejecutarMigraciones } from '../../src/servidor/db/migrar';

const URL = process.env.DATABASE_URL_TEST ?? 'postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria_test';

const TABLAS = [
  'abono', 'encargo_item', 'encargo', 'pago', 'pedido_item', 'ronda', 'cuenta', 'egreso',
  'pedido', 'movimiento_stock', 'jornada', 'producto', 'categoria', 'cliente', 'mesero', 'configuracion',
];

export async function prepararBaseDePrueba() {
  const { db, sql } = crearDb(URL);
  await ejecutarMigraciones(db);
  await sql.unsafe(`TRUNCATE ${TABLAS.join(', ')} RESTART IDENTITY CASCADE`);
  return { db, sql };
}
```

`tests/esquema.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { prepararBaseDePrueba } from './ayuda/db';
import { configuracion, producto, categoria } from '../src/servidor/db/schema';

let ctx: Awaited<ReturnType<typeof prepararBaseDePrueba>>;
beforeAll(async () => { ctx = await prepararBaseDePrueba(); });
afterAll(async () => { await ctx.sql.end(); });

test('las 16 tablas existen', async () => {
  const filas = await ctx.sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`;
  const nombres = filas.map((f) => f.table_name);
  for (const t of ['configuracion','mesero','categoria','producto','movimiento_stock','jornada','pedido','cuenta','ronda','pedido_item','pago','egreso','cliente','encargo','encargo_item','abono']) {
    expect(nombres).toContain(t);
  }
});

test('configuracion acepta una fila con valores por defecto', async () => {
  const [fila] = await ctx.db.insert(configuracion).values({ nombre_local: 'Prueba' }).returning();
  expect(fila.simbolo_moneda).toBe('$');
  expect(fila.umbral_stock_bajo).toBe(5);
  expect(fila.cocina_activa).toBe(false);
  expect(fila.permitir_items_libres).toBe(true);
});

test('producto sin control de stock tiene stock_actual nulo', async () => {
  const [cat] = await ctx.db.insert(categoria).values({ nombre: 'Cafés', orden: 1 }).returning();
  const [p] = await ctx.db.insert(producto).values({ categoria_id: cat.id, nombre: 'Capuchino', precio: '2.50', controla_stock: false }).returning();
  expect(p.stock_actual).toBeNull();
  expect(p.precio).toBe('2.50');
});

test('solo puede existir una jornada abierta', async () => {
  await ctx.sql`INSERT INTO jornada (fondo_inicial) VALUES (10)`;
  await expect(ctx.sql`INSERT INTO jornada (fondo_inicial) VALUES (20)`).rejects.toThrow();
});
```

- [ ] **Step 2: Ejecutar para ver que falla**

Run: `npm test -- tests/esquema.test.ts`
Expected: FAIL, no encuentra `src/servidor/db/conexion`.

- [ ] **Step 3: Escribir config.ts y conexion.ts**

`src/servidor/config.ts`:
```ts
import 'dotenv/config';

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria',
  puerto: Number(process.env.PUERTO ?? 3000),
  carpetaFotos: process.env.CARPETA_FOTOS ?? 'fotos',
};
```

`src/servidor/db/conexion.ts`:
```ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export function crearDb(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export type Db = ReturnType<typeof crearDb>['db'];
```

- [ ] **Step 4: Escribir schema.ts completo**

`src/servidor/db/schema.ts`:
```ts
import { pgTable, pgEnum, uuid, text, integer, numeric, boolean, timestamp, date } from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const tiempos = () => ({
  creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizado_en: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
});
const monto = (nombre: string) => numeric(nombre, { precision: 10, scale: 2 });

export const origenMovimiento = pgEnum('origen_movimiento', ['venta', 'anulacion', 'ajuste_manual', 'apertura']);
export const estadoPedido = pgEnum('estado_pedido', ['abierto', 'cobrado', 'anulado']);
export const origenPedido = pgEnum('origen_pedido', ['mesa', 'llevar', 'encargo']);
export const origenRonda = pgEnum('origen_ronda', ['mesero', 'caja']);
export const estadoRonda = pgEnum('estado_ronda', ['pendiente', 'lista']);
export const estadoCuenta = pgEnum('estado_cuenta', ['abierta', 'cobrada']);
export const tipoDescuento = pgEnum('tipo_descuento', ['ninguno', 'monto', 'porcentaje']);
export const metodoPago = pgEnum('metodo_pago', ['efectivo', 'tarjeta', 'transferencia']);
export const tipoEgreso = pgEnum('tipo_egreso', ['compra_ingredientes', 'devolucion_cliente', 'otro']);
export const tipoIdentificacion = pgEnum('tipo_identificacion', ['cedula', 'ruc', 'pasaporte', 'consumidor_final']);
export const estadoEncargo = pgEnum('estado_encargo', ['pendiente', 'entregado', 'cancelado']);
export const estadoAbono = pgEnum('estado_abono', ['pendiente', 'aplicado', 'devuelto']);

export const configuracion = pgTable('configuracion', {
  id: id(),
  nombre_local: text('nombre_local').notNull().default('Cafetería'),
  simbolo_moneda: text('simbolo_moneda').notNull().default('$'),
  cantidad_mesas: integer('cantidad_mesas').notNull().default(10),
  propina_sugerida_pct: numeric('propina_sugerida_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  umbral_stock_bajo: integer('umbral_stock_bajo').notNull().default(5),
  cocina_activa: boolean('cocina_activa').notNull().default(false),
  sonido_cocina: boolean('sonido_cocina').notNull().default(true),
  permitir_items_libres: boolean('permitir_items_libres').notNull().default(true),
  ...tiempos(),
});

export const mesero = pgTable('mesero', {
  id: id(),
  nombre: text('nombre').notNull(),
  activo: boolean('activo').notNull().default(true),
  ...tiempos(),
});

export const categoria = pgTable('categoria', {
  id: id(),
  nombre: text('nombre').notNull(),
  orden: integer('orden').notNull().default(0),
  activa: boolean('activa').notNull().default(true),
  ...tiempos(),
});

export const producto = pgTable('producto', {
  id: id(),
  categoria_id: uuid('categoria_id').notNull().references(() => categoria.id),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  precio: monto('precio').notNull(),
  foto: text('foto'),
  activo: boolean('activo').notNull().default(true),
  controla_stock: boolean('controla_stock').notNull().default(false),
  stock_actual: integer('stock_actual'),
  orden: integer('orden').notNull().default(0),
  ...tiempos(),
});

export const jornada = pgTable('jornada', {
  id: id(),
  abierta_en: timestamp('abierta_en', { withTimezone: true }).notNull().defaultNow(),
  cerrada_en: timestamp('cerrada_en', { withTimezone: true }),
  fondo_inicial: monto('fondo_inicial').notNull().default('0'),
  efectivo_contado: monto('efectivo_contado'),
  total_ventas: monto('total_ventas'),
  total_efectivo: monto('total_efectivo'),
  total_tarjeta: monto('total_tarjeta'),
  total_transferencia: monto('total_transferencia'),
  total_descuentos: monto('total_descuentos'),
  total_propinas: monto('total_propinas'),
  total_perdidas: monto('total_perdidas'),
  total_egresos: monto('total_egresos'),
  total_abonos_recibidos: monto('total_abonos_recibidos'),
  total_abonos_devueltos: monto('total_abonos_devueltos'),
  efectivo_esperado: monto('efectivo_esperado'),
  diferencia_efectivo: monto('diferencia_efectivo'),
  ...tiempos(),
});

export const cliente = pgTable('cliente', {
  id: id(),
  nombre: text('nombre').notNull(),
  tipo_identificacion: tipoIdentificacion('tipo_identificacion'),
  identificacion: text('identificacion'),
  correo: text('correo'),
  telefono: text('telefono'),
  direccion: text('direccion'),
  activo: boolean('activo').notNull().default(true),
  ...tiempos(),
});

export const encargo = pgTable('encargo', {
  id: id(),
  numero: integer('numero').notNull().generatedAlwaysAsIdentity(),
  cliente_id: uuid('cliente_id').notNull().references(() => cliente.id),
  fecha_entrega: date('fecha_entrega').notNull(),
  notas: text('notas'),
  estado: estadoEncargo('estado').notNull().default('pendiente'),
  jornada_creacion_id: uuid('jornada_creacion_id').notNull().references(() => jornada.id),
  pedido_id: uuid('pedido_id'),
  entregado_en: timestamp('entregado_en', { withTimezone: true }),
  cancelado_en: timestamp('cancelado_en', { withTimezone: true }),
  motivo_cancelacion: text('motivo_cancelacion'),
  monto_devuelto: monto('monto_devuelto').notNull().default('0'),
  abono_retenido: boolean('abono_retenido'),
  ...tiempos(),
});

export const pedido = pgTable('pedido', {
  id: id(),
  jornada_id: uuid('jornada_id').notNull().references(() => jornada.id),
  numero_mesa: integer('numero_mesa').notNull().default(0),
  numero: integer('numero').notNull(),
  mesero_id: uuid('mesero_id').references(() => mesero.id),
  origen: origenPedido('origen').notNull().default('mesa'),
  encargo_id: uuid('encargo_id').references(() => encargo.id),
  estado: estadoPedido('estado').notNull().default('abierto'),
  notas: text('notas'),
  cobrado_en: timestamp('cobrado_en', { withTimezone: true }),
  ...tiempos(),
});

export const cuenta = pgTable('cuenta', {
  id: id(),
  pedido_id: uuid('pedido_id').notNull().references(() => pedido.id),
  numero: integer('numero').notNull().default(1),
  cliente_id: uuid('cliente_id').references(() => cliente.id),
  descuento_tipo: tipoDescuento('descuento_tipo').notNull().default('ninguno'),
  descuento_valor: monto('descuento_valor').notNull().default('0'),
  propina: monto('propina').notNull().default('0'),
  perdida: monto('perdida').notNull().default('0'),
  estado: estadoCuenta('estado').notNull().default('abierta'),
  cobrada_en: timestamp('cobrada_en', { withTimezone: true }),
  ...tiempos(),
});

export const ronda = pgTable('ronda', {
  id: id(),
  pedido_id: uuid('pedido_id').notNull().references(() => pedido.id),
  numero: integer('numero').notNull(),
  origen: origenRonda('origen').notNull(),
  enviada_a_cocina: boolean('enviada_a_cocina').notNull().default(true),
  estado: estadoRonda('estado').notNull().default('pendiente'),
  lista_en: timestamp('lista_en', { withTimezone: true }),
  aviso_visto_mesero: boolean('aviso_visto_mesero').notNull().default(false),
  aviso_visto_caja: boolean('aviso_visto_caja').notNull().default(false),
  ...tiempos(),
});

export const pedidoItem = pgTable('pedido_item', {
  id: id(),
  ronda_id: uuid('ronda_id').notNull().references(() => ronda.id),
  cuenta_id: uuid('cuenta_id').notNull().references(() => cuenta.id),
  producto_id: uuid('producto_id').references(() => producto.id),
  es_libre: boolean('es_libre').notNull().default(false),
  nombre_producto: text('nombre_producto').notNull(),
  precio_unitario: monto('precio_unitario').notNull(),
  cantidad: integer('cantidad').notNull(),
  nota: text('nota'),
  afecta_stock: boolean('afecta_stock').notNull().default(true),
  anulado: boolean('anulado').notNull().default(false),
  motivo_anulacion: text('motivo_anulacion'),
  anulado_en: timestamp('anulado_en', { withTimezone: true }),
  ...tiempos(),
});

export const movimientoStock = pgTable('movimiento_stock', {
  id: id(),
  producto_id: uuid('producto_id').notNull().references(() => producto.id),
  jornada_id: uuid('jornada_id').references(() => jornada.id),
  cantidad: integer('cantidad').notNull(),
  stock_resultante: integer('stock_resultante').notNull(),
  origen: origenMovimiento('origen').notNull(),
  motivo: text('motivo'),
  pedido_item_id: uuid('pedido_item_id').references(() => pedidoItem.id),
  ...tiempos(),
});

export const pago = pgTable('pago', {
  id: id(),
  cuenta_id: uuid('cuenta_id').notNull().references(() => cuenta.id),
  metodo: metodoPago('metodo').notNull(),
  monto: monto('monto').notNull(),
  referencia: text('referencia'),
  ...tiempos(),
});

export const egreso = pgTable('egreso', {
  id: id(),
  jornada_id: uuid('jornada_id').notNull().references(() => jornada.id),
  tipo: tipoEgreso('tipo').notNull(),
  monto: monto('monto').notNull(),
  motivo: text('motivo').notNull(),
  pedido_id: uuid('pedido_id').references(() => pedido.id),
  ...tiempos(),
});

export const encargoItem = pgTable('encargo_item', {
  id: id(),
  encargo_id: uuid('encargo_id').notNull().references(() => encargo.id),
  producto_id: uuid('producto_id').references(() => producto.id),
  es_libre: boolean('es_libre').notNull().default(false),
  nombre_producto: text('nombre_producto').notNull(),
  precio_unitario: monto('precio_unitario').notNull(),
  cantidad: integer('cantidad').notNull(),
  nota: text('nota'),
  ...tiempos(),
});

export const abono = pgTable('abono', {
  id: id(),
  encargo_id: uuid('encargo_id').notNull().references(() => encargo.id),
  jornada_id: uuid('jornada_id').notNull().references(() => jornada.id),
  metodo: metodoPago('metodo').notNull(),
  monto: monto('monto').notNull(),
  referencia: text('referencia'),
  estado: estadoAbono('estado').notNull().default('pendiente'),
  aplicado_en: timestamp('aplicado_en', { withTimezone: true }),
  devuelto_en: timestamp('devuelto_en', { withTimezone: true }),
  ...tiempos(),
});
```

- [ ] **Step 5: Crear drizzle.config.ts y generar la migración**

`drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/servidor/db/schema.ts',
  out: './src/servidor/db/migraciones',
});
```

Run: `npm run db:generar`
Expected: aparece `src/servidor/db/migraciones/0000_*.sql` y la carpeta `meta/`.

- [ ] **Step 6: Agregar migración manual con índices parciales**

Run: `npx drizzle-kit generate --custom --name=indices_parciales`
Expected: crea `src/servidor/db/migraciones/0001_indices_parciales.sql` vacío. Escribir en él:

```sql
CREATE UNIQUE INDEX jornada_abierta_unica ON jornada ((cerrada_en IS NULL)) WHERE cerrada_en IS NULL;
CREATE UNIQUE INDEX pedido_mesa_abierto_unico ON pedido (numero_mesa) WHERE estado = 'abierto' AND numero_mesa > 0;
CREATE UNIQUE INDEX cliente_identificacion_unica ON cliente (tipo_identificacion, identificacion)
  WHERE identificacion IS NOT NULL AND tipo_identificacion IS NOT NULL AND tipo_identificacion <> 'consumidor_final';
CREATE UNIQUE INDEX pedido_numero_por_jornada ON pedido (jornada_id, numero);
CREATE UNIQUE INDEX cuenta_numero_por_pedido ON cuenta (pedido_id, numero);
CREATE UNIQUE INDEX ronda_numero_por_pedido ON ronda (pedido_id, numero);
CREATE INDEX pedido_item_por_cuenta ON pedido_item (cuenta_id);
CREATE INDEX movimiento_stock_por_producto ON movimiento_stock (producto_id, creado_en);
CREATE INDEX encargo_por_fecha ON encargo (fecha_entrega, estado);
```

- [ ] **Step 7: Escribir migrar.ts y migrar-cli.ts**

`src/servidor/db/migrar.ts`:
```ts
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Db } from './conexion';

const carpeta = join(dirname(fileURLToPath(import.meta.url)), 'migraciones');

export async function ejecutarMigraciones(db: Db) {
  await migrate(db, { migrationsFolder: carpeta });
}
```

`src/servidor/db/migrar-cli.ts`:
```ts
import { config } from '../config';
import { crearDb } from './conexion';
import { ejecutarMigraciones } from './migrar';

const { db, sql } = crearDb(config.databaseUrl);
await ejecutarMigraciones(db);
await sql.end();
console.log('Migraciones aplicadas');
```

- [ ] **Step 8: Ejecutar las pruebas**

Run: `npm test -- tests/esquema.test.ts`
Expected: 4 passed.

- [ ] **Step 9: Commit y push**

```bash
git add -A
git commit -m "Esquema completo de la spec en Drizzle con migraciones e índices parciales"
git push origin main
```

---

### Task 3: Servidor Fastify, errores, eventos en vivo y `/api/estado`
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/errores.ts`, `src/servidor/eventos.ts`, `src/servidor/app.ts`, `src/servidor/index.ts`, `src/servidor/modulos/configuracion.ts`, `tests/ayuda/app.ts`, `tests/app.test.ts`

**Interfaces:**
- Consumes: `crearDb`, `Db`, `configuracion` (tabla) de Task 2.
- Produces:
  - `class ErrorNegocio extends Error { estado = 409 }`, `class ErrorValidacion extends Error { estado = 400 }`, `class NoEncontrado extends Error { estado = 404 }`.
  - `crearBusEventos(): { emitir(nombre: NombreEvento, datos?: unknown): void; suscribir(fn): () => void }` con `NombreEvento = 'jornada' | 'mesa' | 'stock' | 'catalogo' | 'config'`.
  - `crearApp({ db }): Promise<FastifyInstance>` con `app.bus` decorado.
  - `asegurarConfiguracion(db): Promise<Configuracion>`, `obtenerConfiguracion(db)`.
  - `crearAppDePrueba(): Promise<{ app, db, sql }>`.

- [ ] **Step 1: Escribir las pruebas**

`tests/ayuda/app.ts`:
```ts
import { prepararBaseDePrueba } from './db';
import { crearApp } from '../../src/servidor/app';

export async function crearAppDePrueba() {
  const { db, sql } = await prepararBaseDePrueba();
  const app = await crearApp({ db });
  await app.ready();
  return { app, db, sql };
}
```

`tests/app.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('GET /api/estado devuelve configuracion, jornada nula y meseros vacios', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/estado' });
  expect(r.statusCode).toBe(200);
  const cuerpo = r.json();
  expect(cuerpo.configuracion.nombre_local).toBe('Cafetería');
  expect(cuerpo.jornada).toBeNull();
  expect(cuerpo.meseros).toEqual([]);
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
```

- [ ] **Step 2: Ejecutar para ver que falla**

Run: `npm test -- tests/app.test.ts`
Expected: FAIL, no encuentra `src/servidor/app`.

- [ ] **Step 3: Escribir errores.ts y eventos.ts**

`src/servidor/errores.ts`:
```ts
export class ErrorNegocio extends Error { estado = 409; }
export class ErrorValidacion extends Error { estado = 400; }
export class NoEncontrado extends Error { estado = 404; constructor(m = 'No existe') { super(m); } }
```

`src/servidor/eventos.ts`:
```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export type NombreEvento = 'jornada' | 'mesa' | 'stock' | 'catalogo' | 'config';
export type Evento = { nombre: NombreEvento; datos?: unknown };
type Suscriptor = (e: Evento) => void;

export function crearBusEventos() {
  const suscriptores = new Set<Suscriptor>();
  return {
    emitir(nombre: NombreEvento, datos?: unknown) {
      for (const s of suscriptores) s({ nombre, datos });
    },
    suscribir(fn: Suscriptor) {
      suscriptores.add(fn);
      return () => { suscriptores.delete(fn); };
    },
  };
}
export type BusEventos = ReturnType<typeof crearBusEventos>;

export function rutaEventos(app: FastifyInstance) {
  app.get('/api/eventos', (req: FastifyRequest, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    reply.raw.write(': conectado\n\n');
    const cancelar = app.bus.suscribir((e) => {
      reply.raw.write(`event: ${e.nombre}\ndata: ${JSON.stringify(e.datos ?? {})}\n\n`);
    });
    const latido = setInterval(() => reply.raw.write(': latido\n\n'), 25000);
    req.raw.on('close', () => { clearInterval(latido); cancelar(); });
  });
}
```

- [ ] **Step 4: Escribir modulos/configuracion.ts (solo lectura por ahora)**

`src/servidor/modulos/configuracion.ts`:
```ts
import type { Db } from '../db/conexion';
import { configuracion } from '../db/schema';

export type Configuracion = typeof configuracion.$inferSelect;

export async function asegurarConfiguracion(db: Db): Promise<Configuracion> {
  const [existente] = await db.select().from(configuracion).limit(1);
  if (existente) return existente;
  const [nueva] = await db.insert(configuracion).values({}).returning();
  return nueva;
}

export async function obtenerConfiguracion(db: Db): Promise<Configuracion> {
  return asegurarConfiguracion(db);
}
```

- [ ] **Step 5: Escribir app.ts e index.ts**

`src/servidor/app.ts`:
```ts
import Fastify from 'fastify';
import { isNull } from 'drizzle-orm';
import type { Db } from './db/conexion';
import { crearBusEventos, rutaEventos, type BusEventos } from './eventos';
import { obtenerConfiguracion } from './modulos/configuracion';
import { jornada, mesero } from './db/schema';

declare module 'fastify' {
  interface FastifyInstance { db: Db; bus: BusEventos; }
}

export async function crearApp({ db }: { db: Db }) {
  const app = Fastify({ logger: false });
  app.decorate('db', db);
  app.decorate('bus', crearBusEventos());

  app.setErrorHandler((err: any, _req, reply) => {
    const estado = typeof err.estado === 'number' ? err.estado : err.validation ? 400 : 500;
    if (estado === 500) app.log.error(err);
    reply.status(estado).send({ error: estado === 500 ? 'Error inesperado del servidor' : err.message });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'No existe' }));

  app.get('/api/estado', async () => {
    const [abierta] = await db.select().from(jornada).where(isNull(jornada.cerrada_en)).limit(1);
    const meseros = await db.select().from(mesero).orderBy(mesero.nombre);
    return {
      configuracion: await obtenerConfiguracion(db),
      jornada: abierta ?? null,
      meseros: meseros.filter((m) => m.activo),
    };
  });
  rutaEventos(app);

  return app;
}
```

`src/servidor/index.ts`:
```ts
import { config } from './config';
import { crearDb } from './db/conexion';
import { ejecutarMigraciones } from './db/migrar';
import { asegurarConfiguracion } from './modulos/configuracion';
import { crearApp } from './app';

const { db } = crearDb(config.databaseUrl);
await ejecutarMigraciones(db);
await asegurarConfiguracion(db);
const app = await crearApp({ db });
await app.listen({ port: config.puerto, host: '0.0.0.0' });
console.log(`Servidor en http://0.0.0.0:${config.puerto}`);
```

- [ ] **Step 6: Ejecutar las pruebas**

Run: `npm test -- tests/app.test.ts`
Expected: 4 passed.

- [ ] **Step 7: Arrancar el servidor a mano y verificar**

Run: `npm run dev` en una terminal; en otra: `curl -s http://127.0.0.1:3000/api/estado`
Expected: JSON con `"nombre_local":"Cafetería"`. Detener con Ctrl+C.

- [ ] **Step 8: Commit y push**

```bash
git add -A
git commit -m "Servidor Fastify con manejo de errores, bus de eventos SSE y /api/estado"
git push origin main
```

---

### Task 4: API de configuración y meseros
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Modify: `src/servidor/modulos/configuracion.ts`
- Create: `src/servidor/modulos/meseros.ts`, `tests/configuracion.test.ts`, `tests/meseros.test.ts`
- Modify: `src/servidor/app.ts` (registrar rutas)

**Interfaces:**
- Produces:
  - `actualizarConfiguracion(db, cambios: Partial<CamposEditables>): Promise<Configuracion>` con `CamposEditables = { nombre_local, simbolo_moneda, cantidad_mesas, propina_sugerida_pct, umbral_stock_bajo, cocina_activa, sonido_cocina, permitir_items_libres }`.
  - `rutasConfiguracion(app)`: `GET /api/admin/configuracion`, `PATCH /api/admin/configuracion`.
  - `listarMeseros(db)`, `crearMesero(db, { nombre })`, `editarMesero(db, id, { nombre?, activo? })`, `rutasMeseros(app)`: `GET/POST /api/admin/meseros`, `PATCH /api/admin/meseros/:id`.
- Reglas: `cantidad_mesas` entero entre 1 y 200; `umbral_stock_bajo` entero ≥ 0; `propina_sugerida_pct` entre 0 y 100; nombre de mesero no vacío y único entre activos (409 "Ya existe un mesero con ese nombre").

- [ ] **Step 1: Escribir las pruebas**

`tests/configuracion.test.ts`:
```ts
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
```

`tests/meseros.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('crear, listar y desactivar meseros', async () => {
  const c = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: 'Carlos' } });
  expect(c.statusCode).toBe(201);
  const id = c.json().id;
  const dup = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: 'carlos' } });
  expect(dup.statusCode).toBe(409);
  expect(dup.json().error).toBe('Ya existe un mesero con ese nombre');
  const vacio = await ctx.app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre: '  ' } });
  expect(vacio.statusCode).toBe(400);
  const e = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/meseros/${id}`, payload: { activo: false } });
  expect(e.json().activo).toBe(false);
  const l = await ctx.app.inject({ method: 'GET', url: '/api/admin/meseros' });
  expect(l.json()).toHaveLength(1);
  const estado = await ctx.app.inject({ method: 'GET', url: '/api/estado' });
  expect(estado.json().meseros).toHaveLength(0);
});

test('PATCH de mesero inexistente responde 404', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/meseros/00000000-0000-0000-0000-000000000000', payload: { activo: true } });
  expect(r.statusCode).toBe(404);
});
```

- [ ] **Step 2: Ejecutar para ver que fallan**

Run: `npm test -- tests/configuracion.test.ts tests/meseros.test.ts`
Expected: FAIL con 404 en las rutas.

- [ ] **Step 3: Completar modulos/configuracion.ts**

Agregar al final de `src/servidor/modulos/configuracion.ts`:
```ts
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { ErrorValidacion } from '../errores';

export type CamposEditables = Pick<Configuracion,
  'nombre_local' | 'simbolo_moneda' | 'cantidad_mesas' | 'propina_sugerida_pct' | 'umbral_stock_bajo' | 'cocina_activa' | 'sonido_cocina' | 'permitir_items_libres'>;

const EDITABLES: (keyof CamposEditables)[] = ['nombre_local', 'simbolo_moneda', 'cantidad_mesas', 'propina_sugerida_pct', 'umbral_stock_bajo', 'cocina_activa', 'sonido_cocina', 'permitir_items_libres'];

export async function actualizarConfiguracion(db: Db, cambios: Partial<CamposEditables>): Promise<Configuracion> {
  const actual = await asegurarConfiguracion(db);
  const limpio: Partial<CamposEditables> = {};
  for (const k of EDITABLES) if (k in cambios) (limpio as any)[k] = (cambios as any)[k];
  if (limpio.cantidad_mesas !== undefined && (!Number.isInteger(limpio.cantidad_mesas) || limpio.cantidad_mesas < 1 || limpio.cantidad_mesas > 200))
    throw new ErrorValidacion('La cantidad de mesas debe estar entre 1 y 200');
  if (limpio.umbral_stock_bajo !== undefined && (!Number.isInteger(limpio.umbral_stock_bajo) || limpio.umbral_stock_bajo < 0))
    throw new ErrorValidacion('El umbral de stock bajo debe ser un entero mayor o igual a 0');
  if (limpio.propina_sugerida_pct !== undefined) {
    const n = Number(limpio.propina_sugerida_pct);
    if (Number.isNaN(n) || n < 0 || n > 100) throw new ErrorValidacion('La propina sugerida debe estar entre 0 y 100');
    limpio.propina_sugerida_pct = n.toFixed(2);
  }
  if (limpio.nombre_local !== undefined && !String(limpio.nombre_local).trim()) throw new ErrorValidacion('El nombre del local no puede estar vacío');
  const [actualizada] = await db.update(configuracion).set({ ...limpio, actualizado_en: new Date() }).where(eq(configuracion.id, actual.id)).returning();
  return actualizada;
}

export function rutasConfiguracion(app: FastifyInstance) {
  app.get('/api/admin/configuracion', async () => obtenerConfiguracion(app.db));
  app.patch('/api/admin/configuracion', async (req) => {
    const r = await actualizarConfiguracion(app.db, (req.body ?? {}) as Partial<CamposEditables>);
    app.bus.emitir('config');
    return r;
  });
}
```

- [ ] **Step 4: Escribir modulos/meseros.ts**

`src/servidor/modulos/meseros.ts`:
```ts
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { mesero } from '../db/schema';
import { ErrorNegocio, ErrorValidacion, NoEncontrado } from '../errores';

export async function listarMeseros(db: Db) {
  return db.select().from(mesero).orderBy(mesero.nombre);
}

async function verificarNombre(db: Db, nombre: string, exceptoId?: string) {
  const limpio = nombre.trim();
  if (!limpio) throw new ErrorValidacion('El nombre del mesero no puede estar vacío');
  const [dup] = await db.select({ id: mesero.id }).from(mesero)
    .where(sql`lower(${mesero.nombre}) = lower(${limpio}) AND ${mesero.activo} = true ${exceptoId ? sql`AND ${mesero.id} <> ${exceptoId}` : sql``}`);
  if (dup) throw new ErrorNegocio('Ya existe un mesero con ese nombre');
  return limpio;
}

export async function crearMesero(db: Db, datos: { nombre: string }) {
  const nombre = await verificarNombre(db, String(datos.nombre ?? ''));
  const [m] = await db.insert(mesero).values({ nombre }).returning();
  return m;
}

export async function editarMesero(db: Db, id: string, datos: { nombre?: string; activo?: boolean }) {
  const [existente] = await db.select().from(mesero).where(eq(mesero.id, id));
  if (!existente) throw new NoEncontrado('El mesero no existe');
  const cambios: Partial<typeof mesero.$inferInsert> = { actualizado_en: new Date() };
  if (datos.nombre !== undefined) cambios.nombre = await verificarNombre(db, datos.nombre, id);
  if (datos.activo !== undefined) cambios.activo = Boolean(datos.activo);
  const [m] = await db.update(mesero).set(cambios).where(eq(mesero.id, id)).returning();
  return m;
}

export function rutasMeseros(app: FastifyInstance) {
  app.get('/api/admin/meseros', async () => listarMeseros(app.db));
  app.post('/api/admin/meseros', async (req, reply) => {
    const m = await crearMesero(app.db, req.body as { nombre: string });
    app.bus.emitir('config');
    return reply.status(201).send(m);
  });
  app.patch<{ Params: { id: string } }>('/api/admin/meseros/:id', async (req) => {
    const m = await editarMesero(app.db, req.params.id, req.body as { nombre?: string; activo?: boolean });
    app.bus.emitir('config');
    return m;
  });
}
```

- [ ] **Step 5: Registrar rutas en app.ts**

En `src/servidor/app.ts`, agregar imports y, después de `rutaEventos(app);`:
```ts
import { rutasConfiguracion } from './modulos/configuracion';
import { rutasMeseros } from './modulos/meseros';
// ...
  rutasConfiguracion(app);
  rutasMeseros(app);
```

Nota: Fastify devuelve 400 con su propio mensaje si el id de la ruta no es uuid válido en PostgreSQL; para que el 404 de la prueba funcione, el id de prueba es un uuid válido con ceros.

- [ ] **Step 6: Ejecutar las pruebas**

Run: `npm test`
Expected: todas pasan (humo, esquema, app, configuracion, meseros).

- [ ] **Step 7: Commit y push**

```bash
git add -A
git commit -m "API de configuración y meseros con validaciones y eventos"
git push origin main
```

---

### Task 5: Catálogo: categorías, productos, stock y fotos
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/modulos/catalogo.ts`, `tests/catalogo.test.ts`
- Modify: `src/servidor/app.ts` (registrar `@fastify/multipart`, rutas y estáticos de fotos)

**Interfaces:**
- Consumes: `Db`, `ErrorNegocio`, `ErrorValidacion`, `NoEncontrado`, `app.bus`.
- Produces (todas en `catalogo.ts`):
  - `listarCategorias(db)`, `crearCategoria(db, { nombre, orden? })`, `editarCategoria(db, id, { nombre?, orden?, activa? })`.
  - `listarProductos(db)`, `crearProducto(db, datos)`, `editarProducto(db, id, datos)` con `datos = { categoria_id, nombre, descripcion?, precio: string|number, activo?, controla_stock, stock_actual?, orden? }`.
  - `ajustarStock(db, productoId, { stock: number, motivo: string, origen?: 'ajuste_manual' | 'apertura' }): Promise<Producto>` — crea `movimiento_stock` con `cantidad = stock − stock_actual`, `jornada_id` = jornada abierta o nulo.
  - `obtenerCatalogo(db): Promise<{ categorias: (Categoria & { productos: Producto[] })[] }>` solo activos, ordenados por `orden` y `nombre`.
  - `rutasCatalogo(app)`: `GET /api/catalogo`, `GET/POST /api/admin/categorias`, `PATCH /api/admin/categorias/:id`, `GET/POST /api/admin/productos`, `PATCH /api/admin/productos/:id`, `POST /api/admin/productos/:id/stock`, `POST /api/admin/productos/:id/foto` (multipart, campo `foto`, jpg/png/webp, máx 5 MB, guarda `fotos/<id>.<ext>` y fija `producto.foto = "/fotos/<id>.<ext>"`).
- Reglas: precio ≥ 0 con 2 decimales; nombre no vacío; `controla_stock=true` exige `stock_actual` entero ≥ 0 y `controla_stock=false` fuerza `stock_actual=null`; ajuste de stock exige `motivo` no vacío y producto con `controla_stock=true`, stock resultante ≥ 0 (400 "El stock no puede ser negativo"); categoría inexistente → 404.
- Eventos: `catalogo` al crear o editar categorías y productos; `stock` con `{ producto_id, stock_actual }` al ajustar stock.

- [ ] **Step 1: Escribir las pruebas**

`tests/catalogo.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
let categoriaId: string;
beforeAll(async () => {
  ctx = await crearAppDePrueba();
  const c = await ctx.app.inject({ method: 'POST', url: '/api/admin/categorias', payload: { nombre: 'Sandwiches', orden: 2 } });
  expect(c.statusCode).toBe(201);
  categoriaId = c.json().id;
});
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('crear producto con stock y leerlo en el catalogo', async () => {
  const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Sándwich de pollo', precio: 4.5, controla_stock: true, stock_actual: 12 } });
  expect(r.statusCode).toBe(201);
  expect(r.json().precio).toBe('4.50');
  expect(r.json().stock_actual).toBe(12);
  const cat = await ctx.app.inject({ method: 'GET', url: '/api/catalogo' });
  expect(cat.json().categorias[0].nombre).toBe('Sandwiches');
  expect(cat.json().categorias[0].productos[0].nombre).toBe('Sándwich de pollo');
});

test('producto sin control de stock ignora stock_actual', async () => {
  const r = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Capuchino', precio: '2.50', controla_stock: false, stock_actual: 99 } });
  expect(r.statusCode).toBe(201);
  expect(r.json().stock_actual).toBeNull();
});

test('validaciones de producto', async () => {
  const sinNombre = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: '', precio: 1, controla_stock: false } });
  expect(sinNombre.statusCode).toBe(400);
  const precioNeg = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'X', precio: -1, controla_stock: false } });
  expect(precioNeg.statusCode).toBe(400);
  const sinStock = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'X', precio: 1, controla_stock: true } });
  expect(sinStock.statusCode).toBe(400);
  const catInexistente = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: '00000000-0000-0000-0000-000000000000', nombre: 'X', precio: 1, controla_stock: false } });
  expect(catInexistente.statusCode).toBe(404);
});

test('ajustar stock crea movimiento y emite evento stock', async () => {
  const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Bolón', precio: 3, controla_stock: true, stock_actual: 3 } });
  const id = p.json().id;
  const eventos: any[] = [];
  ctx.app.bus.suscribir((e) => eventos.push(e));
  const r = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/stock`, payload: { stock: 10, motivo: 'Se hicieron más' } });
  expect(r.statusCode).toBe(200);
  expect(r.json().stock_actual).toBe(10);
  expect(eventos.find((e) => e.nombre === 'stock')?.datos).toEqual({ producto_id: id, stock_actual: 10 });
  const movs = await ctx.sql`SELECT cantidad, stock_resultante, origen, motivo, jornada_id FROM movimiento_stock WHERE producto_id = ${id}`;
  expect(movs).toHaveLength(1);
  expect(movs[0]).toMatchObject({ cantidad: 7, stock_resultante: 10, origen: 'ajuste_manual', motivo: 'Se hicieron más', jornada_id: null });
  const neg = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/stock`, payload: { stock: -1, motivo: 'x' } });
  expect(neg.statusCode).toBe(400);
  expect(neg.json().error).toBe('El stock no puede ser negativo');
  const sinMotivo = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/stock`, payload: { stock: 5, motivo: '' } });
  expect(sinMotivo.statusCode).toBe(400);
});

test('editar categoria inactiva la saca del catalogo', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/categorias/${categoriaId}`, payload: { activa: false } });
  expect(r.statusCode).toBe(200);
  const cat = await ctx.app.inject({ method: 'GET', url: '/api/catalogo' });
  expect(cat.json().categorias).toHaveLength(0);
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/categorias/${categoriaId}`, payload: { activa: true } });
});

test('subir foto guarda archivo y actualiza producto', async () => {
  const p = await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre: 'Con foto', precio: 1, controla_stock: false } });
  const id = p.json().id;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const limite = '----limite';
  const cuerpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="foto"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
    png,
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  const r = await ctx.app.inject({ method: 'POST', url: `/api/admin/productos/${id}/foto`, headers: { 'content-type': `multipart/form-data; boundary=${limite}` }, payload: cuerpo });
  expect(r.statusCode).toBe(200);
  expect(r.json().foto).toBe(`/fotos/${id}.png`);
  const f = await ctx.app.inject({ method: 'GET', url: `/fotos/${id}.png` });
  expect(f.statusCode).toBe(200);
});
```

- [ ] **Step 2: Ejecutar para ver que falla**

Run: `npm test -- tests/catalogo.test.ts`
Expected: FAIL con 404 en `/api/admin/categorias`.

- [ ] **Step 3: Escribir modulos/catalogo.ts**

`src/servidor/modulos/catalogo.ts`:
```ts
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db } from '../db/conexion';
import { categoria, producto, movimientoStock, jornada } from '../db/schema';
import { ErrorNegocio, ErrorValidacion, NoEncontrado } from '../errores';
import { config } from '../config';

export type Categoria = typeof categoria.$inferSelect;
export type Producto = typeof producto.$inferSelect;

function precioValido(v: unknown): string {
  const n = Number(v);
  if (v === undefined || v === null || v === '' || Number.isNaN(n) || n < 0) throw new ErrorValidacion('El precio debe ser un número mayor o igual a 0');
  return n.toFixed(2);
}
function textoObligatorio(v: unknown, mensaje: string): string {
  const t = String(v ?? '').trim();
  if (!t) throw new ErrorValidacion(mensaje);
  return t;
}
function enteroNoNegativo(v: unknown, mensaje: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new ErrorValidacion(mensaje);
  return n;
}

// ---- Categorías
export async function listarCategorias(db: Db) {
  return db.select().from(categoria).orderBy(asc(categoria.orden), asc(categoria.nombre));
}
export async function crearCategoria(db: Db, datos: { nombre: string; orden?: number }) {
  const nombre = textoObligatorio(datos.nombre, 'El nombre de la categoría no puede estar vacío');
  const [c] = await db.insert(categoria).values({ nombre, orden: datos.orden ?? 0 }).returning();
  return c;
}
export async function editarCategoria(db: Db, id: string, datos: { nombre?: string; orden?: number; activa?: boolean }) {
  const [existe] = await db.select().from(categoria).where(eq(categoria.id, id));
  if (!existe) throw new NoEncontrado('La categoría no existe');
  const cambios: Partial<typeof categoria.$inferInsert> = { actualizado_en: new Date() };
  if (datos.nombre !== undefined) cambios.nombre = textoObligatorio(datos.nombre, 'El nombre de la categoría no puede estar vacío');
  if (datos.orden !== undefined) cambios.orden = Number(datos.orden) || 0;
  if (datos.activa !== undefined) cambios.activa = Boolean(datos.activa);
  const [c] = await db.update(categoria).set(cambios).where(eq(categoria.id, id)).returning();
  return c;
}

// ---- Productos
type DatosProducto = { categoria_id: string; nombre: string; descripcion?: string | null; precio: string | number; activo?: boolean; controla_stock: boolean; stock_actual?: number | null; orden?: number };

async function validarProducto(db: Db, datos: Partial<DatosProducto>, esNuevo: boolean) {
  const cambios: Partial<typeof producto.$inferInsert> = {};
  if (esNuevo || datos.categoria_id !== undefined) {
    const [c] = await db.select({ id: categoria.id }).from(categoria).where(eq(categoria.id, String(datos.categoria_id)));
    if (!c) throw new NoEncontrado('La categoría no existe');
    cambios.categoria_id = c.id;
  }
  if (esNuevo || datos.nombre !== undefined) cambios.nombre = textoObligatorio(datos.nombre, 'El nombre del producto no puede estar vacío');
  if (esNuevo || datos.precio !== undefined) cambios.precio = precioValido(datos.precio);
  if (datos.descripcion !== undefined) cambios.descripcion = datos.descripcion ? String(datos.descripcion) : null;
  if (datos.activo !== undefined) cambios.activo = Boolean(datos.activo);
  if (datos.orden !== undefined) cambios.orden = Number(datos.orden) || 0;
  if (esNuevo || datos.controla_stock !== undefined) {
    cambios.controla_stock = Boolean(datos.controla_stock);
    if (cambios.controla_stock) {
      if (datos.stock_actual === undefined || datos.stock_actual === null) throw new ErrorValidacion('Un producto con control de stock necesita stock inicial');
      cambios.stock_actual = enteroNoNegativo(datos.stock_actual, 'El stock debe ser un entero mayor o igual a 0');
    } else {
      cambios.stock_actual = null;
    }
  } else if (datos.stock_actual !== undefined) {
    throw new ErrorValidacion('Para cambiar el stock usa el ajuste de stock con motivo');
  }
  return cambios;
}

export async function listarProductos(db: Db) {
  return db.select().from(producto).orderBy(asc(producto.orden), asc(producto.nombre));
}
export async function crearProducto(db: Db, datos: DatosProducto) {
  const cambios = await validarProducto(db, datos, true);
  const [p] = await db.insert(producto).values(cambios as typeof producto.$inferInsert).returning();
  return p;
}
export async function editarProducto(db: Db, id: string, datos: Partial<DatosProducto>) {
  const [existe] = await db.select().from(producto).where(eq(producto.id, id));
  if (!existe) throw new NoEncontrado('El producto no existe');
  if (datos.controla_stock === true && existe.controla_stock && datos.stock_actual !== undefined) {
    throw new ErrorValidacion('Para cambiar el stock usa el ajuste de stock con motivo');
  }
  const cambios = await validarProducto(db, { ...datos, stock_actual: datos.controla_stock === true && existe.controla_stock ? existe.stock_actual : datos.stock_actual }, false);
  const [p] = await db.update(producto).set({ ...cambios, actualizado_en: new Date() }).where(eq(producto.id, id)).returning();
  return p;
}

export async function ajustarStock(db: Db, productoId: string, datos: { stock: number; motivo: string; origen?: 'ajuste_manual' | 'apertura' }) {
  const motivo = textoObligatorio(datos.motivo, 'El ajuste de stock necesita un motivo');
  const nuevo = Number(datos.stock);
  if (!Number.isInteger(nuevo)) throw new ErrorValidacion('El stock debe ser un número entero');
  if (nuevo < 0) throw new ErrorValidacion('El stock no puede ser negativo');
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(producto).where(eq(producto.id, productoId)).for('update');
    if (!p) throw new NoEncontrado('El producto no existe');
    if (!p.controla_stock) throw new ErrorNegocio('Este producto no controla stock');
    const [abierta] = await tx.select({ id: jornada.id }).from(jornada).where(isNull(jornada.cerrada_en));
    const [actualizado] = await tx.update(producto).set({ stock_actual: nuevo, actualizado_en: new Date() }).where(eq(producto.id, productoId)).returning();
    await tx.insert(movimientoStock).values({
      producto_id: productoId, jornada_id: abierta?.id ?? null, cantidad: nuevo - (p.stock_actual ?? 0),
      stock_resultante: nuevo, origen: datos.origen ?? 'ajuste_manual', motivo,
    });
    return actualizado;
  });
}

export async function obtenerCatalogo(db: Db) {
  const cats = await db.select().from(categoria).where(eq(categoria.activa, true)).orderBy(asc(categoria.orden), asc(categoria.nombre));
  const prods = await db.select().from(producto).where(eq(producto.activo, true)).orderBy(asc(producto.orden), asc(producto.nombre));
  return { categorias: cats.map((c) => ({ ...c, productos: prods.filter((p) => p.categoria_id === c.id) })) };
}

const EXTENSIONES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function rutasCatalogo(app: FastifyInstance) {
  app.get('/api/catalogo', async () => obtenerCatalogo(app.db));
  app.get('/api/admin/categorias', async () => listarCategorias(app.db));
  app.post('/api/admin/categorias', async (req, reply) => {
    const c = await crearCategoria(app.db, req.body as any); app.bus.emitir('catalogo'); return reply.status(201).send(c);
  });
  app.patch<{ Params: { id: string } }>('/api/admin/categorias/:id', async (req) => {
    const c = await editarCategoria(app.db, req.params.id, req.body as any); app.bus.emitir('catalogo'); return c;
  });
  app.get('/api/admin/productos', async () => listarProductos(app.db));
  app.post('/api/admin/productos', async (req, reply) => {
    const p = await crearProducto(app.db, req.body as any); app.bus.emitir('catalogo'); return reply.status(201).send(p);
  });
  app.patch<{ Params: { id: string } }>('/api/admin/productos/:id', async (req) => {
    const p = await editarProducto(app.db, req.params.id, req.body as any); app.bus.emitir('catalogo'); return p;
  });
  app.post<{ Params: { id: string } }>('/api/admin/productos/:id/stock', async (req) => {
    const p = await ajustarStock(app.db, req.params.id, req.body as any);
    app.bus.emitir('stock', { producto_id: p.id, stock_actual: p.stock_actual });
    return p;
  });
  app.post<{ Params: { id: string } }>('/api/admin/productos/:id/foto', async (req) => {
    const archivo = await req.file({ limits: { fileSize: 5 * 1024 * 1024 } });
    if (!archivo) throw new ErrorValidacion('Falta el archivo de foto');
    const ext = EXTENSIONES[archivo.mimetype];
    if (!ext) throw new ErrorValidacion('La foto debe ser JPG, PNG o WEBP');
    const [existe] = await app.db.select().from(producto).where(eq(producto.id, req.params.id));
    if (!existe) throw new NoEncontrado('El producto no existe');
    await mkdir(config.carpetaFotos, { recursive: true });
    const nombre = `${req.params.id}.${ext}`;
    await writeFile(join(config.carpetaFotos, nombre), await archivo.toBuffer());
    const [p] = await app.db.update(producto).set({ foto: `/fotos/${nombre}`, actualizado_en: new Date() }).where(eq(producto.id, req.params.id)).returning();
    app.bus.emitir('catalogo');
    return p;
  });
}
```

- [ ] **Step 4: Registrar multipart, fotos estáticas y rutas en app.ts**

En `src/servidor/app.ts` agregar imports:
```ts
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { config } from './config';
import { rutasCatalogo } from './modulos/catalogo';
```
Después de `app.decorate('bus', ...)`:
```ts
  await app.register(multipart);
  mkdirSync(config.carpetaFotos, { recursive: true });
  await app.register(fastifyStatic, { root: resolve(config.carpetaFotos), prefix: '/fotos/', decorateReply: false });
```
Después de `rutasMeseros(app);`:
```ts
  rutasCatalogo(app);
```

- [ ] **Step 5: Ejecutar las pruebas**

Run: `npm test`
Expected: todas pasan. `fotos/` queda ignorado por git.

- [ ] **Step 6: Commit y push**

```bash
git add -A
git commit -m "Catálogo: categorías, productos, ajuste de stock con movimientos y fotos"
git push origin main
```

---

### Task 6: Web base con Preact + Vite servida por Fastify
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `vite.config.ts`, `src/web/index.html`, `src/web/main.tsx`, `src/web/api.ts`, `src/web/eventos.ts`, `src/web/estilos.css`, `src/web/admin/AppAdmin.tsx`, `src/web/mesero/AppMesero.tsx`, `src/web/caja/AppCaja.tsx`, `src/web/cocina/AppCocina.tsx`, `tests/web.test.ts`
- Modify: `src/servidor/app.ts` (servir `dist/web` y devolver `index.html` en `/`, `/admin`, `/mesero`, `/caja`, `/cocina`)

**Interfaces:**
- Produces:
  - `api.get(url)`, `api.post(url, cuerpo)`, `api.patch(url, cuerpo)`: hacen `fetch` a `/api/...`, lanzan `Error(mensaje)` con el `error` del servidor si el estado no es 2xx.
  - `useEventos(nombres: NombreEvento[], callback: (nombre, datos) => void)`: hook que abre un `EventSource` a `/api/eventos`, reconecta cada 2 s y expone `conectado: boolean`.
  - `useEstado()`: hook que carga `/api/estado` y lo recarga con eventos `jornada` y `config`.
- Rutas de página: `/admin` → `AppAdmin`, `/mesero` → `AppMesero`, `/caja` → `AppCaja`, `/cocina` → `AppCocina`, `/` → índice con 4 enlaces.

- [ ] **Step 1: Escribir la prueba**

`tests/web.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('dist/web/index.html existe (ejecutar npm run build antes)', () => {
  expect(existsSync('dist/web/index.html')).toBe(true);
});

for (const ruta of ['/', '/admin', '/mesero', '/caja', '/cocina']) {
  test(`GET ${ruta} devuelve la pagina`, async () => {
    const r = await ctx.app.inject({ method: 'GET', url: ruta });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.body).toContain('<div id="app">');
  });
}

test('GET /api/no-existe sigue devolviendo JSON 404', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/no-existe' });
  expect(r.statusCode).toBe(404);
  expect(r.json().error).toBe('No existe');
});
```

- [ ] **Step 2: Ejecutar para ver que falla**

Run: `npm test -- tests/web.test.ts`
Expected: FAIL, `dist/web/index.html` no existe.

- [ ] **Step 3: Crear vite.config.ts e index.html**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  root: 'src/web',
  plugins: [preact()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3000', '/fotos': 'http://127.0.0.1:3000' } },
});
```

`src/web/index.html`:
```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cafetería</title>
<link rel="stylesheet" href="./estilos.css">
</head>
<body>
<div id="app"></div>
<script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 4: Escribir api.ts, eventos.ts y estilos.css**

`src/web/api.ts`:
```ts
async function llamar(metodo: string, url: string, cuerpo?: unknown) {
  const r = await fetch(url, {
    method: metodo,
    headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new Error(datos?.error ?? `Error ${r.status}`);
  return datos;
}
export const api = {
  get: (url: string) => llamar('GET', url),
  post: (url: string, cuerpo?: unknown) => llamar('POST', url, cuerpo ?? {}),
  patch: (url: string, cuerpo: unknown) => llamar('PATCH', url, cuerpo),
  del: (url: string) => llamar('DELETE', url),
  async subirArchivo(url: string, campo: string, archivo: File) {
    const fd = new FormData(); fd.append(campo, archivo);
    const r = await fetch(url, { method: 'POST', body: fd });
    const datos = await r.json();
    if (!r.ok) throw new Error(datos?.error ?? `Error ${r.status}`);
    return datos;
  },
};
```

`src/web/eventos.ts`:
```ts
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from './api';

export type NombreEvento = 'jornada' | 'mesa' | 'stock' | 'catalogo' | 'config';

export function useEventos(nombres: NombreEvento[], callback: (nombre: NombreEvento, datos: any) => void) {
  const [conectado, setConectado] = useState(false);
  const cb = useRef(callback); cb.current = callback;
  useEffect(() => {
    let es: EventSource | null = null; let timer: any = null; let vivo = true;
    const abrir = () => {
      es = new EventSource('/api/eventos');
      es.onopen = () => setConectado(true);
      for (const n of nombres) es.addEventListener(n, (e: MessageEvent) => cb.current(n, e.data ? JSON.parse(e.data) : {}));
      es.onerror = () => { setConectado(false); es?.close(); if (vivo) timer = setTimeout(abrir, 2000); };
    };
    abrir();
    return () => { vivo = false; clearTimeout(timer); es?.close(); };
  }, [nombres.join(',')]);
  return conectado;
}

export type Estado = { configuracion: any; jornada: any | null; meseros: { id: string; nombre: string }[] };

export function useEstado() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const cargar = () => api.get('/api/estado').then(setEstado).catch(() => {});
  useEffect(() => { cargar(); }, []);
  const conectado = useEventos(['jornada', 'config'], () => cargar());
  return { estado, conectado, recargar: cargar };
}
```

`src/web/estilos.css`:
```css
:root { --fondo:#fff; --tinta:#1b1f1c; --gris:#7c877f; --linea:#d9dfda; --acento:#1e6b55; --acento-suave:#e3f0ea; --alerta:#b7791f; --alerta-suave:#fbf0da; --error:#b23a2e; --error-suave:#f8e3e0; }
* { box-sizing:border-box; }
body { margin:0; font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; font-size:16px; color:var(--tinta); background:var(--fondo); }
button { font:inherit; min-height:44px; padding:8px 16px; border:1px solid var(--linea); border-radius:6px; background:#fff; color:var(--tinta); cursor:pointer; }
button.primario { background:var(--acento); color:#fff; border-color:var(--acento); }
button.peligro { background:var(--error); color:#fff; border-color:var(--error); }
button:disabled { opacity:.5; cursor:not-allowed; }
input, select, textarea { font:inherit; min-height:44px; padding:8px 10px; border:1px solid var(--linea); border-radius:6px; width:100%; }
label { display:grid; gap:4px; font-size:14px; color:var(--gris); }
.barra { display:flex; gap:12px; align-items:center; padding:12px 16px; border-bottom:1px solid var(--linea); flex-wrap:wrap; }
.barra h1 { font-size:20px; margin:0; }
.contenido { padding:16px; max-width:1100px; margin:0 auto; }
.pestanas { display:flex; gap:4px; border-bottom:1px solid var(--linea); margin-bottom:16px; }
.pestanas button { border:0; border-bottom:3px solid transparent; border-radius:0; background:none; }
.pestanas button.activa { border-bottom-color:var(--acento); color:var(--acento); font-weight:600; }
.fila { display:flex; gap:12px; flex-wrap:wrap; align-items:end; }
.fila > * { flex:1 1 160px; }
table { border-collapse:collapse; width:100%; font-size:15px; }
th, td { text-align:left; padding:8px; border-bottom:1px solid var(--linea); vertical-align:middle; }
.aviso { padding:10px 14px; border-radius:6px; margin:12px 0; }
.aviso.error { background:var(--error-suave); color:var(--error); }
.aviso.ok { background:var(--acento-suave); color:var(--acento); }
.sin-conexion { background:var(--error); color:#fff; text-align:center; padding:6px; font-size:14px; }
.tarjeta { border:1px solid var(--linea); border-radius:8px; padding:12px; }
.pill { display:inline-block; font-size:12px; padding:2px 8px; border-radius:999px; background:#f0f2f0; color:var(--gris); }
.pill.ok { background:var(--acento-suave); color:var(--acento); }
.pill.alerta { background:var(--alerta-suave); color:var(--alerta); }
.pill.error { background:var(--error-suave); color:var(--error); }
```

- [ ] **Step 5: Escribir main.tsx y las 4 apps (3 placeholders)**

`src/web/main.tsx`:
```tsx
import { render } from 'preact';
import { AppAdmin } from './admin/AppAdmin';
import { AppMesero } from './mesero/AppMesero';
import { AppCaja } from './caja/AppCaja';
import { AppCocina } from './cocina/AppCocina';

function Indice() {
  return (
    <div class="contenido">
      <h1>Cafetería</h1>
      <p>Elige tu puesto:</p>
      <p><a href="/mesero">Mesero</a> · <a href="/caja">Caja</a> · <a href="/cocina">Cocina</a> · <a href="/admin">Admin</a></p>
    </div>
  );
}

const ruta = location.pathname.replace(/\/+$/, '') || '/';
const App = ruta === '/admin' ? AppAdmin : ruta === '/mesero' ? AppMesero : ruta === '/caja' ? AppCaja : ruta === '/cocina' ? AppCocina : Indice;
render(<App />, document.getElementById('app')!);
```

`src/web/admin/AppAdmin.tsx` (placeholder; se completa en Task 7):
```tsx
export function AppAdmin() {
  return <div class="contenido"><h1>Admin</h1><p>En construcción.</p></div>;
}
```

`src/web/mesero/AppMesero.tsx`:
```tsx
import { useEstado } from '../eventos';
export function AppMesero() {
  const { estado } = useEstado();
  if (!estado) return <div class="contenido">Cargando…</div>;
  if (!estado.jornada) return <div class="contenido"><h1>Caja cerrada</h1><p>No se pueden tomar pedidos hasta que caja abra la jornada.</p></div>;
  return <div class="contenido"><h1>Mesero</h1><p>Pantalla en construcción (plan 2).</p></div>;
}
```

`src/web/caja/AppCaja.tsx`:
```tsx
export function AppCaja() {
  return <div class="contenido"><h1>Caja</h1><p>Pantalla en construcción (plan 2).</p></div>;
}
```

`src/web/cocina/AppCocina.tsx`:
```tsx
import { useEstado } from '../eventos';
export function AppCocina() {
  const { estado } = useEstado();
  if (!estado) return <div class="contenido">Cargando…</div>;
  if (!estado.configuracion.cocina_activa) return <div class="contenido"><h1>Pantalla de cocina desactivada</h1><p>Actívala en Admin, Configuración.</p></div>;
  return <div class="contenido"><h1>Cocina</h1><p>Pantalla en construcción (plan 3).</p></div>;
}
```

- [ ] **Step 6: Servir la web desde Fastify**

En `src/servidor/app.ts`, después del registro de `/fotos/`:
```ts
  const carpetaWeb = resolve('dist/web');
  if (existsSync(join(carpetaWeb, 'index.html'))) {
    await app.register(fastifyStatic, { root: carpetaWeb, prefix: '/', decorateReply: true, index: false, wildcard: false });
    for (const ruta of ['/', '/admin', '/mesero', '/caja', '/cocina']) {
      app.get(ruta, (_req, reply) => reply.sendFile('index.html'));
    }
  }
```
Agregar a los imports: `import { existsSync, mkdirSync } from 'node:fs';` y `import { join, resolve } from 'node:path';`.

Cambiar el `setNotFoundHandler` para que las rutas fuera de `/api` que no existan también devuelvan `{ error: 'No existe' }` (comportamiento actual, no cambia).

- [ ] **Step 7: Construir y ejecutar las pruebas**

Run: `npm run build && npm test`
Expected: `dist/web/index.html` creado; todas las pruebas pasan. `npm run typecheck` sin errores.

- [ ] **Step 8: Verificar en el navegador**

Run: `npm run dev` y abrir `http://127.0.0.1:3000/mesero`.
Expected: se ve "Caja cerrada". Abrir `/cocina`: "Pantalla de cocina desactivada". Detener con Ctrl+C.

- [ ] **Step 9: Commit y push**

```bash
git add -A
git commit -m "Web base Preact + Vite servida por Fastify con cliente API y eventos en vivo"
git push origin main
```

---

### Task 7: Pantalla de admin: configuración, meseros y menú
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Modify: `src/web/admin/AppAdmin.tsx`
- Create: `src/web/admin/Configuracion.tsx`, `src/web/admin/Meseros.tsx`, `src/web/admin/Menu.tsx`, `src/web/componentes/Aviso.tsx`

**Interfaces:**
- Consumes: `api`, `useEventos`, `useEstado`, rutas de Tasks 4 y 5.
- Produces: `AppAdmin` con pestañas Configuración, Meseros, Menú. `Aviso({ tipo: 'ok'|'error', texto })`.

- [ ] **Step 1: Escribir Aviso.tsx y AppAdmin.tsx**

`src/web/componentes/Aviso.tsx`:
```tsx
export function Aviso({ tipo, texto }: { tipo: 'ok' | 'error'; texto: string | null }) {
  if (!texto) return null;
  return <div class={`aviso ${tipo}`}>{texto}</div>;
}
```

`src/web/admin/AppAdmin.tsx`:
```tsx
import { useState } from 'preact/hooks';
import { useEstado } from '../eventos';
import { Configuracion } from './Configuracion';
import { Meseros } from './Meseros';
import { Menu } from './Menu';

const PESTANAS = [['config', 'Configuración'], ['meseros', 'Meseros'], ['menu', 'Menú']] as const;

export function AppAdmin() {
  const { estado, conectado } = useEstado();
  const [pestana, setPestana] = useState<'config' | 'meseros' | 'menu'>('menu');
  return (
    <div>
      {!conectado && <div class="sin-conexion">Sin conexión con el servidor. Reintentando…</div>}
      <div class="barra"><h1>Admin · {estado?.configuracion?.nombre_local ?? ''}</h1>
        <span class="pill">{estado?.jornada ? 'Caja abierta' : 'Caja cerrada'}</span></div>
      <div class="contenido">
        <div class="pestanas">
          {PESTANAS.map(([k, t]) => <button key={k} class={pestana === k ? 'activa' : ''} onClick={() => setPestana(k)}>{t}</button>)}
        </div>
        {pestana === 'config' && <Configuracion />}
        {pestana === 'meseros' && <Meseros />}
        {pestana === 'menu' && <Menu />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Escribir Configuracion.tsx**

`src/web/admin/Configuracion.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { Aviso } from '../componentes/Aviso';

const CAMPOS = [
  ['nombre_local', 'Nombre del local', 'text'],
  ['simbolo_moneda', 'Símbolo de moneda', 'text'],
  ['cantidad_mesas', 'Cantidad de mesas', 'number'],
  ['propina_sugerida_pct', 'Propina sugerida (%)', 'number'],
  ['umbral_stock_bajo', 'Umbral de stock bajo', 'number'],
] as const;
const INTERRUPTORES = [
  ['cocina_activa', 'Usar pantalla de cocina'],
  ['sonido_cocina', 'Sonido en cocina al recibir ronda'],
  ['permitir_items_libres', 'Permitir ítems libres (texto y valor)'],
] as const;

export function Configuracion() {
  const [datos, setDatos] = useState<any>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  useEffect(() => { api.get('/api/admin/configuracion').then(setDatos); }, []);
  if (!datos) return <p>Cargando…</p>;
  const guardar = async (e: Event) => {
    e.preventDefault();
    try {
      const cuerpo: any = {};
      for (const [k, , tipo] of CAMPOS) cuerpo[k] = tipo === 'number' ? Number(datos[k]) : datos[k];
      for (const [k] of INTERRUPTORES) cuerpo[k] = Boolean(datos[k]);
      setDatos(await api.patch('/api/admin/configuracion', cuerpo));
      setAviso({ tipo: 'ok', texto: 'Configuración guardada' });
    } catch (err: any) { setAviso({ tipo: 'error', texto: err.message }); }
  };
  return (
    <form onSubmit={guardar} style="display:grid;gap:12px;max-width:520px">
      {CAMPOS.map(([k, etiqueta, tipo]) => (
        <label key={k}>{etiqueta}
          <input type={tipo} value={datos[k]} onInput={(e) => setDatos({ ...datos, [k]: (e.target as HTMLInputElement).value })} /></label>
      ))}
      {INTERRUPTORES.map(([k, etiqueta]) => (
        <label key={k} style="display:flex;gap:8px;align-items:center;color:inherit">
          <input type="checkbox" style="width:auto;min-height:0" checked={Boolean(datos[k])} onChange={(e) => setDatos({ ...datos, [k]: (e.target as HTMLInputElement).checked })} />{etiqueta}</label>
      ))}
      <Aviso tipo={aviso?.tipo ?? 'ok'} texto={aviso?.texto ?? null} />
      <button class="primario" type="submit">Guardar</button>
    </form>
  );
}
```

- [ ] **Step 3: Escribir Meseros.tsx**

`src/web/admin/Meseros.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { Aviso } from '../componentes/Aviso';

export function Meseros() {
  const [lista, setLista] = useState<any[]>([]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cargar = () => api.get('/api/admin/meseros').then(setLista);
  useEffect(() => { cargar(); }, []);
  const crear = async (e: Event) => {
    e.preventDefault(); setError(null);
    try { await api.post('/api/admin/meseros', { nombre }); setNombre(''); await cargar(); }
    catch (err: any) { setError(err.message); }
  };
  const alternar = async (m: any) => {
    try { await api.patch(`/api/admin/meseros/${m.id}`, { activo: !m.activo }); await cargar(); }
    catch (err: any) { setError(err.message); }
  };
  return (
    <div>
      <form onSubmit={crear} class="fila">
        <label>Nombre del mesero<input value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} /></label>
        <button class="primario" type="submit" style="flex:0 0 auto">Agregar</button>
      </form>
      <Aviso tipo="error" texto={error} />
      <table><thead><tr><th>Nombre</th><th>Estado</th><th></th></tr></thead>
        <tbody>{lista.map((m) => (
          <tr key={m.id}><td>{m.nombre}</td><td><span class={`pill ${m.activo ? 'ok' : ''}`}>{m.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td><button onClick={() => alternar(m)}>{m.activo ? 'Desactivar' : 'Activar'}</button></td></tr>
        ))}</tbody></table>
    </div>
  );
}
```

- [ ] **Step 4: Escribir Menu.tsx**

`src/web/admin/Menu.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { Aviso } from '../componentes/Aviso';

const VACIO = { categoria_id: '', nombre: '', descripcion: '', precio: '', controla_stock: false, stock_actual: '' };

export function Menu() {
  const [categorias, setCategorias] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [nuevaCat, setNuevaCat] = useState('');
  const [form, setForm] = useState<any>(VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = async () => {
    setCategorias(await api.get('/api/admin/categorias'));
    setProductos(await api.get('/api/admin/productos'));
  };
  useEffect(() => { cargar(); }, []);
  useEventos(['catalogo', 'stock'], () => cargar());

  const crearCategoria = async (e: Event) => {
    e.preventDefault(); setError(null);
    try { await api.post('/api/admin/categorias', { nombre: nuevaCat, orden: categorias.length + 1 }); setNuevaCat(''); }
    catch (err: any) { setError(err.message); }
  };
  const guardarProducto = async (e: Event) => {
    e.preventDefault(); setError(null);
    const cuerpo: any = { categoria_id: form.categoria_id, nombre: form.nombre, descripcion: form.descripcion || null, precio: form.precio, controla_stock: form.controla_stock };
    if (!editandoId && form.controla_stock) cuerpo.stock_actual = Number(form.stock_actual);
    if (editandoId && form.controla_stock && !productos.find((p) => p.id === editandoId)?.controla_stock) cuerpo.stock_actual = Number(form.stock_actual);
    try {
      if (editandoId) await api.patch(`/api/admin/productos/${editandoId}`, cuerpo);
      else await api.post('/api/admin/productos', cuerpo);
      setForm(VACIO); setEditandoId(null);
    } catch (err: any) { setError(err.message); }
  };
  const editar = (p: any) => { setEditandoId(p.id); setForm({ categoria_id: p.categoria_id, nombre: p.nombre, descripcion: p.descripcion ?? '', precio: p.precio, controla_stock: p.controla_stock, stock_actual: p.stock_actual ?? '' }); };
  const ajustarStock = async (p: any) => {
    const stock = prompt(`Nuevo stock de ${p.nombre} (actual ${p.stock_actual})`); if (stock === null) return;
    const motivo = prompt('Motivo del ajuste'); if (motivo === null) return;
    try { await api.post(`/api/admin/productos/${p.id}/stock`, { stock: Number(stock), motivo }); }
    catch (err: any) { setError(err.message); }
  };
  const alternarActivo = async (p: any) => {
    try { await api.patch(`/api/admin/productos/${p.id}`, { activo: !p.activo }); } catch (err: any) { setError(err.message); }
  };
  const subirFoto = async (p: any, archivo: File | undefined) => {
    if (!archivo) return;
    try { await api.subirArchivo(`/api/admin/productos/${p.id}/foto`, 'foto', archivo); } catch (err: any) { setError(err.message); }
  };
  const nombreCat = (id: string) => categorias.find((c) => c.id === id)?.nombre ?? '';

  return (
    <div style="display:grid;gap:24px">
      <section class="tarjeta">
        <h2>Categorías</h2>
        <form onSubmit={crearCategoria} class="fila">
          <label>Nueva categoría<input value={nuevaCat} onInput={(e) => setNuevaCat((e.target as HTMLInputElement).value)} /></label>
          <button class="primario" type="submit" style="flex:0 0 auto">Agregar</button>
        </form>
        <p>{categorias.map((c) => <span key={c.id} class={`pill ${c.activa ? 'ok' : ''}`} style="margin-right:6px">{c.nombre}</span>)}</p>
      </section>

      <section class="tarjeta">
        <h2>{editandoId ? 'Editar producto' : 'Nuevo producto'}</h2>
        <form onSubmit={guardarProducto} style="display:grid;gap:12px">
          <div class="fila">
            <label>Categoría<select value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: (e.target as HTMLSelectElement).value })}>
              <option value="">Elige…</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
            <label>Nombre<input value={form.nombre} onInput={(e) => setForm({ ...form, nombre: (e.target as HTMLInputElement).value })} /></label>
            <label>Precio<input type="number" step="0.01" min="0" value={form.precio} onInput={(e) => setForm({ ...form, precio: (e.target as HTMLInputElement).value })} /></label>
          </div>
          <label>Descripción<input value={form.descripcion} onInput={(e) => setForm({ ...form, descripcion: (e.target as HTMLInputElement).value })} /></label>
          <div class="fila">
            <label style="display:flex;gap:8px;align-items:center;color:inherit"><input type="checkbox" style="width:auto;min-height:0" checked={form.controla_stock} onChange={(e) => setForm({ ...form, controla_stock: (e.target as HTMLInputElement).checked })} />Controla stock</label>
            {form.controla_stock && (!editandoId || !productos.find((p) => p.id === editandoId)?.controla_stock) &&
              <label>Stock inicial<input type="number" min="0" step="1" value={form.stock_actual} onInput={(e) => setForm({ ...form, stock_actual: (e.target as HTMLInputElement).value })} /></label>}
          </div>
          <Aviso tipo="error" texto={error} />
          <div class="fila" style="align-items:center">
            <button class="primario" type="submit" style="flex:0 0 auto">{editandoId ? 'Guardar cambios' : 'Crear producto'}</button>
            {editandoId && <button type="button" style="flex:0 0 auto" onClick={() => { setEditandoId(null); setForm(VACIO); }}>Cancelar</button>}
          </div>
        </form>
      </section>

      <section class="tarjeta">
        <h2>Productos</h2>
        <table><thead><tr><th>Foto</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Estado</th><th></th></tr></thead>
          <tbody>{productos.map((p) => (
            <tr key={p.id}>
              <td>{p.foto ? <img src={p.foto} alt="" style="width:40px;height:40px;object-fit:cover;border-radius:4px" /> : '—'}<br />
                <input type="file" accept="image/*" style="min-height:0;font-size:12px;width:120px" onChange={(e) => subirFoto(p, (e.target as HTMLInputElement).files?.[0])} /></td>
              <td>{p.nombre}</td><td>{nombreCat(p.categoria_id)}</td><td>{p.precio}</td>
              <td>{p.controla_stock ? <span>{p.stock_actual} <button onClick={() => ajustarStock(p)}>Ajustar</button></span> : <span class="pill">Sin control</span>}</td>
              <td><span class={`pill ${p.activo ? 'ok' : ''}`}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
              <td><button onClick={() => editar(p)}>Editar</button> <button onClick={() => alternarActivo(p)}>{p.activo ? 'Desactivar' : 'Activar'}</button></td>
            </tr>
          ))}</tbody></table>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Verificar tipos, build y pruebas**

Run: `npm run typecheck && npm run build && npm test`
Expected: sin errores de tipos; build correcto; todas las pruebas pasan.

- [ ] **Step 6: Verificación manual en el navegador**

1. `npm run dev`. Abrir `http://127.0.0.1:3000/admin`.
2. Pestaña Configuración: cambiar nombre del local a "Delicadas" y guardar. Esperado: aviso "Configuración guardada" y el título de la barra cambia sin recargar.
3. Pestaña Meseros: agregar "Carlos". Agregar "carlos" otra vez. Esperado: error "Ya existe un mesero con ese nombre".
4. Pestaña Menú: crear categoría "Cafés", producto "Capuchino" 2.50 sin stock; categoría "Sandwiches", producto "Sándwich de pollo" 4.50 con stock 12. Ajustar stock a 20 con motivo "Se hicieron más". Esperado: la tabla muestra 20.
5. En otra terminal: `curl -s http://127.0.0.1:3000/api/catalogo`. Esperado: JSON con ambas categorías y sus productos, stock 20.
6. Detener con Ctrl+C.

- [ ] **Step 7: Commit y push**

```bash
git add -A
git commit -m "Pantalla de admin: configuración, meseros y menú con stock y fotos"
git push origin main
```

---

## Cierre del plan 1

**Modelo:** `claude-sonnet-5`. **Motivo:** son comandos y actualizaciones de documentos ya definidos. **Skill:** `superpowers:verification-before-completion`. **Revisor:** `claude-fable-5-1` confirma que ESTADO.md y BITACORA.md reflejan la salida real.


- [ ] Ejecutar `npm run typecheck && npm run build && npm test` una última vez. Pegar la salida resumida en `docs/BITACORA.md` bajo la fecha de ejecución.
- [ ] Actualizar `docs/ESTADO.md`: "Plan 1 terminado" y siguiente paso: escribir el plan 2 (Operación) con modelo `claude-fable-5-1` y skill `superpowers:writing-plans`, entrada: la spec y este plan.
- [ ] `git add -A && git commit -m "Cierre del plan 1: cimientos listos" && git push origin main`.

## Self-review (hecho al escribir el plan)

- **Cobertura de spec para este plan:** sección 3.1 componentes (servidor, web, DB) → Tasks 1, 3, 6; 3.2 eventos → Task 3 y 6; 4.1 configuración y catálogo → Tasks 2, 4, 5; 4.2 a 4.4 tablas creadas en Task 2 (sin lógica aún, va en planes 2 y 3); 7.4 admin: menú, meseros, configuración → Task 7; clientes, reportes, respaldos, datos de ejemplo y logs quedan para planes 3 y 4. Lanzador Windows y PostgreSQL portátil: plan 4.
- **Consistencia de nombres:** `crearApp({ db })`, `app.bus.emitir`, `crearAppDePrueba`, `prepararBaseDePrueba`, `ajustarStock(db, id, { stock, motivo, origen })`, `obtenerCatalogo`, `useEstado`, `useEventos`, `api.get/post/patch/subirArchivo` se usan con la misma firma en todas las tareas.
- **Sin placeholders:** todas las tareas tienen código completo, comando y resultado esperado.
