# Plan de seguridad de acceso — Núcleo POS (fase 2, entre el plan 1 y el plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ninguna ruta de la API responda sin un aparato autorizado, sin una persona identificada con su PIN y sin que su rol lo permita; que el primer arranque cree al administrador desde la PC de caja; que un PIN de administrador perdido se pueda restablecer con acceso físico; y que todo cambio de precio quede registrado con quién y cuándo.

**Architecture:** Un único guardia en el hook `onRequest` de Fastify (`src/servidor/seguridad/guardia.ts`) aplica tres capas a todo `/api/*`: dispositivo autorizado (cookie `dispositivo`), sesión viva (cookie `sesion`) y rol. Cada ruta declara su acceso en `config.acceso`; una ruta bajo `/api/` sin declaración hace fallar el arranque. Los tokens viajan en cookies `HttpOnly` porque `EventSource` (`/api/eventos`) no puede mandar cabeceras propias, y en el servidor solo se guarda su huella SHA-256. El PIN se guarda con `scrypt` de `node:crypto`, sal por usuario. La tabla `mesero` pasa a ser `usuario` conservando sus filas. Las pantallas se envuelven en un componente `Acceso` que resuelve instalación, autorización del aparato y PIN antes de mostrar la pantalla, y que pone el teclado de PIN encima (sin desmontar la pantalla) cuando la sesión vence.

**Tech Stack:** Node.js 22+ (en esta Mac hay 24.19), TypeScript 5, Fastify 5, Drizzle ORM 0.45 + drizzle-kit 0.31, driver `postgres`, PostgreSQL 16 en Docker (`cafeteria-pg`, puerto 5433), Preact 10 + Vite 6, Vitest 3, tsx. **Sin dependencias nuevas**: cifrado y tokens con `node:crypto`, cookies leídas y escritas a mano (sin `@fastify/cookie`).

**Spec:** `docs/superpowers/specs/2026-09-17-seguridad-acceso-design.md` (aprobada por Dave el 2026-09-17). Leer también `CLAUDE.md` y `docs/APRENDIZAJES.md` (en especial las entradas del 2026-09-17: tipos antes que rangos, `exigirObjeto`/`exigirUuid`/`exigirMonto` compartidos, patrón único de edición, pruebas de "cuerpo que no es objeto" con `content-type: application/json`, pruebas de concurrencia que fallan con el código defectuoso, y PATCH sin campos que devuelve la fila sin escribir).

**Cuándo se ejecuta:** después del plan 1 (terminado el 2026-09-17, 85 pruebas en verde) y **antes** del plan 2 de operación. Al final hay una sección con los cambios que los planes 2 y 3 deben incorporar por este plan.

**Modelos y skills:** no hay modelo por defecto. Cada tarea indica abajo su modelo ejecutor, su skill, su revisor y su motivo. Resumen de este plan:

| Tarea | Modelo ejecutor | Skill principal | Revisor | Motivo resumido |
|---|---|---|---|---|
| Task 1 | `claude-fable-5-1` | `superpowers:test-driven-development` | `claude-fable-5-1` | Migración sobre una tabla con datos, en dos pasos que drizzle-kit no puede hacer solo; si algo difiere de lo esperado hay que decidir, no ejecutar a ciegas. |
| Task 2 | `claude-fable-5-1` | `superpowers:test-driven-development` | `claude-fable-5-1` | Cifrado del PIN y regla del último admin con bloqueo de filas (concurrencia). |
| Task 3 | `claude-fable-5-1` | `superpowers:test-driven-development` | `claude-fable-5-1` | Capa 1 del guardia y tokens de dispositivo: cualquier hueco deja la API abierta a la WiFi de los clientes. |
| Task 4 | `claude-fable-5-1` | `superpowers:test-driven-development` | `claude-fable-5-1` | Sesiones, bloqueo por intentos, capas 2 y 3 del guardia y la prueba de barrido; es el corazón de la seguridad. |
| Task 5 | `claude-fable-5-1` | `superpowers:test-driven-development` | `claude-fable-5-1` | Instalación inicial (carrera entre dos instalaciones) y restablecer PIN: ambos crean o cambian credenciales de administrador. |
| Task 6 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` | El plan trae el código, las pruebas y la verificación completos; el registro se escribe dentro de una transacción que ya existe. |
| Task 7 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` | Pantallas: el plan trae los componentes completos y la API ya está probada en las tareas 1 a 6; la tarea es transcribir, compilar y verificar en vivo. |

**Revisión de cada tarea:** el revisor usa `superpowers:requesting-code-review` con modelo `claude-fable-5-1`: primero revisa contra la spec (¿hace lo que el plan pide, ni más ni menos?), luego calidad del código, **con sondeo en vivo** (`app.inject` o `curl`) de los casos límite: tipo equivocado en cada campo, cuerpo que no es objeto, sin cuerpo, id mal formado, y en las tareas 3 a 5 peticiones desde una IP no local con y sin cookies. Si hay observaciones, el ejecutor las atiende con `superpowers:receiving-code-review` y se vuelve a revisar. La tarea solo se marca terminada cuando el revisor aprueba y `superpowers:verification-before-completion` confirma la salida del comando de verificación.

## Global Constraints

- Todo texto visible al usuario, nombres de tablas, columnas, rutas de API y mensajes de error en español, sin tildes en identificadores de código y base de datos.
- Montos `numeric(10,2)`. Ids `uuid`. Todas las tablas con `id`, `creado_en`, `actualizado_en` (helper `tiempos()` de `schema.ts`).
- Errores de API: cuerpo `{ "error": "mensaje en español" }` con HTTP 400 (dato inválido), 404 (no existe), 409 (regla de negocio). Este plan añade 401 (sin sesión / PIN incorrecto), 403 (dispositivo no autorizado / sin permiso / no es la PC de caja) y 429 (dispositivo bloqueado), que además llevan `codigo` para que la pantalla sepa qué hacer: `{ "error": "...", "codigo": "sin_sesion" }`. Los códigos son una lista cerrada: `dispositivo_no_autorizado`, `dispositivo_bloqueado`, `sin_sesion`, `pin_incorrecto`, `sin_permiso`, `solo_local`, `solicitud_caducada`.
- Toda validación de datos que llegan por HTTP: **tipo antes que rango**, con `exigirObjeto`/`exigirObjetoOpcional`/`exigirTexto`/`exigirBooleano`/`exigirUuid`/`exigirMonto` de `src/servidor/errores.ts` y el nuevo `exigirPin` de `src/servidor/seguridad/pin.ts`. Nunca `Number(v)`, `Boolean(v)` ni `String(v ?? '')`.
- Toda edición parcial sigue el patrón único del plan 1: transacción + `SELECT ... FOR UPDATE` + escribir solo los campos recibidos + si no hay campos, devolver la fila sin escribir.
- El PIN son exactamente 4 dígitos como **texto** (`"0123"` conserva el cero); nunca se devuelve en ninguna respuesta, ni en claro ni cifrado (`pin_hash` no sale del servidor).
- Los tokens (dispositivo y sesión) son 32 bytes aleatorios en hexadecimal (64 caracteres); en la base solo se guarda `sha256(token)`.
- Cookies: `dispositivo` y `sesion`, con `Path=/; HttpOnly; SameSite=Strict`, sin `Secure` (la red local va por HTTP; ver spec sección 11). `dispositivo` dura 400 días (tope de los navegadores), `sesion` 1 día; la vigencia real la decide el servidor.
- Las peticiones cuya IP de origen es `127.0.0.1`, `::1` o `::ffff:127.0.0.1` son la PC de caja: se saltan la capa 1 (dispositivo) y **solo** esa capa. Fastify no confía en `x-forwarded-for` (`trustProxy` queda en `false`), así que nadie puede fingir ser local desde la red.
- PostgreSQL en puerto **5433**, usuario `cafeteria`, contraseña `cafeteria`, base `cafeteria` (desarrollo) y `cafeteria_test` (pruebas). Antes de cada sesión de trabajo: `open -a OrbStack`, esperar a que `docker ps` responda, `docker start cafeteria-pg`.
- Servidor en puerto **3000**. Nunca SQLite. Sin dependencias npm nuevas.
- Commits en español. Cada tarea termina con commit y `git push origin main`. El ejecutor commitea solo los archivos de su tarea (`git add <archivos>`, no `git add -A`) por el aprendizaje del 2026-09-17.
- Las 85 pruebas del plan 1 deben seguir pasando al cerrar cada tarea (renombradas donde este plan lo indica), más las nuevas. `npm run typecheck` sin errores al cerrar cada tarea; `npm run build` al cerrar las tareas 2 y 7.
- Al terminar el plan: actualizar `docs/ESTADO.md`, `docs/BITACORA.md`, `docs/APRENDIZAJES.md` y `docs/fases/2-seguridad-de-acceso.md` (sección "Para probar").

## Prerrequisitos verificados el 2026-09-17 (al escribir este plan)

- `npx drizzle-kit --version` → drizzle-kit v0.31.10, drizzle-orm v0.45.2. **drizzle-kit pide confirmación interactiva cuando ve a la vez una tabla borrada y una creada** ("Is usuario table created or renamed from another table?") y, sin terminal interactiva, falla con `Interactive prompts require a TTY terminal`. Se comprobó en una copia aislada que **si en un `generate` solo hay tablas creadas y en otro solo tablas borradas, no pregunta nada**. Task 1 usa ese camino en dos pasos y edita a mano el SQL generado para que sea un `RENAME` en vez de `CREATE` + `DROP`.
- El migrador de Drizzle (`drizzle-orm/pg-core/dialect.js`) guarda en `drizzle.__drizzle_migrations (id serial, hash text, created_at bigint)` el `sha256` del contenido del archivo `.sql` y el `when` del `meta/_journal.json`, y aplica solo las migraciones con `when` mayor que el último `created_at` registrado, todas en una sola transacción. La prueba de migración de Task 1 reconstruye ese registro para partir del estado exacto del plan 1.
- `postgres.js` acepta una sentencia que es solo un comentario (`sql.unsafe('-- comentario')` devuelve 0 filas sin error) y `SELECT 1`.
- `app.inject()` de Fastify (light-my-request) acepta `remoteAddress` (por defecto `127.0.0.1`) y `cookies`. Los hooks `onRoute` de Fastify también reciben las rutas `HEAD` que Fastify crea sola para cada `GET`, con la misma `config` (`route.js`, `headOpts = { ...options }`).
- `node:crypto` `scryptSync('0000', sal de 16 bytes en cero, 32, { N: 16384, r: 8, p: 1 })` → `c3be8696f272cde38106ae21b68d53ad8b2cdc56866bb7facb76d0ab764104fd` (se usa como hash señuelo en Task 2).
- `npm test` hoy: 8 archivos, 85 pruebas en verde.

## File Structure

```
src/compartido/roles.ts                    tipo Rol y lista ROLES (servidor y web)
src/compartido/eventos.ts                  MODIFICAR: añade el evento 'dispositivos'
src/servidor/db/schema.ts                  MODIFICAR: usuario (era mesero), enums rol_usuario y estado_dispositivo,
                                           tablas dispositivo, sesion, intento_fallido, cambio_precio; pedido.usuario_id
src/servidor/db/migraciones/0004_seguridad_acceso.sql   generada y editada a mano (renombre + tablas + índices)
src/servidor/db/migraciones/0005_quitar_mesero.sql      generada y vaciada (solo alinea el snapshot)
src/servidor/errores.ts                    MODIFICAR: añade ErrorAcceso (401/403/429 con codigo)
src/servidor/app.ts                        MODIFICAR: guardia, rutas nuevas, /api/estado sin lista de meseros, errores con codigo
src/servidor/eventos.ts                    MODIFICAR: /api/eventos declara acceso SOLO_DISPOSITIVO
src/servidor/seguridad/pin.ts              exigirPin, cifrarPin, verificarPin, HASH_SENUELO
src/servidor/seguridad/tokens.ts           generarToken, huellaToken
src/servidor/seguridad/cookies.ts          leerCookies, cookieDispositivo, cookieSesion, cookieBorrada
src/servidor/seguridad/acceso.ts           tipo Acceso y constantes PUBLICO, SOLO_DISPOSITIVO, ADMIN, CAJA, TODOS
src/servidor/seguridad/guardia.ts          registrarGuardia(app): onRoute (registro + fallo si falta acceso) y onRequest (3 capas); esLocal, exigirLocal, usuarioDe
src/servidor/modulos/usuarios.ts           reemplaza meseros.ts: usuarios con rol y PIN, último admin, rutas /api/admin/usuarios
src/servidor/modulos/dispositivos.ts       solicitar, estado, listar, autorizar, revocar, caducidad, fallos y bloqueo
src/servidor/modulos/sesiones.ts           entrar con PIN, salir, tocar (expiración por rol), cerrar por rol, rutas /api/sesion
src/servidor/modulos/instalacion.ts        GET/POST /api/instalacion
src/servidor/modulos/precios.ts            registrarCambioPrecio (dentro de la transacción del precio), historial, ruta
src/servidor/modulos/catalogo.ts           MODIFICAR: editarProducto recibe usuarioId y registra el cambio de precio
src/servidor/restablecer-pin.ts            comando `npm run restablecer-pin`
package.json                               MODIFICAR: script restablecer-pin
src/web/api.ts                             MODIFICAR: ErrorApi con estado y codigo; reintento tras desbloquear; aviso de dispositivo revocado
src/web/eventos.ts                         MODIFICAR: Estado sin meseros
src/web/main.tsx                           MODIFICAR: envuelve cada app en <Acceso>
src/web/acceso/Acceso.tsx                  instalación → dispositivo → PIN → pantalla; capa de bloqueo; contexto useSesion
src/web/acceso/TecladoPin.tsx              lista de nombres + teclado numérico (pantalla completa o capa)
src/web/acceso/DispositivoNoAutorizado.tsx código de 4 dígitos en grande
src/web/acceso/Instalacion.tsx             primer arranque
src/web/acceso/BarraSesion.tsx             nombre de quien está dentro + botón Salir
src/web/admin/AppAdmin.tsx                 MODIFICAR: pestañas Configuración, Usuarios, Dispositivos, Menú; barra con Salir
src/web/admin/Usuarios.tsx                 reemplaza Meseros.tsx
src/web/admin/Dispositivos.tsx             pendientes, autorizados, intentos fallidos
src/web/admin/Menu.tsx                     MODIFICAR: historial de precios por producto
src/web/mesero/AppMesero.tsx, caja/AppCaja.tsx   MODIFICAR: barra con nombre y Salir
src/web/estilos.css                        MODIFICAR: teclado, capa de bloqueo, código grande
tests/ayuda/db.ts                          MODIFICAR: TABLAS con usuario y las 4 tablas nuevas
tests/ayuda/app.ts                         MODIFICAR (Task 4): crea admin de prueba y añade su cookie a cada inject
tests/ayuda/acceso.ts                      helpers: crearUsuarioDePrueba, abrirSesionDePrueba, autorizarDispositivoDePrueba, IP_REMOTA
tests/migracion-seguridad.test.ts          la migración conserva los meseros existentes
tests/usuarios.test.ts                     reemplaza meseros.test.ts
tests/dispositivos.test.ts, tests/guardia.test.ts, tests/sesiones.test.ts, tests/instalacion.test.ts, tests/precios.test.ts
```

---

### Task 1: Esquema y migración: `mesero` pasa a `usuario`, entran `dispositivo`, `sesion`, `intento_fallido` y `cambio_precio`
**Modelo ejecutor:** `claude-fable-5-1`. **Motivo:** la migración renombra una tabla con datos reales y se hace en dos `generate` cuya salida se edita a mano; si drizzle-kit produce algo distinto de lo esperado (por versión o por orden), hay que decidir, no copiar a ciegas.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.

**Files:**
- Modify: `src/servidor/db/schema.ts`
- Create: `src/servidor/db/migraciones/0004_seguridad_acceso.sql`, `src/servidor/db/migraciones/0005_quitar_mesero.sql` (y sus snapshots en `meta/`, generados), `src/compartido/roles.ts`, `tests/migracion-seguridad.test.ts`
- Modify (renombre mecánico, sin cambiar comportamiento): `src/servidor/modulos/meseros.ts`, `src/servidor/app.ts`, `tests/ayuda/db.ts`, `tests/esquema.test.ts`, `tests/app.test.ts`, `tests/meseros.test.ts`, `src/web/eventos.ts`

**Interfaces:**
- Produces: tablas Drizzle `usuario` (columnas `id, nombre, rol, pin_hash, activo, creado_en, actualizado_en`), `dispositivo`, `sesion`, `intentoFallido` (tabla `intento_fallido`), `cambioPrecio` (tabla `cambio_precio`); enums `rolUsuario` (`rol_usuario`) y `estadoDispositivo` (`estado_dispositivo`); `pedido.usuario_id`. Tipo `Rol = 'mesero' | 'caja' | 'admin'` y `ROLES` en `src/compartido/roles.ts`. Índice `usuario_nombre_activo_unico` (renombrado, mismo comportamiento). `/api/estado` deja de devolver `meseros`.
- Consumes: `tiempos()`, `id()`, `monto()` de `schema.ts`; `ejecutarMigraciones` de `migrar.ts`.

- [ ] **Step 1: Escribir la prueba de migración sobre una base con datos**

`tests/migracion-seguridad.test.ts`:
```ts
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Sql } from 'postgres';
import { crearDb } from '../src/servidor/db/conexion';
import { ejecutarMigraciones } from '../src/servidor/db/migrar';

const URL = process.env.DATABASE_URL_TEST ?? 'postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria_test';
const CARPETA = 'src/servidor/db/migraciones';
const ULTIMA_DEL_PLAN_1 = 3; // 0003_mesero_nombre_activo_unico

// Deja la base exactamente como quedó al terminar el plan 1: vacía el esquema,
// aplica a mano las migraciones 0000 a 0003 y registra en
// drizzle.__drizzle_migrations lo mismo que el migrador habría registrado
// (sha256 del archivo y el "when" del journal), para que ejecutarMigraciones
// aplique solo las migraciones nuevas, igual que en la PC de caja al
// actualizar el programa.
async function reconstruirBaseDelPlan1(sql: Sql) {
  await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA drizzle;');
  await sql.unsafe('CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)');
  const journal = JSON.parse(readFileSync(join(CARPETA, 'meta', '_journal.json'), 'utf8')) as { entries: { idx: number; when: number; tag: string }[] };
  for (const entrada of journal.entries.filter((e) => e.idx <= ULTIMA_DEL_PLAN_1)) {
    const contenido = readFileSync(join(CARPETA, `${entrada.tag}.sql`), 'utf8');
    for (const sentencia of contenido.split('--> statement-breakpoint')) await sql.unsafe(sentencia);
    const hash = createHash('sha256').update(contenido).digest('hex');
    await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${entrada.when})`;
  }
}

test('la migración conserva los meseros existentes como usuarios con rol mesero y sin PIN, y sus pedidos', async () => {
  const { db, sql } = crearDb(URL);
  try {
    await reconstruirBaseDelPlan1(sql);
    await sql`INSERT INTO mesero (nombre) VALUES ('Carlos'), ('Ana')`;
    await sql`INSERT INTO mesero (nombre, activo) VALUES ('Beto', false)`;
    await sql`INSERT INTO jornada (fondo_inicial) VALUES (10)`;
    const [j] = await sql`SELECT id FROM jornada`;
    const [carlos] = await sql`SELECT id FROM mesero WHERE nombre = 'Carlos'`;
    await sql`INSERT INTO pedido (jornada_id, numero_mesa, numero, mesero_id) VALUES (${j.id}, 1, 1, ${carlos.id})`;

    await ejecutarMigraciones(db);

    const usuarios = await sql`SELECT nombre, rol, pin_hash, activo FROM usuario ORDER BY nombre`;
    expect(usuarios).toEqual([
      { nombre: 'Ana', rol: 'mesero', pin_hash: null, activo: true },
      { nombre: 'Beto', rol: 'mesero', pin_hash: null, activo: false },
      { nombre: 'Carlos', rol: 'mesero', pin_hash: null, activo: true },
    ]);
    const [p] = await sql`SELECT usuario_id FROM pedido`;
    expect(p.usuario_id).toBe(carlos.id);

    const tablas = (await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`).map((f) => f.table_name);
    expect(tablas).not.toContain('mesero');
    for (const t of ['usuario', 'dispositivo', 'sesion', 'intento_fallido', 'cambio_precio']) expect(tablas).toContain(t);

    const columnasPedido = (await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'pedido'`).map((f) => f.column_name);
    expect(columnasPedido).toContain('usuario_id');
    expect(columnasPedido).not.toContain('mesero_id');

    const indices = (await sql`SELECT indexname FROM pg_indexes WHERE tablename = 'usuario'`).map((f) => f.indexname);
    expect(indices).toContain('usuario_nombre_activo_unico');
    expect(indices).not.toContain('mesero_nombre_activo_unico');
    // El índice conserva su comportamiento: nombre único entre activos, sin distinguir mayúsculas.
    await expect(sql`INSERT INTO usuario (nombre) VALUES ('carlos')`).rejects.toMatchObject({ code: '23505' });
    await sql`INSERT INTO usuario (nombre) VALUES ('beto')`; // Beto está inactivo: se permite

    // Volver a migrar no hace nada ni falla.
    await ejecutarMigraciones(db);
  } finally {
    await sql.end();
  }
});

test('los índices nuevos existen', async () => {
  const { db, sql } = crearDb(URL);
  try {
    await ejecutarMigraciones(db);
    const indices = (await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`).map((f) => f.indexname);
    for (const i of ['dispositivo_token_hash_unico', 'dispositivo_codigo_pendiente_unico', 'sesion_token_hash_unico', 'sesion_viva_por_usuario', 'intento_fallido_por_fecha', 'cambio_precio_por_producto']) {
      expect(indices).toContain(i);
    }
  } finally {
    await sql.end();
  }
});
```

- [ ] **Step 2: Ejecutar para ver que falla**

Run: `npm test -- tests/migracion-seguridad.test.ts`
Expected: FAIL. La primera prueba falla en `SELECT ... FROM usuario` con `relation "usuario" does not exist`; la segunda, en los índices que faltan.

- [ ] **Step 3: Crear `src/compartido/roles.ts`**

```ts
// Roles de usuario, compartidos entre servidor y web. Solo tipos y
// constantes: este archivo no puede importar nada de Node ni del navegador.
export type Rol = 'mesero' | 'caja' | 'admin';
export const ROLES: Rol[] = ['mesero', 'caja', 'admin'];

// Qué roles pueden abrir cada pantalla (spec 3.2). /cocina no lleva sesión.
export const ROLES_POR_PANTALLA: Record<'/admin' | '/caja' | '/mesero', Rol[]> = {
  '/admin': ['admin'],
  '/caja': ['caja', 'admin'],
  '/mesero': ['mesero', 'caja', 'admin'],
};
```

- [ ] **Step 4: Paso A del esquema: `usuario` y las tablas nuevas conviven con `mesero`**

En `src/servidor/db/schema.ts`, **sin quitar todavía `mesero` ni `pedido.mesero_id`**:

Después de la línea `export const estadoAbono = pgEnum(...)` añadir:
```ts
export const rolUsuario = pgEnum('rol_usuario', ['mesero', 'caja', 'admin']);
export const estadoDispositivo = pgEnum('estado_dispositivo', ['pendiente', 'autorizado', 'revocado']);
```

Justo debajo del bloque `export const mesero = pgTable('mesero', {...});` añadir:
```ts
export const usuario = pgTable('usuario', {
  id: id(),
  nombre: text('nombre').notNull(),
  rol: rolUsuario('rol').notNull().default('mesero'),
  // Nulo mientras no tenga PIN (los meseros que existían antes de la fase 2):
  // no aparece en la lista de entrada y no puede iniciar sesión.
  pin_hash: text('pin_hash'),
  activo: boolean('activo').notNull().default(true),
  ...tiempos(),
});

export const dispositivo = pgTable('dispositivo', {
  id: id(),
  nombre: text('nombre'),
  // 4 dígitos mientras está pendiente; se vacía al autorizar. Único entre
  // pendientes por el índice parcial dispositivo_codigo_pendiente_unico.
  codigo: text('codigo'),
  token_hash: text('token_hash').notNull(),
  estado: estadoDispositivo('estado').notNull().default('pendiente'),
  descripcion: text('descripcion').notNull().default(''),
  solicitado_en: timestamp('solicitado_en', { withTimezone: true }).notNull().defaultNow(),
  autorizado_en: timestamp('autorizado_en', { withTimezone: true }),
  autorizado_por: uuid('autorizado_por').references(() => usuario.id),
  ultimo_uso_en: timestamp('ultimo_uso_en', { withTimezone: true }),
  intentos_fallidos: integer('intentos_fallidos').notNull().default(0),
  bloqueado_hasta: timestamp('bloqueado_hasta', { withTimezone: true }),
  ...tiempos(),
});

export const sesion = pgTable('sesion', {
  id: id(),
  usuario_id: uuid('usuario_id').notNull().references(() => usuario.id),
  // Nulo cuando la sesión se abrió desde la PC de caja (127.0.0.1), que no
  // pasa por la lista blanca de dispositivos.
  dispositivo_id: uuid('dispositivo_id').references(() => dispositivo.id),
  token_hash: text('token_hash').notNull(),
  ultimo_uso_en: timestamp('ultimo_uso_en', { withTimezone: true }).notNull().defaultNow(),
  // Nulo para rol mesero (no expira por inactividad).
  expira_en: timestamp('expira_en', { withTimezone: true }),
  cerrada_en: timestamp('cerrada_en', { withTimezone: true }),
  ...tiempos(),
});

// "creada_en" de la spec 4.3 es creado_en de tiempos(); "ocurrido_en" de la
// spec 4.4 es creado_en de tiempos(). No se duplican columnas.
export const intentoFallido = pgTable('intento_fallido', {
  id: id(),
  // Nulo cuando el intento vino de la PC de caja.
  dispositivo_id: uuid('dispositivo_id').references(() => dispositivo.id),
  // Nulo cuando el usuario_id que se intentó no existe.
  usuario_id: uuid('usuario_id').references(() => usuario.id),
  ...tiempos(),
});
```

Justo debajo del bloque `export const producto = pgTable('producto', {...});` añadir:
```ts
export const cambioPrecio = pgTable('cambio_precio', {
  id: id(),
  producto_id: uuid('producto_id').notNull().references(() => producto.id),
  precio_anterior: monto('precio_anterior').notNull(),
  precio_nuevo: monto('precio_nuevo').notNull(),
  usuario_id: uuid('usuario_id').notNull().references(() => usuario.id),
  ...tiempos(),
});
```

En `pedido`, justo debajo de `mesero_id: uuid('mesero_id').references(() => mesero.id),` añadir:
```ts
  usuario_id: uuid('usuario_id').references(() => usuario.id),
```

Run: `npx drizzle-kit generate --name=seguridad_acceso < /dev/null`
Expected: termina con `[✓] Your SQL migration file ➜ src/servidor/db/migraciones/0004_seguridad_acceso.sql` **sin ninguna pregunta** (solo hay tablas y columnas creadas). Verificar: `grep -c 'CREATE TABLE "usuario"' src/servidor/db/migraciones/0004_seguridad_acceso.sql` → `1`, y `grep -c 'ADD COLUMN "usuario_id"' ...` → `1`. Si drizzle-kit pregunta algo o falla con "Interactive prompts require a TTY", es que en el esquema faltó dejar `mesero` o `pedido.mesero_id`: revisar el paso antes de seguir.

- [ ] **Step 5: Reemplazar el contenido de `0004_seguridad_acceso.sql` por el renombre escrito a mano**

Reemplazar **todo** el contenido del archivo generado por este (es el generado, con `CREATE TABLE "usuario"` cambiado por el renombre de `mesero`, `ADD COLUMN "usuario_id"` cambiado por el renombre de `mesero_id`, sin la clave foránea de `pedido` que ya existe renombrada, y con los índices al final):

```sql
-- Seguridad de acceso (spec 2026-09-17, sección 4). Generada con drizzle-kit
-- y editada a mano: la tabla mesero NO se crea de nuevo, se RENOMBRA a
-- usuario para conservar los meseros existentes, y pedido.mesero_id se
-- renombra a usuario_id. drizzle-kit habría preguntado "¿creada o
-- renombrada?" en una terminal interactiva, que un agente no tiene; por eso
-- el esquema se cambió en dos pasos (plan de seguridad, Task 1) y esta
-- migración lleva el renombre escrito a mano. La 0005 solo alinea el
-- snapshot de drizzle-kit.
CREATE TYPE "public"."estado_dispositivo" AS ENUM('pendiente', 'autorizado', 'revocado');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('mesero', 'caja', 'admin');--> statement-breakpoint
ALTER TABLE "mesero" RENAME TO "usuario";--> statement-breakpoint
ALTER TABLE "usuario" RENAME CONSTRAINT "mesero_pkey" TO "usuario_pkey";--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "rol" "rol_usuario" DEFAULT 'mesero' NOT NULL;--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "pin_hash" text;--> statement-breakpoint
ALTER INDEX "mesero_nombre_activo_unico" RENAME TO "usuario_nombre_activo_unico";--> statement-breakpoint
ALTER TABLE "pedido" RENAME COLUMN "mesero_id" TO "usuario_id";--> statement-breakpoint
ALTER TABLE "pedido" RENAME CONSTRAINT "pedido_mesero_id_mesero_id_fk" TO "pedido_usuario_id_usuario_id_fk";--> statement-breakpoint
CREATE TABLE "cambio_precio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producto_id" uuid NOT NULL,
	"precio_anterior" numeric(10, 2) NOT NULL,
	"precio_nuevo" numeric(10, 2) NOT NULL,
	"usuario_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispositivo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text,
	"codigo" text,
	"token_hash" text NOT NULL,
	"estado" "estado_dispositivo" DEFAULT 'pendiente' NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"solicitado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"autorizado_en" timestamp with time zone,
	"autorizado_por" uuid,
	"ultimo_uso_en" timestamp with time zone,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intento_fallido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispositivo_id" uuid,
	"usuario_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"token_hash" text NOT NULL,
	"ultimo_uso_en" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_en" timestamp with time zone,
	"cerrada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cambio_precio" ADD CONSTRAINT "cambio_precio_producto_id_producto_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."producto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cambio_precio" ADD CONSTRAINT "cambio_precio_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivo" ADD CONSTRAINT "dispositivo_autorizado_por_usuario_id_fk" FOREIGN KEY ("autorizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intento_fallido" ADD CONSTRAINT "intento_fallido_dispositivo_id_dispositivo_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intento_fallido" ADD CONSTRAINT "intento_fallido_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_dispositivo_id_dispositivo_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX dispositivo_token_hash_unico ON dispositivo (token_hash);--> statement-breakpoint
CREATE UNIQUE INDEX dispositivo_codigo_pendiente_unico ON dispositivo (codigo) WHERE estado = 'pendiente';--> statement-breakpoint
CREATE UNIQUE INDEX sesion_token_hash_unico ON sesion (token_hash);--> statement-breakpoint
CREATE INDEX sesion_viva_por_usuario ON sesion (usuario_id) WHERE cerrada_en IS NULL;--> statement-breakpoint
CREATE INDEX intento_fallido_por_fecha ON intento_fallido (creado_en);--> statement-breakpoint
CREATE INDEX cambio_precio_por_producto ON cambio_precio (producto_id, creado_en);
```

- [ ] **Step 6: Paso B del esquema: quitar `mesero` y `pedido.mesero_id`, generar y vaciar la 0005**

En `src/servidor/db/schema.ts`:
- Borrar el bloque completo `export const mesero = pgTable('mesero', {...});`.
- En `pedido`, borrar la línea `mesero_id: uuid('mesero_id').references(() => mesero.id),`.

Run: `npx drizzle-kit generate --name=quitar_mesero < /dev/null`
Expected: `[✓] Your SQL migration file ➜ src/servidor/db/migraciones/0005_quitar_mesero.sql`, sin preguntas (solo hay cosas borradas). El archivo contiene `DROP TABLE "mesero" CASCADE` y `DROP COLUMN "mesero_id"`.

Reemplazar **todo** el contenido de `0005_quitar_mesero.sql` por:
```sql
-- Generada por drizzle-kit al quitar mesero y pedido.mesero_id del esquema
-- (segundo paso del renombre de la fase 2). El DROP que generó se quitó a
-- propósito: la tabla y la columna ya fueron RENOMBRADAS en 0004, así que
-- aquí no hay nada que ejecutar. El archivo existe para que el snapshot de
-- drizzle-kit quede alineado con schema.ts y `npm run db:generar` vuelva a
-- partir de un estado limpio en los planes siguientes.
SELECT 1;
```

Run: `npx drizzle-kit generate < /dev/null`
Expected: `No schema changes, nothing to migrate 😴` (el snapshot 0005 coincide con `schema.ts`). No debe crear ningún archivo; si crea uno, borrarlo junto con su entrada en `_journal.json` y su snapshot y revisar el paso A o B.

- [ ] **Step 7: Renombre mecánico en el código y las pruebas que hoy usan `mesero`**

Cada archivo, exactamente qué cambia (nada más cambia; el comportamiento sigue igual):

`src/servidor/modulos/meseros.ts` (se reemplaza entero en Task 2; aquí solo se le cambia la tabla):
- Línea `import { mesero } from '../db/schema';` → `import { usuario } from '../db/schema';`
- Todas las apariciones de `mesero.` (la tabla: `mesero.id`, `mesero.nombre`, `mesero.activo`) → `usuario.`; `from(mesero)` → `from(usuario)`; `db.insert(mesero)` → `db.insert(usuario)`; `tx.update(mesero)` → `tx.update(usuario)`; `Partial<typeof mesero.$inferInsert>` → `Partial<typeof usuario.$inferInsert>`.
- En `traducirConflictoNombre`: `e.constraint_name === 'mesero_nombre_activo_unico'` → `'usuario_nombre_activo_unico'`.
- Los mensajes ('Ya existe un mesero con ese nombre', etc.) y las rutas `/api/admin/meseros` **no** cambian en esta tarea.

`src/servidor/app.ts`:
- `import { jornada, mesero } from './db/schema';` → `import { jornada } from './db/schema';`
- En `/api/estado`, borrar la línea `const meseros = await db.select().from(mesero).orderBy(mesero.nombre);` y la línea `meseros: meseros.filter((m) => m.activo),`. Motivo: la lista de nombres para entrar la da `GET /api/sesion/usuarios` (Task 4) y `/api/estado` será una ruta sin sesión (la usa la cocina); no debe llevar la tabla de usuarios, y menos `pin_hash`.

`src/web/eventos.ts`:
- `export type Estado = { configuracion: any; jornada: any | null; meseros: { id: string; nombre: string }[] };` → `export type Estado = { configuracion: any; jornada: any | null };`

`tests/ayuda/db.ts`:
- `TABLAS` pasa a: `['abono', 'encargo_item', 'encargo', 'pago', 'pedido_item', 'ronda', 'cuenta', 'egreso', 'pedido', 'movimiento_stock', 'jornada', 'cambio_precio', 'producto', 'categoria', 'cliente', 'intento_fallido', 'sesion', 'dispositivo', 'usuario', 'configuracion']`.

`tests/esquema.test.ts`:
- Prueba `'las 16 tablas existen'` → nombre `'las 20 tablas existen'` y la lista pasa a `['configuracion','usuario','dispositivo','sesion','intento_fallido','categoria','producto','cambio_precio','movimiento_stock','jornada','pedido','cuenta','ronda','pedido_item','pago','egreso','cliente','encargo','encargo_item','abono']`.

`tests/app.test.ts`:
- Borrar `import { mesero } from '../src/servidor/db/schema';`.
- Prueba `'GET /api/estado devuelve configuracion, jornada nula y meseros vacios'` → nombre `'GET /api/estado devuelve configuracion y jornada nula, sin lista de usuarios'`; la línea `expect(cuerpo.meseros).toEqual([]);` → `expect('meseros' in cuerpo).toBe(false);`.
- Borrar entera la prueba `'un mesero inactivo no aparece en /api/estado'`.

`tests/meseros.test.ts`:
- En `'crear, listar y desactivar meseros'`: borrar las dos últimas líneas (`const estado = ...` y `expect(estado.json().meseros).toHaveLength(0);`).
- Prueba `'el indice unico parcial de mesero activo existe en la base'`: la consulta pasa a `WHERE tablename = 'usuario' AND indexname = 'usuario_nombre_activo_unico'`.
- Prueba de carrera determinista: `FROM mesero WHERE id = ${id} FOR UPDATE` → `FROM usuario WHERE id = ${id} FOR UPDATE`; `UPDATE mesero SET nombre = 'Elena Pérez', ...` → `UPDATE usuario SET ...`; `SELECT nombre, activo FROM mesero WHERE id = ${id}` → `FROM usuario`.

- [ ] **Step 8: Ejecutar todo**

Run: `npm run typecheck && npm test`
Expected: sin errores de tipos; `Tests  86 passed` (85 − 1 borrada + 2 nuevas). Si `tests/migracion-seguridad.test.ts` corre antes que otro archivo, no importa: termina con la base migrada por completo (`fileParallelism: false`).

- [ ] **Step 9: Aplicar la migración a la base de desarrollo y comprobar los datos**

Run: `npm run db:migrar && docker exec cafeteria-pg psql -U cafeteria -d cafeteria -c "SELECT nombre, rol, pin_hash IS NULL AS sin_pin, activo FROM usuario ORDER BY nombre"`
Expected: `Migraciones aplicadas` y los meseros que existían en la base de desarrollo (por ejemplo "Carlos", creado en la verificación de la Tarea 7 del plan 1, si sigue ahí) con `rol = mesero` y `sin_pin = t`. Si la base de desarrollo no tiene meseros, la tabla sale vacía y también vale.

- [ ] **Step 10: Commit y push**

```bash
git add src/servidor/db/schema.ts src/servidor/db/migraciones src/compartido/roles.ts src/servidor/modulos/meseros.ts src/servidor/app.ts src/web/eventos.ts tests/ayuda/db.ts tests/esquema.test.ts tests/app.test.ts tests/meseros.test.ts tests/migracion-seguridad.test.ts
git commit -m "Esquema de seguridad: mesero pasa a usuario con rol y PIN; tablas dispositivo, sesion, intento_fallido y cambio_precio"
git push origin main
```

---

### Task 2: Módulo de usuarios con PIN cifrado (reemplaza `meseros.ts`) y pestaña Usuarios
**Modelo ejecutor:** `claude-fable-5-1`. **Motivo:** cifrado del PIN con `scrypt` y la regla del último administrador activo, que exige bloquear varias filas a la vez para que dos peticiones simultáneas no dejen el sistema sin admin. Es decisión y concurrencia, no transcripción.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`. Sondeo en vivo obligatorio: cada campo con tipo equivocado, PIN `1234` como número, `"123"`, `"12345"`, `"abcd"`, y comprobar que ninguna respuesta lleva `pin_hash`.

**Files:**
- Create: `src/servidor/seguridad/pin.ts`, `src/servidor/seguridad/acceso.ts`, `src/servidor/modulos/usuarios.ts`, `src/web/admin/Usuarios.tsx`, `tests/pin.test.ts`
- Rename: `tests/meseros.test.ts` → `tests/usuarios.test.ts` (`git mv`, contenido reescrito abajo)
- Delete: `src/servidor/modulos/meseros.ts`, `src/web/admin/Meseros.tsx`
- Modify: `src/servidor/app.ts` (import y registro de rutas), `src/web/admin/AppAdmin.tsx` (pestaña)

**Interfaces:**
- Consumes: tabla `usuario`, `Rol`/`ROLES` de Task 1; `exigirTexto`, `exigirBooleano`, `exigirUuid`, `exigirObjeto`, `exigirObjetoOpcional`, `ErrorNegocio`, `ErrorValidacion`, `NoEncontrado` de `errores.ts`.
- Produces:
  - `pin.ts`: `exigirPin(valor: unknown, mensaje?): string`, `cifrarPin(pin: string): Promise<string>` (formato `salHex:claveHex`), `verificarPin(pin: string, hash: string): Promise<boolean>`, `HASH_SENUELO: string`.
  - `acceso.ts`: `type Acceso`, constantes `PUBLICO`, `SOLO_DISPOSITIVO`, `ADMIN`, `CAJA`, `TODOS`; ampliación `FastifyContextConfig { acceso?: Acceso }`. En esta tarea solo se declaran; el guardia que las lee llega en Task 3 y Task 4.
  - `usuarios.ts`: `type Usuario`, `type UsuarioPublico = Omit<Usuario, 'pin_hash'> & { tiene_pin: boolean }`, `publico(u: Usuario): UsuarioPublico`, `listarUsuarios(db)`, `crearUsuario(db | tx, { nombre, rol, pin }): Promise<UsuarioPublico>`, `editarUsuario(db, id, { nombre?, rol?, activo? }): Promise<UsuarioPublico>`, `cambiarPin(db, id, { pin }): Promise<UsuarioPublico>`, `hayAdminActivo(db | tx): Promise<boolean>`, `restablecerPinAdmin(db, nombre, pin): Promise<UsuarioPublico>`, `exigirRol(valor): Rol`, `rutasUsuarios(app)`: `GET/POST /api/admin/usuarios`, `PATCH /api/admin/usuarios/:id`, `POST /api/admin/usuarios/:id/pin`.
- Reglas: nombre texto no vacío y único entre activos (409 "Ya existe un usuario con ese nombre"); `rol` uno de `mesero | caja | admin` (400); `pin` texto de exactamente 4 dígitos (400 "El PIN debe tener exactamente 4 dígitos"), obligatorio al crear; regla 27: no se puede desactivar ni cambiar de rol al último admin activo (409); ninguna respuesta lleva `pin_hash` ni `pin`.

- [ ] **Step 1: Escribir las pruebas del cifrado**

`tests/pin.test.ts`:
```ts
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
```

- [ ] **Step 2: Ejecutar para ver que falla**

Run: `npm test -- tests/pin.test.ts`
Expected: FAIL, no encuentra `src/servidor/seguridad/pin`.

- [ ] **Step 3: Escribir `pin.ts` y `acceso.ts`**

`src/servidor/seguridad/pin.ts`:
```ts
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

export async function verificarPin(pin: string, hash: string): Promise<boolean> {
  const [salHex, claveHex] = hash.split(':');
  if (!salHex || !claveHex || !/^[0-9a-f]+$/.test(salHex) || !/^[0-9a-f]+$/.test(claveHex)) return false;
  const esperado = Buffer.from(claveHex, 'hex');
  const clave = await scrypt(pin, Buffer.from(salHex, 'hex'), esperado.length, PARAMETROS);
  return clave.length === esperado.length && timingSafeEqual(clave, esperado);
}

// Hash de "0000" con sal fija (verificado el 2026-09-17 con scryptSync y estos
// mismos parámetros). Se usa SOLO para que verificar un PIN contra un usuario
// que no existe, está inactivo o no tiene PIN tarde lo mismo que contra uno
// real: así el tiempo de respuesta no delata si el usuario existe. El
// resultado de esa verificación se ignora siempre.
export const HASH_SENUELO = '00000000000000000000000000000000:c3be8696f272cde38106ae21b68d53ad8b2cdc56866bb7facb76d0ab764104fd';
```

`src/servidor/seguridad/acceso.ts`:
```ts
import type { Rol } from '../../compartido/roles';

// Lo que cada ruta de la API declara en config.acceso. El guardia (Task 3 y
// Task 4) lo lee en onRequest; una ruta bajo /api/ sin esta declaración hace
// fallar el arranque. Tres formas, y nada más:
//   - PUBLICO: ni dispositivo ni sesión (instalación y solicitud de aparato).
//   - SOLO_DISPOSITIVO: aparato autorizado, sin sesión (cocina, catálogo,
//     estado, eventos, lista de nombres para entrar y entrar con PIN).
//   - con roles: aparato autorizado + sesión viva + rol en la lista.
export type Acceso =
  | { dispositivo: false; sesion: false }
  | { dispositivo: true; sesion: false }
  | { dispositivo: true; sesion: true; roles: Rol[] };

export const PUBLICO: Acceso = { dispositivo: false, sesion: false };
export const SOLO_DISPOSITIVO: Acceso = { dispositivo: true, sesion: false };
export const ADMIN: Acceso = { dispositivo: true, sesion: true, roles: ['admin'] };
export const CAJA: Acceso = { dispositivo: true, sesion: true, roles: ['caja', 'admin'] };
export const TODOS: Acceso = { dispositivo: true, sesion: true, roles: ['mesero', 'caja', 'admin'] };

declare module 'fastify' {
  interface FastifyContextConfig {
    acceso?: Acceso;
  }
}
```

Run: `npm test -- tests/pin.test.ts`
Expected: 5 passed.

- [ ] **Step 4: Escribir las pruebas del módulo de usuarios**

`git mv tests/meseros.test.ts tests/usuarios.test.ts` y reemplazar su contenido por:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';
import { usuario } from '../src/servidor/db/schema';
import { verificarPin } from '../src/servidor/seguridad/pin';
import { restablecerPinAdmin } from '../src/servidor/modulos/usuarios';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

const RUTA = '/api/admin/usuarios';
const crear = (nombre: string, rol = 'mesero', pin: unknown = '1234') =>
  ctx.app.inject({ method: 'POST', url: RUTA, payload: { nombre, rol, pin } });

function sinDatosDelPin(cuerpo: unknown) {
  const texto = JSON.stringify(cuerpo);
  expect(texto).not.toContain('pin_hash');
  expect(texto).not.toMatch(/"pin"\s*:/);
}

test('crear, listar, editar y desactivar usuarios; nunca sale el PIN', async () => {
  const c = await crear('Carlos');
  expect(c.statusCode).toBe(201);
  expect(c.json()).toMatchObject({ nombre: 'Carlos', rol: 'mesero', activo: true, tiene_pin: true });
  sinDatosDelPin(c.json());
  const id = c.json().id;
  const dup = await crear('carlos');
  expect(dup.statusCode).toBe(409);
  expect(dup.json().error).toBe('Ya existe un usuario con ese nombre');
  const vacio = await crear('  ');
  expect(vacio.statusCode).toBe(400);
  const e = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { activo: false, rol: 'caja' } });
  expect(e.statusCode).toBe(200);
  expect(e.json()).toMatchObject({ activo: false, rol: 'caja' });
  sinDatosDelPin(e.json());
  const l = await ctx.app.inject({ method: 'GET', url: RUTA });
  expect(l.json()).toHaveLength(1);
  sinDatosDelPin(l.json());
});

test('el PIN es obligatorio al crear y debe ser texto de 4 dígitos', async () => {
  for (const malo of [undefined, 1234, '123', '12345', 'abcd', null]) {
    const r = await crear('Pin malo', 'mesero', malo);
    expect(r.statusCode, `pin ${String(malo)}`).toBe(400);
    expect(r.json().error).toBe('El PIN debe tener exactamente 4 dígitos');
  }
});

test('el rol se valida por tipo y por lista', async () => {
  for (const malo of ['jefe', 7, null, true, {}]) {
    const r = await ctx.app.inject({ method: 'POST', url: RUTA, payload: { nombre: 'Rol malo', rol: malo, pin: '1234' } });
    expect(r.statusCode, `rol ${String(malo)}`).toBe(400);
    expect(r.json().error).toBe('El rol debe ser mesero, caja o admin');
  }
  const sinRol = await ctx.app.inject({ method: 'POST', url: RUTA, payload: { nombre: 'Sin rol', pin: '1234' } });
  expect(sinRol.statusCode).toBe(400);
});

test('un usuario migrado sin PIN se lista con tiene_pin false y sin pin_hash', async () => {
  const [u] = await ctx.db.insert(usuario).values({ nombre: 'Migrado', rol: 'mesero' }).returning();
  const l = await ctx.app.inject({ method: 'GET', url: RUTA });
  const fila = l.json().find((x: { id: string }) => x.id === u.id);
  expect(fila.tiene_pin).toBe(false);
  expect('pin_hash' in fila).toBe(false);
});

test('cambiar PIN: guarda un hash nuevo que verifica, y valida id y pin', async () => {
  const c = await crear('Dora');
  const id = c.json().id;
  const r = await ctx.app.inject({ method: 'POST', url: `${RUTA}/${id}/pin`, payload: { pin: '4321' } });
  expect(r.statusCode).toBe(200);
  expect(r.json().tiene_pin).toBe(true);
  sinDatosDelPin(r.json());
  const [fila] = await ctx.sql`SELECT pin_hash FROM usuario WHERE id = ${id}`;
  expect(await verificarPin('4321', fila.pin_hash)).toBe(true);
  expect(await verificarPin('1234', fila.pin_hash)).toBe(false);
  const malo = await ctx.app.inject({ method: 'POST', url: `${RUTA}/${id}/pin`, payload: { pin: 4321 } });
  expect(malo.statusCode).toBe(400);
  const noExiste = await ctx.app.inject({ method: 'POST', url: `${RUTA}/00000000-0000-0000-0000-000000000000/pin`, payload: { pin: '4321' } });
  expect(noExiste.statusCode).toBe(404);
  const idMalo = await ctx.app.inject({ method: 'POST', url: `${RUTA}/no-es-un-uuid/pin`, payload: { pin: '4321' } });
  expect(idMalo.statusCode).toBe(400);
  const sinCuerpo = await ctx.app.inject({ method: 'POST', url: `${RUTA}/${id}/pin` });
  expect(sinCuerpo.statusCode).toBe(400);
});

test('cambiar el PIN cierra al instante las sesiones abiertas de ese usuario y no las de otros (decisión de Dave, 2026-09-17)', async () => {
  const a = (await crear('Sesionada')).json().id;
  const b = (await crear('Ajena')).json().id;
  // La tabla `sesion` existe desde Task 1; `abrirSesion` llega en Task 4, así
  // que aquí se insertan las filas a mano.
  await ctx.sql`INSERT INTO sesion (usuario_id, token_hash) VALUES (${a}, 'huella-a'), (${b}, 'huella-b')`;
  const r = await ctx.app.inject({ method: 'POST', url: `${RUTA}/${a}/pin`, payload: { pin: '4321' } });
  expect(r.statusCode).toBe(200);
  const [suya] = await ctx.sql`SELECT cerrada_en FROM sesion WHERE token_hash = 'huella-a'`;
  const [ajena] = await ctx.sql`SELECT cerrada_en FROM sesion WHERE token_hash = 'huella-b'`;
  expect(suya.cerrada_en).not.toBeNull();
  expect(ajena.cerrada_en).toBeNull();
});

test('dos usuarios pueden tener el mismo PIN', async () => {
  const a = await crear('Mismo uno', 'mesero', '7777');
  const b = await crear('Mismo dos', 'caja', '7777');
  expect(a.statusCode).toBe(201);
  expect(b.statusCode).toBe(201);
});

test('PATCH de usuario inexistente responde 404', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/00000000-0000-0000-0000-000000000000`, payload: { activo: true } });
  expect(r.statusCode).toBe(404);
});

test('PATCH con identificador mal formado responde 400', async () => {
  const r = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/no-es-un-uuid`, payload: { activo: true } });
  expect(r.statusCode).toBe(400);
  expect(r.json().error).toBe('El identificador del usuario no es válido');
});

test('reactivar un usuario no puede duplicar el nombre de otro usuario activo', async () => {
  const primero = await crear('Ana');
  const idPrimero = primero.json().id;
  await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${idPrimero}`, payload: { activo: false } });
  const segundo = await crear('ana');
  expect(segundo.statusCode).toBe(201);
  const reactivar = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${idPrimero}`, payload: { activo: true } });
  expect(reactivar.statusCode).toBe(409);
  expect(reactivar.json().error).toBe('Ya existe un usuario con ese nombre');
});

test('el campo activo con tipo incorrecto se rechaza con 400 y no se guarda mal', async () => {
  const c = await crear('Beto');
  const id = c.json().id;
  const r = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { activo: 'false' } });
  expect(r.statusCode).toBe(400);
  const g = await ctx.app.inject({ method: 'GET', url: RUTA });
  expect(g.json().find((m: { id: string }) => m.id === id).activo).toBe(true);
});

test('el nombre con tipo incorrecto se rechaza con 400 al crear y al editar', async () => {
  const crearNumero = await ctx.app.inject({ method: 'POST', url: RUTA, payload: { nombre: 7, rol: 'mesero', pin: '1234' } });
  expect(crearNumero.statusCode).toBe(400);
  const crearObjeto = await ctx.app.inject({ method: 'POST', url: RUTA, payload: { nombre: {}, rol: 'mesero', pin: '1234' } });
  expect(crearObjeto.statusCode).toBe(400);
  const c = await crear('Cami');
  const id = c.json().id;
  const editar = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { nombre: 7 } });
  expect(editar.statusCode).toBe(400);
});

test('POST con un cuerpo que no es un objeto responde 400, no 500', async () => {
  const r = await ctx.app.inject({ method: 'POST', url: RUTA, headers: { 'content-type': 'application/json' }, payload: '"texto"' });
  expect(r.statusCode).toBe(400);
});

test('POST sin cuerpo responde 400 por falta de nombre, no 500', async () => {
  const r = await ctx.app.inject({ method: 'POST', url: RUTA });
  expect(r.statusCode).toBe(400);
});

test('el indice unico parcial de usuario activo existe en la base', async () => {
  const filas = await ctx.sql`SELECT indexname FROM pg_indexes WHERE tablename = 'usuario' AND indexname = 'usuario_nombre_activo_unico'`;
  expect(filas).toHaveLength(1);
});

test('crear dos usuarios con el mismo nombre en paralelo solo deja uno activo', async () => {
  const [a, b] = await Promise.all([crear('Diego'), crear('diego')]);
  expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
});

test('carrera determinista: un renombre confirmado mientras un PATCH {activo:false} espera el bloqueo de la fila no se pierde', async () => {
  const c = await crear('Elena');
  const id = c.json().id;
  let patchPromise: Promise<{ statusCode: number; json: () => any }> | null = null;
  await ctx.sql.begin(async (tx) => {
    await tx`SELECT id FROM usuario WHERE id = ${id} FOR UPDATE`;
    patchPromise = Promise.resolve(ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { activo: false } }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    await tx`UPDATE usuario SET nombre = 'Elena Pérez', actualizado_en = now() WHERE id = ${id}`;
  });
  const r = await patchPromise!;
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ nombre: 'Elena Pérez', activo: false });
});

test('PATCH mueve actualizado_en sin que el módulo lo escriba a mano', async () => {
  const c = await crear('Fabián');
  const id = c.json().id;
  const antes = new Date(c.json().actualizado_en).getTime();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const r = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { nombre: 'Fabián R.' } });
  expect(new Date(r.json().actualizado_en).getTime()).toBeGreaterThan(antes);
});

test('PATCH sin cuerpo responde 200 con el usuario sin cambios', async () => {
  const c = await crear('Gloria');
  const r = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${c.json().id}` });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ nombre: 'Gloria', activo: true });
});

// --- Regla 27: último administrador activo ---

test('el único admin activo no se puede desactivar ni cambiar de rol', async () => {
  const a = await crear('Admin uno', 'admin');
  expect(a.statusCode).toBe(201);
  const id = a.json().id;
  const desactivar = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { activo: false } });
  expect(desactivar.statusCode).toBe(409);
  expect(desactivar.json().error).toBe('No se puede desactivar ni cambiar de rol al último administrador activo');
  const cambiarRol = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { rol: 'caja' } });
  expect(cambiarRol.statusCode).toBe(409);
  // Renombrarlo sí se puede: sigue siendo admin activo.
  const renombrar = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { nombre: 'Admin principal' } });
  expect(renombrar.statusCode).toBe(200);
  // Con un segundo admin, el primero ya se puede desactivar; el segundo entonces no.
  const b = await crear('Admin dos', 'admin');
  const desactivarA = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { activo: false } });
  expect(desactivarA.statusCode).toBe(200);
  const desactivarB = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${b.json().id}`, payload: { activo: false } });
  expect(desactivarB.statusCode).toBe(409);
  // Reactivar al primero deja dos otra vez.
  const reactivarA = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { activo: true } });
  expect(reactivarA.statusCode).toBe(200);
});

test('carrera determinista: dos desactivaciones simultáneas de los dos únicos admins dejan al menos uno activo', async () => {
  // Estado de partida: exactamente dos admins activos (los de la prueba anterior).
  const lista = (await ctx.app.inject({ method: 'GET', url: RUTA })).json() as { id: string; rol: string; activo: boolean }[];
  const admins = lista.filter((u) => u.rol === 'admin' && u.activo);
  expect(admins).toHaveLength(2);
  const [a, b] = admins;

  // Una transacción externa toma el bloqueo de la fila de B, se lanza el PATCH
  // que desactiva a A sin esperarlo, se desactiva a B dentro de la transacción
  // externa y se confirma. Con el código correcto, el PATCH bloquea a TODOS
  // los admins activos (incluido B) y espera; al retomar vuelve a leer, ve que
  // B ya no está activo y responde 409. Con un código que solo contara admins
  // sin bloquearlos, el PATCH leería "2 activos" de inmediato y desactivaría a
  // A: el sistema quedaría sin admin. Esta prueba debe fallar con ese código.
  let patchPromise: Promise<{ statusCode: number; json: () => any }> | null = null;
  await ctx.sql.begin(async (tx) => {
    await tx`SELECT id FROM usuario WHERE id = ${b.id} FOR UPDATE`;
    patchPromise = Promise.resolve(ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${a.id}`, payload: { activo: false } }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    await tx`UPDATE usuario SET activo = false, actualizado_en = now() WHERE id = ${b.id}`;
  });
  const r = await patchPromise!;
  expect(r.statusCode).toBe(409);
  const [filaA] = await ctx.sql`SELECT activo FROM usuario WHERE id = ${a.id}`;
  expect(filaA.activo).toBe(true);
  // Dejar dos admins activos otra vez para no afectar otras pruebas.
  await ctx.sql`UPDATE usuario SET activo = true WHERE id = ${b.id}`;
});

test('restablecerPinAdmin escribe el PIN del admin activo por nombre, sin distinguir mayúsculas', async () => {
  const u = await restablecerPinAdmin(ctx.db, 'admin principal', '5555');
  expect(u.rol).toBe('admin');
  sinDatosDelPin(u);
  const [fila] = await ctx.sql`SELECT pin_hash FROM usuario WHERE id = ${u.id}`;
  expect(await verificarPin('5555', fila.pin_hash)).toBe(true);
  await expect(restablecerPinAdmin(ctx.db, 'Nadie', '5555')).rejects.toThrow('No hay un administrador activo llamado "Nadie"');
  await expect(restablecerPinAdmin(ctx.db, 'Carlos', '5555')).rejects.toThrow('No hay un administrador activo llamado "Carlos"'); // es mesero
  await expect(restablecerPinAdmin(ctx.db, 'admin principal', '55')).rejects.toThrow('El PIN debe tener exactamente 4 dígitos');
});
```

- [ ] **Step 5: Ejecutar para ver que falla**

Run: `npm test -- tests/usuarios.test.ts`
Expected: FAIL: no encuentra `src/servidor/modulos/usuarios` (y `/api/admin/usuarios` responde 404).

- [ ] **Step 6: Escribir `usuarios.ts` y borrar `meseros.ts`**

`src/servidor/modulos/usuarios.ts`:
```ts
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, Tx } from '../db/conexion';
import { sesion, usuario } from '../db/schema';
import { ErrorNegocio, ErrorValidacion, NoEncontrado, exigirBooleano, exigirObjeto, exigirObjetoOpcional, exigirTexto, exigirUuid } from '../errores';
import { ROLES, type Rol } from '../../compartido/roles';
import { cifrarPin, exigirPin } from '../seguridad/pin';
import { ADMIN } from '../seguridad/acceso';

export type Usuario = typeof usuario.$inferSelect;
// Lo único que sale del servidor. pin_hash no sale nunca; tiene_pin es lo
// único que la pantalla necesita saber del PIN (para mostrar "Sin PIN").
export type UsuarioPublico = Omit<Usuario, 'pin_hash'> & { tiene_pin: boolean };

export function publico(u: Usuario): UsuarioPublico {
  const { pin_hash, ...resto } = u;
  return { ...resto, tiene_pin: pin_hash !== null };
}

export async function listarUsuarios(db: Db): Promise<UsuarioPublico[]> {
  const filas = await db.select().from(usuario).orderBy(asc(usuario.nombre));
  return filas.map(publico);
}

// Comprueba en la aplicacion que ningun otro usuario activo tenga el mismo
// nombre (sin distinguir mayusculas). El indice unico parcial
// usuario_nombre_activo_unico es la garantia real contra dos peticiones
// simultaneas; traducirConflictoNombre() convierte su violacion en 409.
async function verificarNombreUnico(db: Db | Tx, nombre: string, exceptoId?: string) {
  const [dup] = await db.select({ id: usuario.id }).from(usuario)
    .where(sql`lower(${usuario.nombre}) = lower(${nombre}) AND ${usuario.activo} = true ${exceptoId ? sql`AND ${usuario.id} <> ${exceptoId}` : sql``}`);
  if (dup) throw new ErrorNegocio('Ya existe un usuario con ese nombre');
}

function limpiarNombre(valor: unknown): string {
  return exigirTexto(valor, 'El nombre del usuario debe ser texto', 'El nombre del usuario no puede estar vacío');
}

export function exigirRol(valor: unknown, mensaje = 'El rol debe ser mesero, caja o admin'): Rol {
  if (typeof valor !== 'string' || !(ROLES as string[]).includes(valor)) throw new ErrorValidacion(mensaje);
  return valor as Rol;
}

function traducirConflictoNombre(err: unknown): unknown {
  const e = err as { code?: string; constraint_name?: string } | null;
  if (e && e.code === '23505' && e.constraint_name === 'usuario_nombre_activo_unico') {
    return new ErrorNegocio('Ya existe un usuario con ese nombre');
  }
  return err;
}

export async function hayAdminActivo(db: Db | Tx): Promise<boolean> {
  const [fila] = await db.select({ id: usuario.id }).from(usuario)
    .where(and(eq(usuario.rol, 'admin'), eq(usuario.activo, true))).limit(1);
  return fila !== undefined;
}

// Recibe Db | Tx porque la instalación inicial (Task 5) lo llama dentro de
// su propia transacción.
export async function crearUsuario(db: Db | Tx, datos: { nombre?: unknown; rol?: unknown; pin?: unknown }): Promise<UsuarioPublico> {
  const nombre = limpiarNombre(datos.nombre);
  const rol = exigirRol(datos.rol);
  const pin = exigirPin(datos.pin);
  await verificarNombreUnico(db, nombre);
  const pin_hash = await cifrarPin(pin);
  try {
    const [u] = await db.insert(usuario).values({ nombre, rol, pin_hash }).returning();
    return publico(u);
  } catch (err) {
    throw traducirConflictoNombre(err);
  }
}

export async function editarUsuario(db: Db, id: string, datos: { nombre?: unknown; rol?: unknown; activo?: unknown }): Promise<UsuarioPublico> {
  exigirUuid(id, 'El identificador del usuario no es válido');

  const cambios: Partial<typeof usuario.$inferInsert> = {};
  if (datos.nombre !== undefined) cambios.nombre = limpiarNombre(datos.nombre);
  if (datos.rol !== undefined) cambios.rol = exigirRol(datos.rol);
  if (datos.activo !== undefined) cambios.activo = exigirBooleano(datos.activo, 'El estado activo del usuario debe ser verdadero o falso');

  // Patrón único de edición (el mismo que editarProducto y editarCategoria):
  // fila leída con SELECT ... FOR UPDATE dentro de la transacción que la
  // escribe, y solo los campos recibidos.
  return db.transaction(async (tx) => {
    // Regla 27: para saber si este es el último admin activo hay que bloquear
    // a TODOS los admins activos, no solo la fila editada. Si dos peticiones
    // desactivan a la vez a los dos únicos admins, cada una contaría al otro
    // como vigente y las dos pasarían: el sistema quedaría sin admin. Con
    // FOR UPDATE sobre todos (en orden fijo de id para que dos ediciones
    // simultáneas no se bloqueen mutuamente), la segunda espera a la primera
    // y, al retomar, vuelve a leer las filas ya confirmadas.
    const adminsActivos = await tx.select({ id: usuario.id }).from(usuario)
      .where(and(eq(usuario.rol, 'admin'), eq(usuario.activo, true)))
      .orderBy(asc(usuario.id))
      .for('update');
    const [existente] = await tx.select().from(usuario).where(eq(usuario.id, id)).for('update');
    if (!existente) throw new NoEncontrado('El usuario no existe');

    const nombreFinal = cambios.nombre ?? existente.nombre;
    const rolFinal = cambios.rol ?? existente.rol;
    const activoFinal = cambios.activo ?? existente.activo;
    const eraAdminActivo = existente.rol === 'admin' && existente.activo;
    const sigueAdminActivo = rolFinal === 'admin' && activoFinal;
    const otrosAdmins = adminsActivos.filter((a) => a.id !== id).length;
    if (eraAdminActivo && !sigueAdminActivo && otrosAdmins === 0) {
      throw new ErrorNegocio('No se puede desactivar ni cambiar de rol al último administrador activo');
    }
    if (activoFinal) await verificarNombreUnico(tx, nombreFinal, id);
    if (Object.keys(cambios).length === 0) return publico(existente);

    try {
      const [u] = await tx.update(usuario).set(cambios).where(eq(usuario.id, id)).returning();
      return publico(u);
    } catch (err) {
      throw traducirConflictoNombre(err);
    }
  });
}

// Decisión de Dave del 2026-09-17: cambiarle el PIN a alguien lo saca al
// instante de donde tenga abierto. Es lo que se espera al cambiar una clave, y
// permite cortar de verdad si se sospecha que otro la conoce. Va en la misma
// transacción que el PIN nuevo: no puede quedar el PIN cambiado con la sesión
// viva. No importa `sesiones.ts` (Task 4) para no crear dependencia hacia
// atrás; la tabla `sesion` existe desde Task 1.
export async function cambiarPin(db: Db, id: string, datos: { pin?: unknown }): Promise<UsuarioPublico> {
  exigirUuid(id, 'El identificador del usuario no es válido');
  const pin = exigirPin(datos.pin);
  const pin_hash = await cifrarPin(pin);
  return db.transaction(async (tx) => {
    const [u] = await tx.update(usuario).set({ pin_hash }).where(eq(usuario.id, id)).returning();
    if (!u) throw new NoEncontrado('El usuario no existe');
    await tx.update(sesion).set({ cerrada_en: new Date() })
      .where(and(eq(sesion.usuario_id, id), isNull(sesion.cerrada_en)));
    return publico(u);
  });
}

// Recuperación con acceso físico (spec 5.5). Busca al administrador activo
// por nombre sin distinguir mayúsculas y le escribe el PIN. La llama solo el
// comando restablecer-pin (Task 5): a propósito NO tiene ruta HTTP.
export async function restablecerPinAdmin(db: Db, nombre: unknown, pin: unknown): Promise<UsuarioPublico> {
  const limpio = limpiarNombre(nombre);
  const pinLimpio = exigirPin(pin);
  const [admin] = await db.select().from(usuario)
    .where(sql`lower(${usuario.nombre}) = lower(${limpio}) AND ${usuario.rol} = 'admin' AND ${usuario.activo} = true`);
  if (!admin) throw new NoEncontrado(`No hay un administrador activo llamado "${limpio}"`);
  return cambiarPin(db, admin.id, { pin: pinLimpio });
}

export function rutasUsuarios(app: FastifyInstance) {
  app.get('/api/admin/usuarios', { config: { acceso: ADMIN } }, async () => listarUsuarios(app.db));
  app.post('/api/admin/usuarios', { config: { acceso: ADMIN } }, async (req, reply) => {
    // Un cuerpo ausente vale como objeto vacío: limpiarNombre lo rechaza
    // después con el mensaje del nombre, no con uno genérico de cuerpo.
    const datos = exigirObjetoOpcional(req.body);
    const u = await crearUsuario(app.db, datos);
    app.bus.emitir('config');
    return reply.status(201).send(u);
  });
  app.patch<{ Params: { id: string } }>('/api/admin/usuarios/:id', { config: { acceso: ADMIN } }, async (req) => {
    const datos = exigirObjetoOpcional(req.body);
    const u = await editarUsuario(app.db, req.params.id, datos);
    app.bus.emitir('config');
    return u;
  });
  app.post<{ Params: { id: string } }>('/api/admin/usuarios/:id/pin', { config: { acceso: ADMIN } }, async (req) => {
    const datos = exigirObjeto(req.body);
    return cambiarPin(app.db, req.params.id, datos);
  });
}
```

`git rm src/servidor/modulos/meseros.ts`.

En `src/servidor/app.ts`: `import { rutasMeseros } from './modulos/meseros';` → `import { rutasUsuarios } from './modulos/usuarios';` y `rutasMeseros(app);` → `rutasUsuarios(app);`.

- [ ] **Step 7: Ejecutar las pruebas del servidor**

Run: `npm run typecheck && npm test`
Expected: sin errores de tipos; `Tests  99 passed` (86 de Task 1, menos las 13 de `meseros.test.ts`, más 5 de `pin.test.ts` y 21 de `usuarios.test.ts`). Lo que importa: **0 failed**.

- [ ] **Step 8: Pestaña Usuarios en admin (reemplaza Meseros.tsx)**

`git rm src/web/admin/Meseros.tsx`. Crear `src/web/admin/Usuarios.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { Aviso } from '../componentes/Aviso';
import { ROLES, type Rol } from '../../compartido/roles';

const NOMBRE_ROL: Record<Rol, string> = { mesero: 'Mesero', caja: 'Caja', admin: 'Administrador' };
const VACIO = { nombre: '', rol: 'mesero' as Rol, pin: '' };

export function Usuarios() {
  const [lista, setLista] = useState<any[]>([]);
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState<string | null>(null);
  const cargar = () => api.get('/api/admin/usuarios').then(setLista).catch((e: any) => setError(e.message));
  useEffect(() => { cargar(); }, []);
  useEventos(['config'], () => cargar());

  const crear = async (e: Event) => {
    e.preventDefault(); setError(null);
    // El PIN viaja como texto: "0123" conserva el cero. El servidor exige 4 dígitos.
    try { await api.post('/api/admin/usuarios', { nombre: form.nombre, rol: form.rol, pin: form.pin }); setForm(VACIO); await cargar(); }
    catch (err: any) { setError(err.message); }
  };
  const alternar = async (u: any) => {
    setError(null);
    try { await api.patch(`/api/admin/usuarios/${u.id}`, { activo: !u.activo }); await cargar(); }
    catch (err: any) { setError(err.message); }
  };
  const cambiarRol = async (u: any, rol: string) => {
    setError(null);
    try { await api.patch(`/api/admin/usuarios/${u.id}`, { rol }); await cargar(); }
    catch (err: any) { setError(err.message); await cargar(); }
  };
  const cambiarPin = async (u: any) => {
    setError(null);
    const pin = prompt(`Nuevo PIN de ${u.nombre} (4 dígitos)`); if (pin === null) return;
    try { await api.post(`/api/admin/usuarios/${u.id}/pin`, { pin: pin.trim() }); await cargar(); }
    catch (err: any) { setError(err.message); }
  };

  return (
    <div>
      <form onSubmit={crear} class="fila">
        <label>Nombre<input value={form.nombre} onInput={(e) => setForm({ ...form, nombre: (e.target as HTMLInputElement).value })} /></label>
        <label>Rol<select value={form.rol} onChange={(e) => setForm({ ...form, rol: (e.target as HTMLSelectElement).value as Rol })}>
          {ROLES.map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}</select></label>
        <label>PIN (4 dígitos)<input type="password" inputMode="numeric" maxLength={4} value={form.pin} onInput={(e) => setForm({ ...form, pin: (e.target as HTMLInputElement).value })} /></label>
        <button class="primario" type="submit" style="flex:0 0 auto">Agregar</button>
      </form>
      <Aviso tipo="error" texto={error} />
      <table><thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>PIN</th><th></th></tr></thead>
        <tbody>{lista.map((u) => (
          <tr key={u.id}>
            <td>{u.nombre}</td>
            <td><select value={u.rol} onChange={(e) => cambiarRol(u, (e.target as HTMLSelectElement).value)}>
              {ROLES.map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}</select></td>
            <td><span class={`pill ${u.activo ? 'ok' : ''}`}>{u.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td>{u.tiene_pin ? <span class="pill ok">Con PIN</span> : <span class="pill alerta">Sin PIN</span>} <button onClick={() => cambiarPin(u)}>Cambiar PIN</button></td>
            <td><button onClick={() => alternar(u)}>{u.activo ? 'Desactivar' : 'Activar'}</button></td>
          </tr>
        ))}</tbody></table>
    </div>
  );
}
```

En `src/web/admin/AppAdmin.tsx`:
- `import { Meseros } from './Meseros';` → `import { Usuarios } from './Usuarios';`
- `const PESTANAS = [['config', 'Configuración'], ['meseros', 'Meseros'], ['menu', 'Menú']] as const;` → `const PESTANAS = [['config', 'Configuración'], ['usuarios', 'Usuarios'], ['menu', 'Menú']] as const;`
- `useState<'config' | 'meseros' | 'menu'>('menu')` → `useState<'config' | 'usuarios' | 'menu'>('menu')`
- `{pestana === 'meseros' && <Meseros />}` → `{pestana === 'usuarios' && <Usuarios />}`

Run: `npm run typecheck && npm run build`
Expected: sin errores; `dist/web/index.html` regenerado.

- [ ] **Step 9: Verificar en vivo la pestaña**

Run: `npm run dev` en una terminal. En otra:
```bash
curl -s -X POST http://127.0.0.1:3000/api/admin/usuarios -H 'content-type: application/json' -d '{"nombre":"Prueba tarea 2","rol":"caja","pin":"0123"}'
curl -s http://127.0.0.1:3000/api/admin/usuarios | grep -c pin_hash
```
Expected: el primero devuelve el usuario con `"tiene_pin":true` y sin `pin_hash`; el segundo imprime `0`. (Todavía no hay guardia: en Task 3 y Task 4 estas mismas llamadas pasarán a exigir cookies.) Borrar el usuario de prueba de la base de desarrollo: `docker exec cafeteria-pg psql -U cafeteria -d cafeteria -c "DELETE FROM usuario WHERE nombre = 'Prueba tarea 2'"`. Detener el servidor con Ctrl+C.

- [ ] **Step 10: Commit y push**

```bash
git add src/servidor/seguridad/pin.ts src/servidor/seguridad/acceso.ts src/servidor/modulos/usuarios.ts src/servidor/modulos/meseros.ts src/servidor/app.ts src/web/admin/Usuarios.tsx src/web/admin/Meseros.tsx src/web/admin/AppAdmin.tsx tests/pin.test.ts tests/usuarios.test.ts tests/meseros.test.ts
git commit -m "Usuarios con rol y PIN cifrado con scrypt; regla del último administrador activo; pestaña Usuarios"
git push origin main
```

---

### Task 3: Dispositivos (solicitar, estado, autorizar, revocar, caducidad) y capa 1 del guardia
**Modelo ejecutor:** `claude-fable-5-1`. **Motivo:** aquí nace el guardia único de `onRequest` y la lista blanca de aparatos; un error de lógica deja la API abierta a la WiFi de los clientes. Hay que razonar sobre cada camino (local, remoto con cookie válida, con cookie revocada, sin cookie) y no solo transcribir.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`. Sondeo en vivo obligatorio con `remoteAddress` no local: sin cookie, con cookie de un aparato pendiente, con cookie inventada, con cookie de un aparato revocado.

**Files:**
- Create: `src/servidor/seguridad/tokens.ts`, `src/servidor/seguridad/cookies.ts`, `src/servidor/seguridad/guardia.ts`, `src/servidor/modulos/dispositivos.ts`, `tests/ayuda/acceso.ts`, `tests/dispositivos.test.ts`, `tests/guardia.test.ts`
- Modify: `src/servidor/errores.ts` (ErrorAcceso), `src/servidor/app.ts` (guardia, handler con `codigo`, acceso de `/api/estado`, rutas de dispositivos), `src/servidor/eventos.ts`, `src/servidor/modulos/configuracion.ts`, `src/servidor/modulos/catalogo.ts` (declarar acceso en cada ruta), `src/compartido/eventos.ts` (evento `dispositivos`), `tests/app.test.ts` (las rutas de prueba declaran acceso)

**Interfaces:**
- Consumes: tabla `dispositivo`, `sesion`, `intentoFallido` de Task 1; `Acceso`, `PUBLICO`, `SOLO_DISPOSITIVO`, `ADMIN` de Task 2; `UsuarioPublico` de Task 2.
- Produces:
  - `errores.ts`: `type CodigoAcceso`, `class ErrorAcceso extends Error { estado: number; codigo: CodigoAcceso }`. El manejador global responde `{ error, codigo }` cuando el error trae `codigo`.
  - `tokens.ts`: `generarToken(): string` (64 hex), `huellaToken(token: string): string` (sha256 hex).
  - `cookies.ts`: `NOMBRE_COOKIE_DISPOSITIVO = 'dispositivo'`, `NOMBRE_COOKIE_SESION = 'sesion'`, `leerCookies(cabecera?: string): Record<string, string>`, `cookieDispositivo(token): string`, `cookieSesion(token): string`, `cookieBorrada(nombre): string`.
  - `guardia.ts`: `registrarGuardia(app)` (hook `onRoute` que registra `app.rutasApi: RutaApi[]` y lanza si una ruta `/api/` no declara `config.acceso`; hook `onRequest` con la capa 1 en esta tarea), `esLocal(req): boolean`, `exigirLocal(req): void` (403 `solo_local`), `type RutaApi = { metodo: string; url: string; acceso: Acceso }`; ampliaciones `FastifyInstance.rutasApi`, `FastifyRequest.dispositivoActual: Dispositivo | null`, `FastifyRequest.usuarioActual: UsuarioPublico | null`, `FastifyRequest.sesionActual: Sesion | null` (las dos últimas las llena Task 4).
  - `dispositivos.ts`: `type Dispositivo`, `type DispositivoPublico` (sin `token_hash`), `CADUCIDAD_PENDIENTE_MIN = 10`, `MAXIMO_FALLOS = 5`, `BLOQUEO_MIN = 5`, `resumirNavegador(userAgent?): string`, `solicitarDispositivo(db, descripcion): Promise<{ dispositivo: Dispositivo; token: string }>`, `consultarSolicitud(db, esperaId: unknown, token: string | undefined): Promise<{ estado: 'pendiente' | 'autorizado' | 'revocado' }>`, `buscarDispositivoAutorizado(db, token): Promise<Dispositivo | null>` (actualiza `ultimo_uso_en`), `limpiarPendientesCaducados(db | tx)`, `listarDispositivos(db): Promise<{ pendientes, autorizados, intentos_fallidos }>`, `autorizarDispositivo(db, id, { nombre }, autorizadoPorId: string | null)`, `revocarDispositivo(db, id)`, `registrarFalloDeDispositivo(db, dispositivoId, usuarioId: string | null): Promise<Date | null>`, `reiniciarFallosDeDispositivo(db, dispositivoId)`, `rutasDispositivos(app)`.
  - `tests/ayuda/acceso.ts`: `IP_REMOTA = '192.168.1.50'`, `autorizarDispositivoDePrueba(db, nombre?): Promise<{ dispositivo, token, cookie }>`.
- Decisión de diseño que el ejecutor debe respetar (se anota también al final del plan, "Huecos"): el token del aparato se genera en `POST /api/dispositivos/solicitar`, se entrega **en ese momento** como cookie `HttpOnly` y solo empieza a servir cuando el administrador autoriza. `GET /api/dispositivos/estado` devuelve `{ estado }` y no vuelve a entregar el token: el servidor solo guarda su huella y no puede reproducirlo. La spec 5.2.5 dice que el token llega con la consulta de estado; hacerlo así obligaría a guardar el token en claro hasta entregarlo.

- [ ] **Step 1: Escribir los helpers de prueba y las pruebas de dispositivos**

`tests/ayuda/acceso.ts`:
```ts
import type { Db } from '../../src/servidor/db/conexion';
import { dispositivo } from '../../src/servidor/db/schema';
import { generarToken, huellaToken } from '../../src/servidor/seguridad/tokens';

// Cualquier IP que no sea la de la PC de caja: con remoteAddress: IP_REMOTA,
// inject deja de ser "local" y el guardia aplica la capa 1. Por omisión
// inject viene de 127.0.0.1, que se salta esa capa.
export const IP_REMOTA = '192.168.1.50';

export async function autorizarDispositivoDePrueba(db: Db, nombre = 'Celular de prueba') {
  const token = generarToken();
  const [d] = await db.insert(dispositivo).values({
    nombre, token_hash: huellaToken(token), estado: 'autorizado', autorizado_en: new Date(), descripcion: 'Prueba',
  }).returning();
  return { dispositivo: d, token, cookie: `dispositivo=${token}` };
}
```

`tests/dispositivos.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';
import { IP_REMOTA, autorizarDispositivoDePrueba } from './ayuda/acceso';
import { dispositivo, sesion, usuario } from '../src/servidor/db/schema';
import { registrarFalloDeDispositivo, reiniciarFallosDeDispositivo, resumirNavegador } from '../src/servidor/modulos/dispositivos';
import { generarToken, huellaToken } from '../src/servidor/seguridad/tokens';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';

function cookieDe(r: { headers: Record<string, unknown> }, nombre: string): string {
  const set = r.headers['set-cookie'];
  const lista = Array.isArray(set) ? set : typeof set === 'string' ? [set] : [];
  const linea = lista.find((c) => c.startsWith(`${nombre}=`));
  expect(linea, `falta la cookie ${nombre}`).toBeDefined();
  expect(linea).toContain('HttpOnly');
  expect(linea).toContain('SameSite=Strict');
  return linea!.split(';')[0];
}

test('resumirNavegador da un resumen legible', () => {
  expect(resumirNavegador(UA_ANDROID)).toBe('Chrome en Android');
  expect(resumirNavegador('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari en iPhone');
  expect(resumirNavegador(undefined)).toBe('Navegador en desconocido');
});

test('solicitar da un código de 4 dígitos, un espera_id y la cookie del aparato; el aparato queda pendiente', async () => {
  const r = await ctx.app.inject({ method: 'POST', url: '/api/dispositivos/solicitar', remoteAddress: IP_REMOTA, headers: { 'user-agent': UA_ANDROID } });
  expect(r.statusCode).toBe(201);
  expect(r.json().codigo).toMatch(/^\d{4}$/);
  expect(r.json().espera_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(r.json())).not.toContain('token');
  const cookie = cookieDe(r, 'dispositivo');
  expect(cookie).toMatch(/^dispositivo=[0-9a-f]{64}$/);
  const [fila] = await ctx.sql`SELECT estado, descripcion, codigo, token_hash FROM dispositivo WHERE id = ${r.json().espera_id}`;
  expect(fila).toMatchObject({ estado: 'pendiente', descripcion: 'Chrome en Android', codigo: r.json().codigo });
  expect(fila.token_hash).toBe(huellaToken(cookie.slice('dispositivo='.length)));
});

test('estado: pendiente con su cookie; 404 sin cookie, con otra cookie o con espera_id ajeno; 400 con espera_id mal formado', async () => {
  const s = await ctx.app.inject({ method: 'POST', url: '/api/dispositivos/solicitar', remoteAddress: IP_REMOTA });
  const cookie = cookieDe(s, 'dispositivo');
  const id = s.json().espera_id;
  const ok = await ctx.app.inject({ method: 'GET', url: `/api/dispositivos/estado?espera_id=${id}`, remoteAddress: IP_REMOTA, headers: { cookie } });
  expect(ok.statusCode).toBe(200);
  expect(ok.json()).toEqual({ estado: 'pendiente' });
  const sinCookie = await ctx.app.inject({ method: 'GET', url: `/api/dispositivos/estado?espera_id=${id}`, remoteAddress: IP_REMOTA });
  expect(sinCookie.statusCode).toBe(404);
  expect(sinCookie.json().codigo).toBe('solicitud_caducada');
  const otraCookie = await ctx.app.inject({ method: 'GET', url: `/api/dispositivos/estado?espera_id=${id}`, remoteAddress: IP_REMOTA, headers: { cookie: `dispositivo=${generarToken()}` } });
  expect(otraCookie.statusCode).toBe(404);
  const ajeno = await ctx.app.inject({ method: 'GET', url: '/api/dispositivos/estado?espera_id=00000000-0000-0000-0000-000000000000', remoteAddress: IP_REMOTA, headers: { cookie } });
  expect(ajeno.statusCode).toBe(404);
  const malo = await ctx.app.inject({ method: 'GET', url: '/api/dispositivos/estado?espera_id=x', remoteAddress: IP_REMOTA, headers: { cookie } });
  expect(malo.statusCode).toBe(400);
  const sinId = await ctx.app.inject({ method: 'GET', url: '/api/dispositivos/estado', remoteAddress: IP_REMOTA, headers: { cookie } });
  expect(sinId.statusCode).toBe(400);
});

test('autorizar exige nombre, cambia el estado, vacía el código y la cookie empieza a servir; repetir responde 409', async () => {
  const s = await ctx.app.inject({ method: 'POST', url: '/api/dispositivos/solicitar', remoteAddress: IP_REMOTA });
  const cookie = cookieDe(s, 'dispositivo');
  const id = s.json().espera_id;

  const antes = await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: IP_REMOTA, headers: { cookie } });
  expect(antes.statusCode).toBe(403);
  expect(antes.json()).toEqual({ error: 'Este dispositivo no está autorizado', codigo: 'dispositivo_no_autorizado' });

  const sinNombre = await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${id}/autorizar`, payload: {} });
  expect(sinNombre.statusCode).toBe(400);
  expect(sinNombre.json().error).toBe('Ponle un nombre al dispositivo antes de autorizarlo');
  const nombreMalo = await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${id}/autorizar`, payload: { nombre: 7 } });
  expect(nombreMalo.statusCode).toBe(400);
  const idMalo = await ctx.app.inject({ method: 'POST', url: '/api/admin/dispositivos/no-es-uuid/autorizar', payload: { nombre: 'X' } });
  expect(idMalo.statusCode).toBe(400);
  const noExiste = await ctx.app.inject({ method: 'POST', url: '/api/admin/dispositivos/00000000-0000-0000-0000-000000000000/autorizar', payload: { nombre: 'X' } });
  expect(noExiste.statusCode).toBe(404);

  const ok = await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${id}/autorizar`, payload: { nombre: 'Celular de Ana' } });
  expect(ok.statusCode).toBe(200);
  expect(ok.json()).toMatchObject({ id, nombre: 'Celular de Ana', estado: 'autorizado', codigo: null });
  expect('token_hash' in ok.json()).toBe(false);
  expect(ok.json().autorizado_en).not.toBeNull();

  const otraVez = await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${id}/autorizar`, payload: { nombre: 'Otro' } });
  expect(otraVez.statusCode).toBe(409);

  const estado = await ctx.app.inject({ method: 'GET', url: `/api/dispositivos/estado?espera_id=${id}`, remoteAddress: IP_REMOTA, headers: { cookie } });
  expect(estado.json()).toEqual({ estado: 'autorizado' });

  const despues = await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: IP_REMOTA, headers: { cookie } });
  expect(despues.statusCode).toBe(200);
  const [fila] = await ctx.sql`SELECT ultimo_uso_en FROM dispositivo WHERE id = ${id}`;
  expect(fila.ultimo_uso_en).not.toBeNull();
});

test('la capa 1: sin cookie, con cookie inventada o con cookie de aparato pendiente responde 403; desde 127.0.0.1 no hace falta cookie', async () => {
  const sinCookie = await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: IP_REMOTA });
  expect(sinCookie.statusCode).toBe(403);
  expect(sinCookie.json().codigo).toBe('dispositivo_no_autorizado');
  const inventada = await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: IP_REMOTA, headers: { cookie: `dispositivo=${generarToken()}` } });
  expect(inventada.statusCode).toBe(403);
  const basura = await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: IP_REMOTA, headers: { cookie: 'dispositivo=; otra=1; =raro' } });
  expect(basura.statusCode).toBe(403);
  const local = await ctx.app.inject({ method: 'GET', url: '/api/estado' });
  expect(local.statusCode).toBe(200);
  const localIpv6 = await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: '::1' });
  expect(localIpv6.statusCode).toBe(200);
  // x-forwarded-for no sirve para fingir ser local.
  const fingido = await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: IP_REMOTA, headers: { 'x-forwarded-for': '127.0.0.1' } });
  expect(fingido.statusCode).toBe(403);
});

test('el canal de eventos responde con dispositivo autorizado y no responde sin dispositivo', async () => {
  const sin = await ctx.app.inject({ method: 'GET', url: '/api/eventos', remoteAddress: IP_REMOTA });
  expect(sin.statusCode).toBe(403);
  const { cookie } = await autorizarDispositivoDePrueba(ctx.db, 'Pantalla de cocina');
  const con = await ctx.app.inject({ method: 'GET', url: '/api/eventos', remoteAddress: IP_REMOTA, headers: { cookie }, payloadAsStream: true });
  expect(con.statusCode).toBe(200);
  expect(con.headers['content-type']).toContain('text/event-stream');
  con.stream().destroy();
});

test('listar devuelve pendientes, autorizados y últimos intentos fallidos, sin huellas de token', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/admin/dispositivos' });
  expect(r.statusCode).toBe(200);
  const cuerpo = r.json();
  expect(Array.isArray(cuerpo.pendientes)).toBe(true);
  expect(Array.isArray(cuerpo.autorizados)).toBe(true);
  expect(Array.isArray(cuerpo.intentos_fallidos)).toBe(true);
  expect(cuerpo.autorizados.some((d: { nombre: string }) => d.nombre === 'Celular de Ana')).toBe(true);
  expect(cuerpo.pendientes.every((d: { codigo: string; descripcion: string }) => /^\d{4}$/.test(d.codigo) && typeof d.descripcion === 'string')).toBe(true);
  expect(JSON.stringify(cuerpo)).not.toContain('token_hash');
});

test('revocar invalida la cookie en la petición siguiente y cierra las sesiones del aparato; repetir es idempotente', async () => {
  const { dispositivo: d, cookie } = await autorizarDispositivoDePrueba(ctx.db, 'Tablet vieja');
  const [u] = await ctx.db.insert(usuario).values({ nombre: 'Usuario de tablet', rol: 'mesero' }).returning();
  const [s] = await ctx.db.insert(sesion).values({ usuario_id: u.id, dispositivo_id: d.id, token_hash: huellaToken(generarToken()) }).returning();
  expect((await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: IP_REMOTA, headers: { cookie } })).statusCode).toBe(200);

  const r = await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${d.id}/revocar` });
  expect(r.statusCode).toBe(200);
  expect(r.json().estado).toBe('revocado');
  expect((await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: IP_REMOTA, headers: { cookie } })).statusCode).toBe(403);
  const [cerrada] = await ctx.sql`SELECT cerrada_en FROM sesion WHERE id = ${s.id}`;
  expect(cerrada.cerrada_en).not.toBeNull();

  const otraVez = await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${d.id}/revocar` });
  expect(otraVez.statusCode).toBe(200);
  const lista = (await ctx.app.inject({ method: 'GET', url: '/api/admin/dispositivos' })).json();
  expect(lista.autorizados.some((x: { id: string }) => x.id === d.id)).toBe(false);
  const noExiste = await ctx.app.inject({ method: 'POST', url: '/api/admin/dispositivos/00000000-0000-0000-0000-000000000000/revocar' });
  expect(noExiste.statusCode).toBe(404);
  // Un aparato revocado no se puede autorizar: debe solicitar de nuevo.
  const reautorizar = await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${d.id}/autorizar`, payload: { nombre: 'Tablet' } });
  expect(reautorizar.statusCode).toBe(409);
});

test('una solicitud pendiente caduca a los 10 minutos: desaparece al listar, su estado es 404 y no se puede autorizar', async () => {
  const s = await ctx.app.inject({ method: 'POST', url: '/api/dispositivos/solicitar', remoteAddress: IP_REMOTA });
  const cookie = cookieDe(s, 'dispositivo');
  const id = s.json().espera_id;
  await ctx.sql`UPDATE dispositivo SET solicitado_en = now() - interval '11 minutes' WHERE id = ${id}`;
  const estado = await ctx.app.inject({ method: 'GET', url: `/api/dispositivos/estado?espera_id=${id}`, remoteAddress: IP_REMOTA, headers: { cookie } });
  expect(estado.statusCode).toBe(404);
  expect(estado.json().codigo).toBe('solicitud_caducada');
  const lista = (await ctx.app.inject({ method: 'GET', url: '/api/admin/dispositivos' })).json();
  expect(lista.pendientes.some((d: { id: string }) => d.id === id)).toBe(false);
  expect(await ctx.sql`SELECT id FROM dispositivo WHERE id = ${id}`).toHaveLength(0);
  const autorizar = await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${id}/autorizar`, payload: { nombre: 'Tarde' } });
  expect(autorizar.statusCode).toBe(404);
});

test('una solicitud pendiente aún vigente (9 minutos) sigue en la lista', async () => {
  const s = await ctx.app.inject({ method: 'POST', url: '/api/dispositivos/solicitar', remoteAddress: IP_REMOTA });
  const id = s.json().espera_id;
  await ctx.sql`UPDATE dispositivo SET solicitado_en = now() - interval '9 minutes' WHERE id = ${id}`;
  const lista = (await ctx.app.inject({ method: 'GET', url: '/api/admin/dispositivos' })).json();
  expect(lista.pendientes.some((d: { id: string }) => d.id === id)).toBe(true);
});

test('con 20 solicitudes pendientes, solicitar responde 409', async () => {
  // Se parte de cero pendientes para que los códigos de relleno (9000..9019)
  // no choquen con los códigos al azar de las pruebas anteriores.
  await ctx.sql`DELETE FROM dispositivo WHERE estado = 'pendiente'`;
  for (let i = 0; i < 20; i++) {
    await ctx.db.insert(dispositivo).values({ codigo: String(9000 + i), token_hash: huellaToken(generarToken()), descripcion: 'relleno' });
  }
  const r = await ctx.app.inject({ method: 'POST', url: '/api/dispositivos/solicitar', remoteAddress: IP_REMOTA });
  expect(r.statusCode).toBe(409);
  await ctx.sql`DELETE FROM dispositivo WHERE descripcion = 'relleno'`;
});

test('registrarFalloDeDispositivo bloquea al quinto fallo y reiniciar limpia', async () => {
  const { dispositivo: d } = await autorizarDispositivoDePrueba(ctx.db, 'Con fallos');
  for (let i = 1; i <= 4; i++) expect(await registrarFalloDeDispositivo(ctx.db, d.id, null)).toBeNull();
  const hasta = await registrarFalloDeDispositivo(ctx.db, d.id, null);
  expect(hasta).toBeInstanceOf(Date);
  expect(hasta!.getTime()).toBeGreaterThan(Date.now() + 4 * 60000);
  expect(hasta!.getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60000);
  const [fila] = await ctx.sql`SELECT intentos_fallidos, bloqueado_hasta FROM dispositivo WHERE id = ${d.id}`;
  expect(fila.intentos_fallidos).toBe(0);
  expect(fila.bloqueado_hasta).not.toBeNull();
  expect(await ctx.sql`SELECT id FROM intento_fallido WHERE dispositivo_id = ${d.id}`).toHaveLength(5);
  await reiniciarFallosDeDispositivo(ctx.db, d.id);
  const [limpia] = await ctx.sql`SELECT intentos_fallidos, bloqueado_hasta FROM dispositivo WHERE id = ${d.id}`;
  expect(limpia).toEqual({ intentos_fallidos: 0, bloqueado_hasta: null });
});
```

- [ ] **Step 2: Escribir la prueba del guardia (versión de esta tarea: registro de rutas y capa 1)**

`tests/guardia.test.ts` (Task 4 la reescribe entera con las capas 2 y 3):
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';
import { IP_REMOTA } from './ayuda/acceso';
import { crearApp } from '../src/servidor/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

// Lista blanca de la spec, sección 3.1, escrita aquí a propósito: si alguien
// exime una ruta nueva en el código, esta prueba lo detecta.
const EXENTAS_DE_DISPOSITIVO = new Set([
  'GET /api/instalacion', 'POST /api/instalacion',
  'POST /api/dispositivos/solicitar', 'GET /api/dispositivos/estado',
]);

test('toda ruta bajo /api queda registrada con su acceso y no hay HEAD sin declarar', () => {
  const rutas = ctx.app.rutasApi;
  expect(rutas.length).toBeGreaterThan(10);
  for (const r of rutas) expect(r.acceso, `${r.metodo} ${r.url}`).toBeDefined();
  expect(rutas.some((r) => r.url === '/api/estado' && r.metodo === 'GET')).toBe(true);
});

test('registrar una ruta bajo /api sin declarar acceso falla al arrancar', async () => {
  const appPrueba = await crearApp({ db: ctx.db });
  expect(() => appPrueba.get('/api/prueba/sin-acceso', async () => ({}))).toThrow('no declara acceso');
  // Fuera de /api no hace falta declarar nada.
  expect(() => appPrueba.get('/prueba-libre', async () => ({}))).not.toThrow();
  await appPrueba.close();
});

test('barrido capa 1: ninguna ruta bajo /api responde a un aparato sin autorizar, salvo la lista blanca de la spec 3.1', async () => {
  const rutas = ctx.app.rutasApi.filter((r) => r.metodo !== 'HEAD');
  expect(rutas.length).toBeGreaterThan(0);
  for (const r of rutas) {
    const clave = `${r.metodo} ${r.url}`;
    if (EXENTAS_DE_DISPOSITIVO.has(clave)) {
      expect(r.acceso.dispositivo, clave).toBe(false);
      continue;
    }
    expect(r.acceso.dispositivo, `${clave} debería exigir dispositivo`).toBe(true);
    const url = r.url.replace(/:[a-zA-Z]+/g, '00000000-0000-0000-0000-000000000000');
    const res = await ctx.app.inject({ method: r.metodo as any, url, remoteAddress: IP_REMOTA });
    expect(res.statusCode, clave).toBe(403);
    expect(res.json().codigo, clave).toBe('dispositivo_no_autorizado');
  }
});

test('una ruta que no existe bajo /api también exige dispositivo (403 antes que 404)', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/no-existe', remoteAddress: IP_REMOTA });
  expect(r.statusCode).toBe(403);
});
```

- [ ] **Step 3: Ejecutar para ver que fallan**

Run: `npm test -- tests/dispositivos.test.ts tests/guardia.test.ts`
Expected: FAIL, no encuentra `src/servidor/seguridad/tokens` ni `src/servidor/modulos/dispositivos`.

- [ ] **Step 4: `ErrorAcceso` en `errores.ts` y el manejador con `codigo` en `app.ts`**

Añadir al final de `src/servidor/errores.ts`:
```ts
// Errores del guardia de acceso (401, 403, 429) y de la solicitud de un
// aparato (404). Llevan un codigo de lista cerrada para que la pantalla sepa
// qué hacer sin leer el mensaje: mostrar el código de autorización, poner el
// teclado de PIN encima, o avisar que no tiene permiso.
export type CodigoAcceso =
  | 'dispositivo_no_autorizado'
  | 'dispositivo_bloqueado'
  | 'sin_sesion'
  | 'pin_incorrecto'
  | 'sin_permiso'
  | 'solo_local'
  | 'solicitud_caducada';

export class ErrorAcceso extends Error {
  constructor(public estado: number, mensaje: string, public codigo: CodigoAcceso) {
    super(mensaje);
  }
}
```

En `src/servidor/app.ts`:
- `type ErrorConEstado = FastifyError & { estado?: number };` → `type ErrorConEstado = FastifyError & { estado?: number; codigo?: string };`
- En el manejador, el bloque 1 pasa a:
```ts
    if (typeof err.estado === 'number') {
      reply.status(err.estado).send(err.codigo ? { error: err.message, codigo: err.codigo } : { error: err.message });
      return;
    }
```

- [ ] **Step 5: Escribir `tokens.ts` y `cookies.ts`**

`src/servidor/seguridad/tokens.ts`:
```ts
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
```

`src/servidor/seguridad/cookies.ts`:
```ts
// Cookies leídas y escritas a mano: dos nombres y un formato fijo no
// justifican @fastify/cookie. Los tokens son hexadecimales, así que no hay
// nada que codificar.
export const NOMBRE_COOKIE_DISPOSITIVO = 'dispositivo';
export const NOMBRE_COOKIE_SESION = 'sesion';

const DIAS_COOKIE_DISPOSITIVO = 400; // tope que aceptan los navegadores
const DIAS_COOKIE_SESION = 1; // la vigencia real la decide el servidor (expira_en)

export function leerCookies(cabecera: string | undefined): Record<string, string> {
  const resultado: Record<string, string> = {};
  if (!cabecera) return resultado;
  for (const parte of cabecera.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const nombre = parte.slice(0, i).trim();
    const valor = parte.slice(i + 1).trim();
    if (nombre && valor) resultado[nombre] = valor;
  }
  return resultado;
}

// HttpOnly: el JavaScript de la pantalla no puede leerlas. SameSite=Strict:
// solo viajan en peticiones que nacen en la propia pantalla. Sin Secure: la
// red local va por HTTP (spec sección 11).
function cookie(nombre: string, valor: string, segundos: number): string {
  return `${nombre}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${segundos}`;
}

export const cookieDispositivo = (token: string) => cookie(NOMBRE_COOKIE_DISPOSITIVO, token, DIAS_COOKIE_DISPOSITIVO * 86400);
export const cookieSesion = (token: string) => cookie(NOMBRE_COOKIE_SESION, token, DIAS_COOKIE_SESION * 86400);
export const cookieBorrada = (nombre: string) => cookie(nombre, '', 0);
```

- [ ] **Step 6: Escribir `dispositivos.ts`**

En `src/compartido/eventos.ts`: `export type NombreEvento = 'jornada' | 'mesa' | 'stock' | 'catalogo' | 'config';` → `export type NombreEvento = 'jornada' | 'mesa' | 'stock' | 'catalogo' | 'config' | 'dispositivos';`

`src/servidor/modulos/dispositivos.ts`:
```ts
import { and, asc, count, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Db, Tx } from '../db/conexion';
import { dispositivo, intentoFallido, sesion, usuario } from '../db/schema';
import { ErrorAcceso, ErrorNegocio, NoEncontrado, exigirObjetoOpcional, exigirTexto, exigirUuid } from '../errores';
import { generarToken, huellaToken } from '../seguridad/tokens';
import { NOMBRE_COOKIE_DISPOSITIVO, cookieDispositivo, leerCookies } from '../seguridad/cookies';
import { ADMIN, PUBLICO } from '../seguridad/acceso';

export type Dispositivo = typeof dispositivo.$inferSelect;
export type DispositivoPublico = Omit<Dispositivo, 'token_hash'>;

export const CADUCIDAD_PENDIENTE_MIN = 10;
export const MAXIMO_FALLOS = 5;
export const BLOQUEO_MIN = 5;
// Tope de solicitudes pendientes a la vez: sin él, cualquiera en la WiFi
// podría llenar la lista de admin (y agotar los 10 000 códigos) a base de
// pedir acceso en bucle. Las pendientes caducan solas a los 10 minutos.
const MAXIMO_PENDIENTES = 20;

function publicoDispositivo(d: Dispositivo): DispositivoPublico {
  const { token_hash, ...resto } = d;
  return resto;
}

// Resumen legible del navegador para que el administrador reconozca el
// aparato ("Chrome en Android"). Solo informativo.
export function resumirNavegador(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  const navegador = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const sistema = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'desconocido';
  return `${navegador} en ${sistema}`;
}

function generarCodigo(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

export async function limpiarPendientesCaducados(db: Db | Tx) {
  await db.delete(dispositivo).where(
    sql`${dispositivo.estado} = 'pendiente' AND ${dispositivo.solicitado_en} < now() - make_interval(mins => ${CADUCIDAD_PENDIENTE_MIN}::int)`,
  );
}

// El token se genera aquí, se entrega una sola vez (cookie) y solo empieza a
// servir cuando el administrador autoriza. En la base queda su huella. No va
// en una transacción a propósito: un choque de código (índice parcial
// dispositivo_codigo_pendiente_unico) abortaría la transacción entera y no
// se podría reintentar dentro de ella.
export async function solicitarDispositivo(db: Db, descripcion: string): Promise<{ dispositivo: Dispositivo; token: string }> {
  await limpiarPendientesCaducados(db);
  const [{ pendientes }] = await db.select({ pendientes: count() }).from(dispositivo).where(eq(dispositivo.estado, 'pendiente'));
  if (pendientes >= MAXIMO_PENDIENTES) throw new ErrorNegocio('Hay demasiadas solicitudes pendientes; espera a que el administrador las atienda');
  const token = generarToken();
  for (let intento = 0; intento < 10; intento++) {
    try {
      const [d] = await db.insert(dispositivo).values({ codigo: generarCodigo(), token_hash: huellaToken(token), descripcion }).returning();
      return { dispositivo: d, token };
    } catch (err) {
      const e = err as { code?: string; constraint_name?: string };
      if (!(e.code === '23505' && e.constraint_name === 'dispositivo_codigo_pendiente_unico')) throw err;
    }
  }
  throw new ErrorNegocio('No se pudo generar un código de autorización; inténtalo de nuevo');
}

// El aparato pendiente pregunta si ya lo autorizaron. Solo responde si la
// cookie que trae es la de esa misma solicitud: el espera_id por sí solo no
// da acceso a nada.
export async function consultarSolicitud(db: Db, esperaId: unknown, token: string | undefined): Promise<{ estado: 'pendiente' | 'autorizado' | 'revocado' }> {
  const id = exigirUuid(esperaId, 'La solicitud no es válida');
  const caducada = () => new ErrorAcceso(404, 'La solicitud caducó o no existe; el aparato debe pedir acceso de nuevo', 'solicitud_caducada');
  if (!token) throw caducada();
  const [d] = await db.select().from(dispositivo).where(and(eq(dispositivo.id, id), eq(dispositivo.token_hash, huellaToken(token))));
  if (!d) throw caducada();
  if (d.estado === 'pendiente' && d.solicitado_en.getTime() < Date.now() - CADUCIDAD_PENDIENTE_MIN * 60000) {
    await db.delete(dispositivo).where(eq(dispositivo.id, id));
    throw caducada();
  }
  return { estado: d.estado };
}

// Capa 1 del guardia: devuelve el aparato si la cookie corresponde a uno
// autorizado, y de paso anota el último uso. Un solo UPDATE ... RETURNING.
export async function buscarDispositivoAutorizado(db: Db, token: string): Promise<Dispositivo | null> {
  const [d] = await db.update(dispositivo).set({ ultimo_uso_en: new Date() })
    .where(and(eq(dispositivo.token_hash, huellaToken(token)), eq(dispositivo.estado, 'autorizado')))
    .returning();
  return d ?? null;
}

export async function listarDispositivos(db: Db) {
  await limpiarPendientesCaducados(db);
  const filas = await db.select().from(dispositivo).where(ne(dispositivo.estado, 'revocado')).orderBy(asc(dispositivo.solicitado_en));
  const intentos = await db.select({
    id: intentoFallido.id,
    ocurrido_en: intentoFallido.creado_en,
    dispositivo: dispositivo.nombre,
    usuario: usuario.nombre,
  }).from(intentoFallido)
    .leftJoin(dispositivo, eq(intentoFallido.dispositivo_id, dispositivo.id))
    .leftJoin(usuario, eq(intentoFallido.usuario_id, usuario.id))
    .orderBy(desc(intentoFallido.creado_en))
    .limit(20);
  return {
    pendientes: filas.filter((d) => d.estado === 'pendiente').map(publicoDispositivo),
    autorizados: filas.filter((d) => d.estado === 'autorizado').map(publicoDispositivo),
    intentos_fallidos: intentos.map((i) => ({
      ...i,
      dispositivo: i.dispositivo ?? 'PC de caja',
      usuario: i.usuario ?? 'Usuario desconocido',
    })),
  };
}

export async function autorizarDispositivo(db: Db, id: string, datos: { nombre?: unknown }, autorizadoPorId: string | null): Promise<DispositivoPublico> {
  exigirUuid(id, 'El identificador del dispositivo no es válido');
  const nombre = exigirTexto(datos.nombre, 'El nombre del dispositivo debe ser texto', 'Ponle un nombre al dispositivo antes de autorizarlo');
  return db.transaction(async (tx) => {
    const [d] = await tx.select().from(dispositivo).where(eq(dispositivo.id, id)).for('update');
    if (!d) throw new NoEncontrado('El dispositivo no existe');
    if (d.estado === 'autorizado') throw new ErrorNegocio('Este dispositivo ya está autorizado');
    if (d.estado === 'revocado') throw new ErrorNegocio('Este dispositivo fue revocado; debe solicitar acceso de nuevo');
    if (d.solicitado_en.getTime() < Date.now() - CADUCIDAD_PENDIENTE_MIN * 60000) throw new ErrorNegocio('La solicitud caducó; el aparato debe pedir acceso de nuevo');
    const [a] = await tx.update(dispositivo)
      .set({ nombre, estado: 'autorizado', codigo: null, autorizado_en: new Date(), autorizado_por: autorizadoPorId })
      .where(eq(dispositivo.id, id)).returning();
    return publicoDispositivo(a);
  });
}

// Regla 28: el token deja de servir en la siguiente petición (buscarDispositivoAutorizado
// solo acepta estado autorizado) y las sesiones abiertas desde el aparato se
// cierran en la misma transacción.
export async function revocarDispositivo(db: Db, id: string): Promise<DispositivoPublico> {
  exigirUuid(id, 'El identificador del dispositivo no es válido');
  return db.transaction(async (tx) => {
    const [d] = await tx.select().from(dispositivo).where(eq(dispositivo.id, id)).for('update');
    if (!d) throw new NoEncontrado('El dispositivo no existe');
    if (d.estado === 'revocado') return publicoDispositivo(d);
    const [r] = await tx.update(dispositivo).set({ estado: 'revocado', codigo: null }).where(eq(dispositivo.id, id)).returning();
    await tx.update(sesion).set({ cerrada_en: new Date() }).where(and(eq(sesion.dispositivo_id, id), isNull(sesion.cerrada_en)));
    return publicoDispositivo(r);
  });
}

// Regla 26. Anota el intento y suma uno al contador del aparato de forma
// atómica (UPDATE ... = ... + 1 RETURNING: dos fallos simultáneos no se pisan).
// Al quinto, bloquea 5 minutos y pone el contador en 0: pasado el bloqueo se
// vuelven a tener 5 intentos. Devuelve hasta cuándo queda bloqueado, o null.
export async function registrarFalloDeDispositivo(db: Db, dispositivoId: string, usuarioId: string | null): Promise<Date | null> {
  await db.insert(intentoFallido).values({ dispositivo_id: dispositivoId, usuario_id: usuarioId });
  const [d] = await db.update(dispositivo)
    .set({ intentos_fallidos: sql`${dispositivo.intentos_fallidos} + 1` })
    .where(eq(dispositivo.id, dispositivoId))
    .returning({ intentos: dispositivo.intentos_fallidos });
  if (!d || d.intentos < MAXIMO_FALLOS) return null;
  const hasta = new Date(Date.now() + BLOQUEO_MIN * 60000);
  await db.update(dispositivo).set({ intentos_fallidos: 0, bloqueado_hasta: hasta }).where(eq(dispositivo.id, dispositivoId));
  return hasta;
}

export async function reiniciarFallosDeDispositivo(db: Db, dispositivoId: string) {
  await db.update(dispositivo).set({ intentos_fallidos: 0, bloqueado_hasta: null }).where(eq(dispositivo.id, dispositivoId));
}

export function rutasDispositivos(app: FastifyInstance) {
  app.post('/api/dispositivos/solicitar', { config: { acceso: PUBLICO } }, async (req, reply) => {
    const { dispositivo: d, token } = await solicitarDispositivo(app.db, resumirNavegador(req.headers['user-agent']));
    reply.header('set-cookie', cookieDispositivo(token));
    app.bus.emitir('dispositivos');
    return reply.status(201).send({ codigo: d.codigo, espera_id: d.id });
  });
  app.get<{ Querystring: { espera_id?: string } }>('/api/dispositivos/estado', { config: { acceso: PUBLICO } }, async (req) => {
    const token = leerCookies(req.headers.cookie)[NOMBRE_COOKIE_DISPOSITIVO];
    return consultarSolicitud(app.db, req.query.espera_id, token);
  });
  app.get('/api/admin/dispositivos', { config: { acceso: ADMIN } }, async () => listarDispositivos(app.db));
  app.post<{ Params: { id: string } }>('/api/admin/dispositivos/:id/autorizar', { config: { acceso: ADMIN } }, async (req) => {
    const datos = exigirObjetoOpcional(req.body);
    // usuarioActual lo llena la capa 2 (Task 4); hasta entonces queda nulo.
    const d = await autorizarDispositivo(app.db, req.params.id, datos, req.usuarioActual?.id ?? null);
    app.bus.emitir('dispositivos');
    return d;
  });
  app.post<{ Params: { id: string } }>('/api/admin/dispositivos/:id/revocar', { config: { acceso: ADMIN } }, async (req) => {
    const d = await revocarDispositivo(app.db, req.params.id);
    app.bus.emitir('dispositivos');
    return d;
  });
}
```

- [ ] **Step 7: Escribir `guardia.ts` (capa 1 y registro de rutas)**

`src/servidor/seguridad/guardia.ts`:
```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ADMIN, type Acceso } from './acceso';
import { ErrorAcceso } from '../errores';
import { NOMBRE_COOKIE_DISPOSITIVO, leerCookies } from './cookies';
import { buscarDispositivoAutorizado, type Dispositivo } from '../modulos/dispositivos';
import type { UsuarioPublico } from '../modulos/usuarios';
import type { sesion } from '../db/schema';

export type RutaApi = { metodo: string; url: string; acceso: Acceso };
type Sesion = typeof sesion.$inferSelect;

declare module 'fastify' {
  interface FastifyInstance {
    rutasApi: RutaApi[];
  }
  interface FastifyRequest {
    dispositivoActual: Dispositivo | null;
    usuarioActual: UsuarioPublico | null;
    sesionActual: Sesion | null;
  }
}

// La PC de caja habla con el servidor por la interfaz local. Fastify no
// confía en x-forwarded-for (trustProxy en false), así que req.ip es la
// dirección real del socket y nadie puede fingir ser local desde la red.
const IPS_LOCALES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function esLocal(req: FastifyRequest): boolean {
  return IPS_LOCALES.has(req.ip);
}

export function exigirLocal(req: FastifyRequest) {
  if (!esLocal(req)) throw new ErrorAcceso(403, 'Esta operación solo se puede hacer desde la PC de caja', 'solo_local');
}

// El guardia único (spec sección 3). Se registra ANTES que cualquier ruta.
//  - onRoute: cada ruta bajo /api/ debe declarar config.acceso; si no, el
//    arranque falla. Así una ruta nueva nunca nace abierta por olvido.
//  - onRequest: capa 1 (dispositivo). Las capas 2 y 3 se añaden en Task 4.
export function registrarGuardia(app: FastifyInstance) {
  app.decorate('rutasApi', []);
  app.decorateRequest('dispositivoActual', null);
  app.decorateRequest('usuarioActual', null);
  app.decorateRequest('sesionActual', null);

  app.addHook('onRoute', (ruta) => {
    if (!ruta.url.startsWith('/api/')) return;
    const metodos = Array.isArray(ruta.method) ? ruta.method : [ruta.method];
    const acceso = ruta.config?.acceso;
    if (!acceso) throw new Error(`La ruta ${metodos.join(',')} ${ruta.url} no declara acceso (config.acceso). Toda ruta bajo /api/ debe declararlo.`);
    for (const metodo of metodos) app.rutasApi.push({ metodo, url: ruta.url, acceso });
  });

  app.addHook('onRequest', async (req) => {
    const ruta = req.url.split('?')[0];
    if (!ruta.startsWith('/api/')) return;
    // Una URL que no corresponde a ninguna ruta (404) no tiene declaración:
    // se trata como la más restrictiva, así el 404 no revela nada a un
    // aparato sin autorizar.
    const acceso: Acceso = req.routeOptions?.config?.acceso ?? ADMIN;

    // Capa 1: ¿el dispositivo está autorizado? La PC de caja se la salta.
    if (!esLocal(req)) {
      const token = leerCookies(req.headers.cookie)[NOMBRE_COOKIE_DISPOSITIVO];
      req.dispositivoActual = token ? await buscarDispositivoAutorizado(app.db, token) : null;
      if (acceso.dispositivo && !req.dispositivoActual) {
        throw new ErrorAcceso(403, 'Este dispositivo no está autorizado', 'dispositivo_no_autorizado');
      }
    }
  });
}
```

- [ ] **Step 8: Registrar el guardia y declarar el acceso de todas las rutas existentes**

`src/servidor/app.ts`:
- Añadir imports: `import { registrarGuardia } from './seguridad/guardia';`, `import { SOLO_DISPOSITIVO } from './seguridad/acceso';`, `import { rutasDispositivos } from './modulos/dispositivos';`
- Justo después de `app.decorate('bus', ...)` y **antes** de `await app.register(multipart)`: `registrarGuardia(app);`
- `app.get('/api/estado', async () => {` → `app.get('/api/estado', { config: { acceso: SOLO_DISPOSITIVO } }, async () => {`
- Después de `rutasCatalogo(app);` añadir `rutasDispositivos(app);`

`src/servidor/eventos.ts`:
- Añadir `import { SOLO_DISPOSITIVO } from './seguridad/acceso';`
- `app.get('/api/eventos', (req: FastifyRequest, reply: FastifyReply) => {` → `app.get('/api/eventos', { config: { acceso: SOLO_DISPOSITIVO } }, (req: FastifyRequest, reply: FastifyReply) => {`

`src/servidor/modulos/configuracion.ts`:
- Añadir `import { ADMIN } from '../seguridad/acceso';`
- `app.get('/api/admin/configuracion', async () => ...)` → `app.get('/api/admin/configuracion', { config: { acceso: ADMIN } }, async () => ...)`
- `app.patch('/api/admin/configuracion', async (req) => {` → `app.patch('/api/admin/configuracion', { config: { acceso: ADMIN } }, async (req) => {`

`src/servidor/modulos/catalogo.ts`:
- Añadir `import { ADMIN, SOLO_DISPOSITIVO } from '../seguridad/acceso';`
- `app.get('/api/catalogo', async () => ...)` → `app.get('/api/catalogo', { config: { acceso: SOLO_DISPOSITIVO } }, async () => ...)`
- Las 8 rutas `/api/admin/...` de `rutasCatalogo` reciben `{ config: { acceso: ADMIN } }` como segundo argumento, antes del handler: `GET /api/admin/categorias`, `POST /api/admin/categorias`, `PATCH /api/admin/categorias/:id`, `GET /api/admin/productos`, `POST /api/admin/productos`, `PATCH /api/admin/productos/:id`, `POST /api/admin/productos/:id/stock`, `POST /api/admin/productos/:id/foto`. Ejemplo: `app.patch<{ Params: { id: string } }>('/api/admin/productos/:id', { config: { acceso: ADMIN } }, async (req) => {`.

`tests/app.test.ts`, prueba `'el manejador de errores traduce cada tipo...'`: las cinco rutas `/api/prueba/*` que registra sobre `appPrueba` reciben `{ config: { acceso: PUBLICO } }` como segundo argumento (si no, el `onRoute` del guardia lanza). Añadir `import { PUBLICO } from '../src/servidor/seguridad/acceso';`. Ejemplo: `appPrueba.get('/api/prueba/negocio', { config: { acceso: PUBLICO } }, async () => { throw new ErrorNegocio('conflicto de negocio'); });`.

- [ ] **Step 9: Ejecutar todo**

Run: `npm run typecheck && npm test`
Expected: sin errores de tipos; 0 failed. Las pruebas anteriores siguen pasando porque `inject` viene de `127.0.0.1` y se salta la capa 1. Nuevas: 12 en `dispositivos.test.ts`, 4 en `guardia.test.ts`.

- [ ] **Step 10: Verificar en vivo desde una IP no local**

Run: `npm run dev` en una terminal. En otra (la IP de esta Mac en la red local hace que el servidor vea una petición "remota"):
```bash
IP=$(ipconfig getifaddr en0); echo "IP local: $IP"
curl -s -i http://$IP:3000/api/estado | head -1
curl -s -i -X POST http://$IP:3000/api/dispositivos/solicitar -c /tmp/cookies.txt | grep -i 'set-cookie\|codigo'
curl -s http://127.0.0.1:3000/api/admin/dispositivos | head -c 300
```
Expected: la primera línea es `HTTP/1.1 403 Forbidden`; la segunda muestra `Set-Cookie: dispositivo=...; HttpOnly` y `{"codigo":"1234","espera_id":"..."}` (código al azar); la tercera lista el pendiente con `"descripcion":"Navegador en desconocido"` (curl no manda un user-agent reconocible). Si `ipconfig getifaddr en0` no devuelve nada (sin WiFi), usar `en1` o saltar este paso y dejarlo dicho en el reporte. Borrar el pendiente: `docker exec cafeteria-pg psql -U cafeteria -d cafeteria -c "DELETE FROM dispositivo WHERE estado = 'pendiente'"`. Ctrl+C.

- [ ] **Step 11: Commit y push**

```bash
git add src/servidor/errores.ts src/servidor/app.ts src/servidor/eventos.ts src/servidor/modulos/configuracion.ts src/servidor/modulos/catalogo.ts src/servidor/modulos/dispositivos.ts src/servidor/seguridad/tokens.ts src/servidor/seguridad/cookies.ts src/servidor/seguridad/guardia.ts src/compartido/eventos.ts tests/ayuda/acceso.ts tests/dispositivos.test.ts tests/guardia.test.ts tests/app.test.ts
git commit -m "Lista blanca de dispositivos y capa 1 del guardia: toda ruta bajo /api declara su acceso"
git push origin main
```

---

### Task 4: Sesión con PIN, expiración por rol, bloqueo por intentos, capas 2 y 3 del guardia y prueba de barrido
**Modelo ejecutor:** `claude-fable-5-1`. **Motivo:** es el corazón de la seguridad: verificación del PIN sin delatar si el usuario existe, contador de fallos que dos peticiones simultáneas no deben pisar, sesiones atadas al aparato, expiración por rol, y la prueba de barrido que decide si una ruta futura nace abierta. Hay que razonar cada caso, no transcribir.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`. Sondeo en vivo obligatorio: PIN correcto con usuario inactivo, usuario sin PIN, `usuario_id` inexistente (los tres deben responder exactamente igual), cookie de sesión de un celular usada desde la PC y al revés, sexto intento con PIN correcto, y que `GET /api/admin/usuarios` sin cookie responda 401.

**Files:**
- Create: `src/servidor/modulos/sesiones.ts`, `tests/sesiones.test.ts`
- Modify: `src/servidor/seguridad/guardia.ts` (capas 2 y 3, `usuarioDe`), `src/servidor/app.ts` (rutas de sesión), `tests/ayuda/app.ts` (admin de prueba con sesión en cada `inject`), `tests/ayuda/acceso.ts` (helpers de usuario y sesión), `tests/guardia.test.ts` (reescrito entero con el barrido de las tres capas), `tests/usuarios.test.ts` (dos pruebas se adaptan al admin de prueba)

**Interfaces:**
- Consumes: `usuario`, `sesion`, `intentoFallido` (Task 1); `publico`, `Usuario`, `UsuarioPublico`, `crearUsuario` (Task 2); `exigirPin`, `verificarPin`, `HASH_SENUELO` (Task 2); `generarToken`, `huellaToken`, cookies, `ErrorAcceso`, `Dispositivo`, `registrarFalloDeDispositivo`, `reiniciarFallosDeDispositivo`, `MAXIMO_FALLOS`, `BLOQUEO_MIN`, `esLocal`, `SOLO_DISPOSITIVO`, `TODOS` (Task 3).
- Produces:
  - `sesiones.ts`: `type Sesion`, `type SesionViva = { sesion: Sesion; usuario: UsuarioPublico }`, `DURACION_SESION_MIN: Record<Rol, number | null> = { mesero: null, caja: 30, admin: 15 }`, `listarUsuariosParaEntrar(db): Promise<{ id, nombre, rol }[]>`, `abrirSesion(db | tx, usuario: Usuario | UsuarioPublico, dispositivoId: string | null): Promise<{ token: string; sesion: Sesion }>` (sin verificar PIN: la usan `iniciarSesion`, la instalación de Task 5 y las pruebas), `iniciarSesion(db, { usuario_id, pin }, dispositivo: Dispositivo | null): Promise<{ token, sesion, usuario }>`, `buscarSesionViva(db, token): Promise<SesionViva | null>` (sin escribir), `renovarSesion(db, sesion: Sesion, rol: Rol): Promise<Sesion>` (escribe `ultimo_uso_en` y `expira_en`), `cerrarSesion(db, token)`, `cerrarSesionesDeRol(db | tx, rol): Promise<number>`, `reiniciarBloqueoLocal()` (solo pruebas), `rutasSesion(app)`: `GET /api/sesion/usuarios`, `POST /api/sesion` (201), `GET /api/sesion`, `DELETE /api/sesion` (204).
  - `guardia.ts` añade: capa 2 (401 `sin_sesion`), atadura sesión↔aparato, capa 3 (403 `sin_permiso`), `usuarioDe(req): UsuarioPublico`.
  - `tests/ayuda/app.ts`: `crearAppDePrueba()` → `{ app, db, sql, admin: UsuarioPublico, cookieAdmin: string }`; `app.inject` añade la cookie del admin de prueba salvo que la prueba mande su propia cabecera `cookie`. `PIN_ADMIN_PRUEBA = '1234'`.
  - `tests/ayuda/acceso.ts` añade: `crearUsuarioDePrueba(db, nombre, rol, pin = '1234')`, `abrirSesionDePrueba(db, usuario, dispositivoId = null): Promise<string>` (devuelve la cookie `sesion=...`).
- Reglas: 21 a 26 y 28 y 29 de la spec. Mensajes: 401 `'Tu sesión no está iniciada o venció; escribe tu PIN'` (`sin_sesion`), 401 `'PIN incorrecto'` (`pin_incorrecto`), 403 `'No tienes permiso para esta pantalla'` (`sin_permiso`), 429 `'Demasiados intentos. Espera 5 minutos.'` (`dispositivo_bloqueado`).

- [ ] **Step 1: Ampliar los helpers de prueba**

`tests/ayuda/acceso.ts`, añadir al final:
```ts
import { crearUsuario, type UsuarioPublico } from '../../src/servidor/modulos/usuarios';
import { abrirSesion } from '../../src/servidor/modulos/sesiones';
import type { Rol } from '../../src/compartido/roles';

export function crearUsuarioDePrueba(db: Db, nombre: string, rol: Rol, pin = '1234'): Promise<UsuarioPublico> {
  return crearUsuario(db, { nombre, rol, pin });
}

// Abre una sesión sin pasar por el PIN y devuelve la cookie lista para
// headers: { cookie }. dispositivoId nulo = abierta en la PC de caja.
export async function abrirSesionDePrueba(db: Db, u: UsuarioPublico, dispositivoId: string | null = null): Promise<string> {
  const { token } = await abrirSesion(db, u, dispositivoId);
  return `sesion=${token}`;
}
```
(Mover los `import` al principio del archivo, junto a los existentes.)

`tests/ayuda/app.ts`, contenido completo:
```ts
import { prepararBaseDePrueba } from './db';
import { crearApp } from '../../src/servidor/app';
import { crearUsuario } from '../../src/servidor/modulos/usuarios';
import { abrirSesion } from '../../src/servidor/modulos/sesiones';

export const PIN_ADMIN_PRUEBA = '1234';

// Crea la app sobre una base limpia, un administrador de prueba y una sesión
// suya abierta desde la PC de caja, y hace que app.inject mande esa cookie
// salvo que la prueba traiga su propia cabecera cookie:
//   headers: { cookie: '' }                       → sin sesión
//   headers: { cookie: 'dispositivo=...; sesion=...' } → la que la prueba quiera
// Así las pruebas del plan 1 siguen valiendo tal cual: todas hablan como el
// administrador desde la PC de caja.
export async function crearAppDePrueba() {
  const { db, sql } = await prepararBaseDePrueba();
  const app = await crearApp({ db });
  await app.ready();
  const admin = await crearUsuario(db, { nombre: 'Admin de prueba', rol: 'admin', pin: PIN_ADMIN_PRUEBA });
  const { token } = await abrirSesion(db, admin, null);
  const cookieAdmin = `sesion=${token}`;
  const injectOriginal = app.inject.bind(app);
  (app as any).inject = (opciones: any) => injectOriginal({ ...opciones, headers: { cookie: cookieAdmin, ...(opciones.headers ?? {}) } });
  return { app, db, sql, admin, cookieAdmin };
}
```

- [ ] **Step 2: Escribir las pruebas de sesión**

`tests/sesiones.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';
import { IP_REMOTA, abrirSesionDePrueba, autorizarDispositivoDePrueba, crearUsuarioDePrueba } from './ayuda/acceso';
import { eq } from 'drizzle-orm';
import { usuario } from '../src/servidor/db/schema';
import { cerrarSesionesDeRol, reiniciarBloqueoLocal } from '../src/servidor/modulos/sesiones';
import { huellaToken } from '../src/servidor/seguridad/tokens';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
let aparato: Awaited<ReturnType<typeof autorizarDispositivoDePrueba>>;
let mesero: Awaited<ReturnType<typeof crearUsuarioDePrueba>>;
let caja: Awaited<ReturnType<typeof crearUsuarioDePrueba>>;
let adminRemoto: Awaited<ReturnType<typeof crearUsuarioDePrueba>>;

beforeAll(async () => {
  ctx = await crearAppDePrueba();
  aparato = await autorizarDispositivoDePrueba(ctx.db, 'Celular de Ana');
  mesero = await crearUsuarioDePrueba(ctx.db, 'Ana', 'mesero', '1111');
  caja = await crearUsuarioDePrueba(ctx.db, 'Beto', 'caja', '2222');
  adminRemoto = await crearUsuarioDePrueba(ctx.db, 'Dueño', 'admin', '3333');
  await crearUsuarioDePrueba(ctx.db, 'Inactivo', 'mesero', '4444').then((u) => ctx.db.update(usuario).set({ activo: false }).where(eq(usuario.id, u.id)));
  await ctx.db.insert(usuario).values({ nombre: 'Sin PIN', rol: 'mesero' });
});
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

// Huella del token que viaja en una cookie "sesion=...", para buscar su fila.
const huellaDe = (cookieSesion: string) => huellaToken(cookieSesion.slice('sesion='.length));

const desdeAparato = (extra: Record<string, unknown> = {}) => ({ remoteAddress: IP_REMOTA, headers: { cookie: aparato.cookie }, ...extra });
const entrar = (usuario_id: unknown, pin: unknown, opciones: Record<string, unknown> = desdeAparato()) =>
  ctx.app.inject({ method: 'POST', url: '/api/sesion', payload: { usuario_id, pin }, ...opciones } as any);

function cookieSesionDe(r: { headers: Record<string, unknown> }): string {
  const set = r.headers['set-cookie'];
  const lista = Array.isArray(set) ? set : typeof set === 'string' ? [set] : [];
  const linea = lista.find((c) => c.startsWith('sesion='));
  expect(linea, 'falta la cookie sesion').toBeDefined();
  expect(linea).toContain('HttpOnly');
  return linea!.split(';')[0];
}
const conSesion = (cookieSesion: string) => ({ remoteAddress: IP_REMOTA, headers: { cookie: `${aparato.cookie}; ${cookieSesion}` } });

test('la lista para entrar trae solo activos con PIN, sin nada del PIN, y exige dispositivo pero no sesión', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/sesion/usuarios', ...desdeAparato() });
  expect(r.statusCode).toBe(200);
  const nombres = r.json().map((u: { nombre: string }) => u.nombre);
  expect(nombres).toEqual(['Admin de prueba', 'Ana', 'Beto', 'Dueño']);
  expect(Object.keys(r.json()[0]).sort()).toEqual(['id', 'nombre', 'rol']);
  const sinAparato = await ctx.app.inject({ method: 'GET', url: '/api/sesion/usuarios', remoteAddress: IP_REMOTA, headers: { cookie: '' } });
  expect(sinAparato.statusCode).toBe(403);
});

test('entrar con PIN correcto abre sesión con expiración según el rol y devuelve la cookie', async () => {
  const m = await entrar(mesero.id, '1111');
  expect(m.statusCode).toBe(201);
  expect(m.json().usuario).toMatchObject({ id: mesero.id, nombre: 'Ana', rol: 'mesero' });
  expect(JSON.stringify(m.json())).not.toContain('pin_hash');
  expect(m.json().expira_en).toBeNull();
  expect(m.json().token).toMatch(/^[0-9a-f]{64}$/);
  cookieSesionDe(m);

  const c = await entrar(caja.id, '2222');
  expect(c.statusCode).toBe(201);
  const expiraCaja = new Date(c.json().expira_en).getTime() - Date.now();
  expect(expiraCaja).toBeGreaterThan(29 * 60000);
  expect(expiraCaja).toBeLessThanOrEqual(30 * 60000);

  const a = await entrar(adminRemoto.id, '3333');
  const expiraAdmin = new Date(a.json().expira_en).getTime() - Date.now();
  expect(expiraAdmin).toBeGreaterThan(14 * 60000);
  expect(expiraAdmin).toBeLessThanOrEqual(15 * 60000);
});

test('PIN incorrecto, usuario inexistente, inactivo o sin PIN responden exactamente igual', async () => {
  const [sinPin] = await ctx.sql`SELECT id FROM usuario WHERE nombre = 'Sin PIN'`;
  const [inactivo] = await ctx.sql`SELECT id FROM usuario WHERE nombre = 'Inactivo'`;
  const casos = [
    entrar(mesero.id, '9999'),
    entrar('00000000-0000-0000-0000-000000000000', '1111'),
    entrar(inactivo.id, '4444'),
    entrar(sinPin.id, '0000'),
  ];
  for (const r of await Promise.all(casos)) {
    expect(r.statusCode).toBe(401);
    expect(r.json()).toEqual({ error: 'PIN incorrecto', codigo: 'pin_incorrecto' });
    expect(r.headers['set-cookie']).toBeUndefined();
  }
  await ctx.sql`UPDATE dispositivo SET intentos_fallidos = 0 WHERE id = ${aparato.dispositivo.id}`;
});

test('validación de tipos: usuario_id mal formado, pin como número, cuerpo que no es objeto y sin cuerpo dan 400', async () => {
  expect((await entrar('no-es-uuid', '1111')).statusCode).toBe(400);
  expect((await entrar(mesero.id, 1111)).statusCode).toBe(400);
  expect((await entrar(mesero.id, '111')).statusCode).toBe(400);
  const texto = await ctx.app.inject({ method: 'POST', url: '/api/sesion', ...desdeAparato({ headers: { cookie: aparato.cookie, 'content-type': 'application/json' } }), payload: '"texto"' } as any);
  expect(texto.statusCode).toBe(400);
  const sinCuerpo = await ctx.app.inject({ method: 'POST', url: '/api/sesion', ...desdeAparato() });
  expect(sinCuerpo.statusCode).toBe(400);
  // Ninguno de estos cuenta como intento fallido.
  const [d] = await ctx.sql`SELECT intentos_fallidos FROM dispositivo WHERE id = ${aparato.dispositivo.id}`;
  expect(d.intentos_fallidos).toBe(0);
});

test('dos usuarios con el mismo PIN entran cada uno como sí mismo', async () => {
  const uno = await crearUsuarioDePrueba(ctx.db, 'Gemelo uno', 'mesero', '7777');
  const dos = await crearUsuarioDePrueba(ctx.db, 'Gemelo dos', 'caja', '7777');
  const r1 = await entrar(uno.id, '7777');
  const r2 = await entrar(dos.id, '7777');
  expect(r1.json().usuario.nombre).toBe('Gemelo uno');
  expect(r2.json().usuario.nombre).toBe('Gemelo dos');
});

test('GET /api/sesion dice quién está dentro; sin cookie o con la sesión de otro aparato responde 401', async () => {
  const r = await entrar(caja.id, '2222');
  const cookie = cookieSesionDe(r);
  const yo = await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookie) });
  expect(yo.statusCode).toBe(200);
  expect(yo.json().usuario).toMatchObject({ id: caja.id, rol: 'caja' });
  expect(yo.json().expira_en).not.toBeNull();

  const sin = await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...desdeAparato() });
  expect(sin.statusCode).toBe(401);
  expect(sin.json().codigo).toBe('sin_sesion');

  // La misma cookie de sesión desde otro aparato autorizado: no vale.
  const otro = await autorizarDispositivoDePrueba(ctx.db, 'Otro celular');
  const robada = await ctx.app.inject({ method: 'GET', url: '/api/sesion', remoteAddress: IP_REMOTA, headers: { cookie: `${otro.cookie}; ${cookie}` } });
  expect(robada.statusCode).toBe(401);
  // Ni desde la PC de caja.
  const desdePc = await ctx.app.inject({ method: 'GET', url: '/api/sesion', headers: { cookie } });
  expect(desdePc.statusCode).toBe(401);
  // Y una sesión abierta en la PC de caja no vale desde un celular.
  const enPc = await abrirSesionDePrueba(ctx.db, caja, null);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', headers: { cookie: enPc } })).statusCode).toBe(200);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(enPc) })).statusCode).toBe(401);
});

test('expiración por inactividad: caja 30 minutos, admin 15, mesero nunca; cada petición renueva', async () => {
  const c = await entrar(caja.id, '2222');
  const cookieCaja = cookieSesionDe(c);
  await ctx.sql`UPDATE sesion SET expira_en = now() - interval '1 second' WHERE token_hash = ${huellaDe(cookieCaja)}`;
  const vencida = await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookieCaja) });
  expect(vencida.statusCode).toBe(401);
  expect(vencida.json().codigo).toBe('sin_sesion');

  const a = await entrar(adminRemoto.id, '3333');
  const cookieAdmin = cookieSesionDe(a);
  await ctx.sql`UPDATE sesion SET expira_en = now() + interval '1 minute' WHERE token_hash = ${huellaDe(cookieAdmin)}`;
  const renovada = await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookieAdmin) });
  expect(renovada.statusCode).toBe(200);
  const restante = new Date(renovada.json().expira_en).getTime() - Date.now();
  expect(restante).toBeGreaterThan(14 * 60000);

  const m = await entrar(mesero.id, '1111');
  const cookieMesero = cookieSesionDe(m);
  await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookieMesero) });
  const [fila] = await ctx.sql`SELECT expira_en FROM sesion WHERE token_hash = ${huellaDe(cookieMesero)}`;
  expect(fila.expira_en).toBeNull();
});

test('un usuario desactivado deja de poder usar su sesión', async () => {
  const u = await crearUsuarioDePrueba(ctx.db, 'Temporal', 'mesero', '5555');
  const cookie = cookieSesionDe(await entrar(u.id, '5555'));
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookie) })).statusCode).toBe(200);
  const off = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/usuarios/${u.id}`, payload: { activo: false } });
  expect(off.statusCode).toBe(200);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookie) })).statusCode).toBe(401);
});

test('salir cierra la sesión, borra la cookie y la siguiente petición responde 401', async () => {
  const cookie = cookieSesionDe(await entrar(caja.id, '2222'));
  const salir = await ctx.app.inject({ method: 'DELETE', url: '/api/sesion', ...conSesion(cookie) });
  expect(salir.statusCode).toBe(204);
  const set = salir.headers['set-cookie'];
  expect(String(Array.isArray(set) ? set[0] : set)).toContain('sesion=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookie) })).statusCode).toBe(401);
  // Salir sin sesión viva responde 401 (la ruta exige sesión); la pantalla lo ignora.
  expect((await ctx.app.inject({ method: 'DELETE', url: '/api/sesion', ...conSesion(cookie) })).statusCode).toBe(401);
  // El aparato sigue autorizado: salir no toca la cookie del dispositivo.
  expect((await ctx.app.inject({ method: 'GET', url: '/api/estado', ...desdeAparato() })).statusCode).toBe(200);
});

test('5 fallos bloquean el aparato 5 minutos: el sexto responde 429 aunque el PIN sea correcto; pasado el bloqueo entra y el contador vuelve a 0', async () => {
  const otro = await autorizarDispositivoDePrueba(ctx.db, 'Celular con fallos');
  const desdeOtro = { remoteAddress: IP_REMOTA, headers: { cookie: otro.cookie } };
  for (let i = 1; i <= 5; i++) {
    const r = await entrar(mesero.id, '0000', desdeOtro);
    expect(r.statusCode, `fallo ${i}`).toBe(401);
  }
  const sexto = await entrar(mesero.id, '1111', desdeOtro);
  expect(sexto.statusCode).toBe(429);
  expect(sexto.json()).toEqual({ error: 'Demasiados intentos. Espera 5 minutos.', codigo: 'dispositivo_bloqueado' });
  const intentos = await ctx.sql`SELECT usuario_id FROM intento_fallido WHERE dispositivo_id = ${otro.dispositivo.id}`;
  expect(intentos).toHaveLength(5);
  expect(intentos.every((i) => i.usuario_id === mesero.id)).toBe(true);
  // El bloqueo aparece en la lista de admin.
  const lista = (await ctx.app.inject({ method: 'GET', url: '/api/admin/dispositivos' })).json();
  expect(lista.intentos_fallidos.filter((i: { dispositivo: string }) => i.dispositivo === 'Celular con fallos')).toHaveLength(5);
  expect(lista.intentos_fallidos[0]).toMatchObject({ dispositivo: 'Celular con fallos', usuario: 'Ana' });

  await ctx.sql`UPDATE dispositivo SET bloqueado_hasta = now() - interval '1 second' WHERE id = ${otro.dispositivo.id}`;
  const entra = await entrar(mesero.id, '1111', desdeOtro);
  expect(entra.statusCode).toBe(201);
  const [d] = await ctx.sql`SELECT intentos_fallidos, bloqueado_hasta FROM dispositivo WHERE id = ${otro.dispositivo.id}`;
  expect(d).toEqual({ intentos_fallidos: 0, bloqueado_hasta: null });
});

test('entrar bien reinicia el contador: 4 fallos, un acierto y 4 fallos más no bloquean', async () => {
  const otro = await autorizarDispositivoDePrueba(ctx.db, 'Celular distraído');
  const desdeOtro = { remoteAddress: IP_REMOTA, headers: { cookie: otro.cookie } };
  for (let i = 0; i < 4; i++) await entrar(mesero.id, '0000', desdeOtro);
  expect((await entrar(mesero.id, '1111', desdeOtro)).statusCode).toBe(201);
  for (let i = 0; i < 4; i++) await entrar(mesero.id, '0000', desdeOtro);
  expect((await entrar(mesero.id, '1111', desdeOtro)).statusCode).toBe(201);
});

test('la PC de caja también se bloquea a los 5 fallos, con intentos registrados sin dispositivo', async () => {
  reiniciarBloqueoLocal();
  const local = { headers: { cookie: '' } };
  for (let i = 1; i <= 5; i++) expect((await entrar(caja.id, '0000', local)).statusCode).toBe(401);
  const sexto = await entrar(caja.id, '2222', local);
  expect(sexto.statusCode).toBe(429);
  const locales = await ctx.sql`SELECT id FROM intento_fallido WHERE dispositivo_id IS NULL AND usuario_id = ${caja.id}`;
  expect(locales).toHaveLength(5);
  const lista = (await ctx.app.inject({ method: 'GET', url: '/api/admin/dispositivos' })).json();
  expect(lista.intentos_fallidos.some((i: { dispositivo: string; usuario: string }) => i.dispositivo === 'PC de caja' && i.usuario === 'Beto')).toBe(true);
  reiniciarBloqueoLocal();
  expect((await entrar(caja.id, '2222', local)).statusCode).toBe(201);
});

test('cerrarSesionesDeRol cierra las de mesero y deja vivas las de caja y admin (regla 29, la llama cerrar jornada)', async () => {
  const cookieMesero = cookieSesionDe(await entrar(mesero.id, '1111'));
  const cookieCaja = cookieSesionDe(await entrar(caja.id, '2222'));
  const cookieAdmin = cookieSesionDe(await entrar(adminRemoto.id, '3333'));
  const cerradas = await cerrarSesionesDeRol(ctx.db, 'mesero');
  expect(cerradas).toBeGreaterThanOrEqual(1);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookieMesero) })).statusCode).toBe(401);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookieCaja) })).statusCode).toBe(200);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookieAdmin) })).statusCode).toBe(200);
  expect(await cerrarSesionesDeRol(ctx.db, 'mesero')).toBe(0);
});

test('las rutas de admin exigen sesión: sin cookie responden 401 desde la PC de caja', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/admin/usuarios', headers: { cookie: '' } });
  expect(r.statusCode).toBe(401);
  expect(r.json().codigo).toBe('sin_sesion');
});
```
- [ ] **Step 3: Reescribir `tests/guardia.test.ts` con el barrido de las tres capas**

Contenido completo (reemplaza el de Task 3):
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';
import { IP_REMOTA, abrirSesionDePrueba, autorizarDispositivoDePrueba, crearUsuarioDePrueba } from './ayuda/acceso';
import { crearApp } from '../src/servidor/app';
import { ROLES, type Rol } from '../src/compartido/roles';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
let aparato: Awaited<ReturnType<typeof autorizarDispositivoDePrueba>>;
const usuarios = {} as Record<Rol, Awaited<ReturnType<typeof crearUsuarioDePrueba>>>;

beforeAll(async () => {
  ctx = await crearAppDePrueba();
  aparato = await autorizarDispositivoDePrueba(ctx.db, 'Aparato del barrido');
  for (const rol of ROLES) usuarios[rol] = await crearUsuarioDePrueba(ctx.db, `Barrido ${rol}`, rol);
});
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

// Lista blanca de la spec, sección 3.1, escrita aquí a propósito y no
// importada del código: si alguien exime una ruta nueva en el código sin
// añadirla aquí, esta prueba falla. Al añadir una ruta aquí hay que citar la
// sección de la spec que la exime.
const EXENTAS_DE_DISPOSITIVO = new Set([
  'GET /api/instalacion', 'POST /api/instalacion',
  'POST /api/dispositivos/solicitar', 'GET /api/dispositivos/estado',
]);
const EXENTAS_DE_SESION = new Set([
  ...EXENTAS_DE_DISPOSITIVO,
  'GET /api/sesion/usuarios', 'POST /api/sesion',
  'GET /api/estado', 'GET /api/catalogo',
  'GET /api/eventos',
  // Plan 3, cocina (spec 3.1): 'GET /api/cocina/rondas', 'POST /api/rondas/:id/lista'. Se añaden cuando existan.
]);

const conUuid = (url: string) => url.replace(/:[a-zA-Z]+/g, '00000000-0000-0000-0000-000000000000');
const rutasSinHead = () => ctx.app.rutasApi.filter((r) => r.metodo !== 'HEAD');

test('toda ruta bajo /api queda registrada con su acceso', () => {
  const rutas = ctx.app.rutasApi;
  expect(rutas.length).toBeGreaterThan(10);
  for (const r of rutas) expect(r.acceso, `${r.metodo} ${r.url}`).toBeDefined();
});

test('registrar una ruta bajo /api sin declarar acceso falla al arrancar', async () => {
  const appPrueba = await crearApp({ db: ctx.db });
  expect(() => appPrueba.get('/api/prueba/sin-acceso', async () => ({}))).toThrow('no declara acceso');
  expect(() => appPrueba.get('/prueba-libre', async () => ({}))).not.toThrow();
  await appPrueba.close();
});

test('barrido capa 1: ninguna ruta bajo /api responde a un aparato sin autorizar, salvo la lista blanca 3.1', async () => {
  for (const r of rutasSinHead()) {
    const clave = `${r.metodo} ${r.url}`;
    if (EXENTAS_DE_DISPOSITIVO.has(clave)) {
      expect(r.acceso.dispositivo, clave).toBe(false);
      continue;
    }
    expect(r.acceso.dispositivo, `${clave} debería exigir dispositivo`).toBe(true);
    const res = await ctx.app.inject({ method: r.metodo as any, url: conUuid(r.url), remoteAddress: IP_REMOTA, headers: { cookie: '' } });
    expect(res.statusCode, clave).toBe(403);
    expect(res.json().codigo, clave).toBe('dispositivo_no_autorizado');
  }
});

test('barrido capa 2: ninguna ruta bajo /api responde con aparato autorizado pero sin sesión, salvo la lista blanca 3.1', async () => {
  for (const r of rutasSinHead()) {
    const clave = `${r.metodo} ${r.url}`;
    if (EXENTAS_DE_SESION.has(clave)) {
      expect(r.acceso.sesion, clave).toBe(false);
      continue;
    }
    expect(r.acceso.sesion, `${clave} debería exigir sesión`).toBe(true);
    const res = await ctx.app.inject({ method: r.metodo as any, url: conUuid(r.url), remoteAddress: IP_REMOTA, headers: { cookie: aparato.cookie } });
    expect(res.statusCode, clave).toBe(401);
    expect(res.json().codigo, clave).toBe('sin_sesion');
  }
});

test('barrido capa 3: cada rol contra cada ruta con roles; lo que no le toca responde 403 sin ejecutar nada, lo que le toca no responde 401 ni 403; ninguna respuesta lleva pin_hash', async () => {
  const conRoles = rutasSinHead().filter((r) => r.acceso.sesion);
  expect(conRoles.length).toBeGreaterThan(5);
  for (const r of conRoles) {
    if (!r.acceso.sesion) continue;
    const clave = `${r.metodo} ${r.url}`;
    for (const rol of ROLES) {
      // Sesión nueva por petición: DELETE /api/sesion cierra la que usa.
      const cookieSesion = await abrirSesionDePrueba(ctx.db, usuarios[rol], aparato.dispositivo.id);
      const res = await ctx.app.inject({ method: r.metodo as any, url: conUuid(r.url), remoteAddress: IP_REMOTA, headers: { cookie: `${aparato.cookie}; ${cookieSesion}` } });
      expect(res.body, `${clave} como ${rol}`).not.toContain('pin_hash');
      if (r.acceso.roles.includes(rol)) {
        expect([401, 403], `${clave} como ${rol} debería pasar el guardia`).not.toContain(res.statusCode);
      } else {
        expect(res.statusCode, `${clave} como ${rol} debería ser 403`).toBe(403);
        expect(res.json().codigo, `${clave} como ${rol}`).toBe('sin_permiso');
      }
    }
  }
});

test('las rutas bajo /api/admin/ son solo de admin', () => {
  for (const r of rutasSinHead().filter((x) => x.url.startsWith('/api/admin/'))) {
    expect(r.acceso.sesion && r.acceso.roles, `${r.metodo} ${r.url}`).toEqual(['admin']);
  }
});

test('una ruta que no existe bajo /api también exige dispositivo y sesión', async () => {
  expect((await ctx.app.inject({ method: 'GET', url: '/api/no-existe', remoteAddress: IP_REMOTA, headers: { cookie: '' } })).statusCode).toBe(403);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/no-existe', remoteAddress: IP_REMOTA, headers: { cookie: aparato.cookie } })).statusCode).toBe(401);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/no-existe' })).statusCode).toBe(404);
});
```

- [ ] **Step 4: Adaptar `tests/usuarios.test.ts` al admin de prueba**

Con el admin de prueba creado en `crearAppDePrueba`, dos pruebas cambian:
- En `'crear, listar, editar y desactivar usuarios; nunca sale el PIN'`: `expect(l.json()).toHaveLength(1);` → `expect(l.json()).toHaveLength(2);` (Carlos y el admin de prueba).
- Reemplazar las dos pruebas de la regla 27 (`'el único admin activo no se puede desactivar ni cambiar de rol'` y `'carrera determinista: dos desactivaciones...'`) por estas, que usan `ctx.admin` como único admin de partida y nunca lo desactivan (su sesión es la que usan todas las peticiones):
```ts
test('el único admin activo no se puede desactivar ni cambiar de rol', async () => {
  const id = ctx.admin.id;
  const desactivar = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { activo: false } });
  expect(desactivar.statusCode).toBe(409);
  expect(desactivar.json().error).toBe('No se puede desactivar ni cambiar de rol al último administrador activo');
  const cambiarRol = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { rol: 'caja' } });
  expect(cambiarRol.statusCode).toBe(409);
  const renombrar = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { nombre: 'Admin principal' } });
  expect(renombrar.statusCode).toBe(200);
  // Con un segundo admin, ese segundo se puede desactivar; entonces el primero vuelve a ser el último.
  const b = await crear('Admin dos', 'admin');
  const desactivarB = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${b.json().id}`, payload: { activo: false } });
  expect(desactivarB.statusCode).toBe(200);
  const desactivarA = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${id}`, payload: { activo: false } });
  expect(desactivarA.statusCode).toBe(409);
  const reactivarB = await ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${b.json().id}`, payload: { activo: true } });
  expect(reactivarB.statusCode).toBe(200);
});

test('carrera determinista: dos desactivaciones simultáneas de los dos únicos admins dejan al menos uno activo', async () => {
  const lista = (await ctx.app.inject({ method: 'GET', url: RUTA })).json() as { id: string; rol: string; activo: boolean }[];
  const admins = lista.filter((u) => u.rol === 'admin' && u.activo);
  expect(admins).toHaveLength(2);
  const a = ctx.admin;
  const b = admins.find((u) => u.id !== a.id)!;
  // Una transacción externa toma el bloqueo de la fila de B, se lanza el PATCH
  // que desactiva a A sin esperarlo, se desactiva a B dentro de la transacción
  // externa y se confirma. Con el código correcto, el PATCH bloquea a TODOS
  // los admins activos (incluido B) y espera; al retomar vuelve a leer, ve que
  // B ya no está activo y responde 409. Con un código que solo contara admins
  // sin bloquearlos, el PATCH leería "2 activos" de inmediato y desactivaría a
  // A: el sistema quedaría sin admin. Esta prueba debe fallar con ese código.
  let patchPromise: Promise<{ statusCode: number; json: () => any }> | null = null;
  await ctx.sql.begin(async (tx) => {
    await tx`SELECT id FROM usuario WHERE id = ${b.id} FOR UPDATE`;
    patchPromise = Promise.resolve(ctx.app.inject({ method: 'PATCH', url: `${RUTA}/${a.id}`, payload: { activo: false } }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    await tx`UPDATE usuario SET activo = false, actualizado_en = now() WHERE id = ${b.id}`;
  });
  const r = await patchPromise!;
  expect(r.statusCode).toBe(409);
  const [filaA] = await ctx.sql`SELECT activo FROM usuario WHERE id = ${a.id}`;
  expect(filaA.activo).toBe(true);
  await ctx.sql`UPDATE usuario SET activo = true WHERE id = ${b.id}`;
});
```

- [ ] **Step 5: Ejecutar para ver que falla**

Run: `npm test -- tests/sesiones.test.ts tests/guardia.test.ts`
Expected: FAIL, no encuentra `src/servidor/modulos/sesiones` (y `tests/ayuda/app.ts` tampoco).

- [ ] **Step 6: Escribir `sesiones.ts`**

`src/servidor/modulos/sesiones.ts`:
```ts
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, Tx } from '../db/conexion';
import { intentoFallido, sesion, usuario } from '../db/schema';
import { ErrorAcceso, exigirObjeto, exigirUuid } from '../errores';
import type { Rol } from '../../compartido/roles';
import { publico, type Usuario, type UsuarioPublico } from './usuarios';
import { HASH_SENUELO, exigirPin, verificarPin } from '../seguridad/pin';
import { generarToken, huellaToken } from '../seguridad/tokens';
import { NOMBRE_COOKIE_SESION, cookieBorrada, cookieSesion, leerCookies } from '../seguridad/cookies';
import { BLOQUEO_MIN, MAXIMO_FALLOS, registrarFalloDeDispositivo, reiniciarFallosDeDispositivo, type Dispositivo } from './dispositivos';
import { SOLO_DISPOSITIVO, TODOS } from '../seguridad/acceso';

export type Sesion = typeof sesion.$inferSelect;
export type SesionViva = { sesion: Sesion; usuario: UsuarioPublico };

// Spec 2 y 4.3: caja 30 minutos de inactividad, admin 15, mesero nunca (su
// sesión la cierra "Salir" o el cierre de la jornada).
export const DURACION_SESION_MIN: Record<Rol, number | null> = { mesero: null, caja: 30, admin: 15 };

function expiracionPara(rol: Rol): Date | null {
  const minutos = DURACION_SESION_MIN[rol];
  return minutos === null ? null : new Date(Date.now() + minutos * 60000);
}

// Lista para el teclado de PIN: activos con PIN, y solo id, nombre y rol.
export async function listarUsuariosParaEntrar(db: Db) {
  return db.select({ id: usuario.id, nombre: usuario.nombre, rol: usuario.rol }).from(usuario)
    .where(and(eq(usuario.activo, true), isNotNull(usuario.pin_hash)))
    .orderBy(asc(usuario.nombre));
}

// Abre una sesión para un usuario YA verificado. La llaman iniciarSesion
// (después del PIN), la instalación inicial (Task 5) y las pruebas.
export async function abrirSesion(db: Db | Tx, u: Usuario | UsuarioPublico, dispositivoId: string | null): Promise<{ token: string; sesion: Sesion }> {
  const token = generarToken();
  const [s] = await db.insert(sesion).values({
    usuario_id: u.id,
    dispositivo_id: dispositivoId,
    token_hash: huellaToken(token),
    expira_en: expiracionPara(u.rol),
  }).returning();
  return { token, sesion: s };
}

// Bloqueo de la PC de caja, que no tiene fila de dispositivo: mismo criterio
// (5 fallos, 5 minutos), en memoria del proceso. Se pierde al reiniciar el
// servidor, y reiniciarlo exige acceso físico a esa máquina. Los intentos sí
// quedan en intento_fallido con dispositivo_id nulo, para que admin los vea.
const bloqueoLocal = { fallos: 0, hasta: null as Date | null };

export function reiniciarBloqueoLocal() {
  bloqueoLocal.fallos = 0;
  bloqueoLocal.hasta = null;
}

function exigirNoBloqueado(dispositivo: Dispositivo | null) {
  const hasta = dispositivo ? dispositivo.bloqueado_hasta : bloqueoLocal.hasta;
  if (hasta && hasta.getTime() > Date.now()) {
    throw new ErrorAcceso(429, `Demasiados intentos. Espera ${BLOQUEO_MIN} minutos.`, 'dispositivo_bloqueado');
  }
}

async function registrarFallo(db: Db, dispositivo: Dispositivo | null, usuarioId: string | null) {
  if (dispositivo) {
    await registrarFalloDeDispositivo(db, dispositivo.id, usuarioId);
    return;
  }
  await db.insert(intentoFallido).values({ dispositivo_id: null, usuario_id: usuarioId });
  bloqueoLocal.fallos += 1;
  if (bloqueoLocal.fallos >= MAXIMO_FALLOS) {
    bloqueoLocal.fallos = 0;
    bloqueoLocal.hasta = new Date(Date.now() + BLOQUEO_MIN * 60000);
  }
}

async function reiniciarFallos(db: Db, dispositivo: Dispositivo | null) {
  if (dispositivo) await reiniciarFallosDeDispositivo(db, dispositivo.id);
  else reiniciarBloqueoLocal();
}

// dispositivo: el aparato autorizado que hace la petición (req.dispositivoActual),
// o null si es la PC de caja.
export async function iniciarSesion(
  db: Db,
  datos: { usuario_id?: unknown; pin?: unknown },
  dispositivo: Dispositivo | null,
): Promise<{ token: string; sesion: Sesion; usuario: UsuarioPublico }> {
  const usuarioId = exigirUuid(datos.usuario_id, 'El usuario no es válido');
  const pin = exigirPin(datos.pin);
  exigirNoBloqueado(dispositivo);

  const [u] = await db.select().from(usuario).where(eq(usuario.id, usuarioId));
  // Mismo mensaje y mismo tiempo (scrypt contra un hash señuelo) exista o no
  // el usuario, esté activo o no, tenga PIN o no: la respuesta no delata nada
  // (spec 5.3.4). Regla 25: el PIN se compara solo contra el usuario elegido.
  const puedeEntrar = u !== undefined && u.activo && u.pin_hash !== null;
  const correcto = await verificarPin(pin, puedeEntrar ? (u.pin_hash as string) : HASH_SENUELO);
  if (!puedeEntrar || !correcto) {
    await registrarFallo(db, dispositivo, u ? u.id : null);
    throw new ErrorAcceso(401, 'PIN incorrecto', 'pin_incorrecto');
  }
  await reiniciarFallos(db, dispositivo);
  const { token, sesion: s } = await abrirSesion(db, u, dispositivo ? dispositivo.id : null);
  return { token, sesion: s, usuario: publico(u) };
}

// Capa 2 del guardia, sin escribir: la sesión del token, si no está cerrada
// ni vencida y su usuario sigue activo.
export async function buscarSesionViva(db: Db, token: string): Promise<SesionViva | null> {
  const [fila] = await db.select({ s: sesion, u: usuario }).from(sesion)
    .innerJoin(usuario, eq(sesion.usuario_id, usuario.id))
    .where(and(eq(sesion.token_hash, huellaToken(token)), isNull(sesion.cerrada_en)));
  if (!fila || !fila.u.activo) return null;
  if (fila.s.expira_en && fila.s.expira_en.getTime() <= Date.now()) return null;
  return { sesion: fila.s, usuario: publico(fila.u) };
}

// Cada petición aceptada renueva la expiración según el rol (caja 30, admin
// 15, mesero sin expiración) y anota el último uso.
export async function renovarSesion(db: Db, s: Sesion, rol: Rol): Promise<Sesion> {
  const [renovada] = await db.update(sesion).set({ ultimo_uso_en: new Date(), expira_en: expiracionPara(rol) }).where(eq(sesion.id, s.id)).returning();
  return renovada;
}

export async function cerrarSesion(db: Db, token: string) {
  await db.update(sesion).set({ cerrada_en: new Date() })
    .where(and(eq(sesion.token_hash, huellaToken(token)), isNull(sesion.cerrada_en)));
}

// Regla 29: al cerrar la jornada (plan 2, módulo jornada) se cierran todas las
// sesiones de rol mesero, dentro de la misma transacción del cierre.
export async function cerrarSesionesDeRol(db: Db | Tx, rol: Rol): Promise<number> {
  const filas = await db.update(sesion).set({ cerrada_en: new Date() })
    .where(and(isNull(sesion.cerrada_en), sql`${sesion.usuario_id} IN (SELECT ${usuario.id} FROM ${usuario} WHERE ${usuario.rol} = ${rol})`))
    .returning({ id: sesion.id });
  return filas.length;
}

export function rutasSesion(app: FastifyInstance) {
  app.get('/api/sesion/usuarios', { config: { acceso: SOLO_DISPOSITIVO } }, async () => listarUsuariosParaEntrar(app.db));
  app.post('/api/sesion', { config: { acceso: SOLO_DISPOSITIVO } }, async (req, reply) => {
    const datos = exigirObjeto(req.body);
    const { token, sesion: s, usuario: u } = await iniciarSesion(app.db, datos, req.dispositivoActual);
    reply.header('set-cookie', cookieSesion(token));
    // El token también va en el cuerpo (spec sección 7); la pantalla usa la cookie.
    return reply.status(201).send({ token, usuario: u, expira_en: s.expira_en });
  });
  app.get('/api/sesion', { config: { acceso: TODOS } }, async (req) => ({
    usuario: req.usuarioActual,
    expira_en: req.sesionActual?.expira_en ?? null,
  }));
  app.delete('/api/sesion', { config: { acceso: TODOS } }, async (req, reply) => {
    const token = leerCookies(req.headers.cookie)[NOMBRE_COOKIE_SESION];
    if (token) await cerrarSesion(app.db, token);
    // Solo se borra la cookie de sesión: el aparato sigue autorizado (spec 5.4).
    reply.header('set-cookie', cookieBorrada(NOMBRE_COOKIE_SESION));
    return reply.status(204).send();
  });
}
```

- [ ] **Step 7: Completar el guardia con las capas 2 y 3**

`src/servidor/seguridad/guardia.ts`, contenido completo (reemplaza el de Task 3):
```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ADMIN, type Acceso } from './acceso';
import { ErrorAcceso } from '../errores';
import { NOMBRE_COOKIE_DISPOSITIVO, NOMBRE_COOKIE_SESION, leerCookies } from './cookies';
import { buscarDispositivoAutorizado, type Dispositivo } from '../modulos/dispositivos';
import type { UsuarioPublico } from '../modulos/usuarios';
import { buscarSesionViva, renovarSesion, type Sesion } from '../modulos/sesiones';

export type RutaApi = { metodo: string; url: string; acceso: Acceso };

declare module 'fastify' {
  interface FastifyInstance {
    rutasApi: RutaApi[];
  }
  interface FastifyRequest {
    dispositivoActual: Dispositivo | null;
    usuarioActual: UsuarioPublico | null;
    sesionActual: Sesion | null;
  }
}

// La PC de caja habla con el servidor por la interfaz local. Fastify no
// confía en x-forwarded-for (trustProxy en false), así que req.ip es la
// dirección real del socket y nadie puede fingir ser local desde la red.
const IPS_LOCALES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function esLocal(req: FastifyRequest): boolean {
  return IPS_LOCALES.has(req.ip);
}

export function exigirLocal(req: FastifyRequest) {
  if (!esLocal(req)) throw new ErrorAcceso(403, 'Esta operación solo se puede hacer desde la PC de caja', 'solo_local');
}

// Para los handlers de rutas con roles: el usuario que la capa 2 identificó.
// Si falta, la ruta está mal declarada (no exige sesión) y es un error del
// programa, no del cliente.
export function usuarioDe(req: FastifyRequest): UsuarioPublico {
  if (!req.usuarioActual) throw new Error(`La ruta ${req.method} ${req.url} usa usuarioDe() pero no exige sesión en config.acceso`);
  return req.usuarioActual;
}

// El guardia único (spec sección 3). Se registra ANTES que cualquier ruta.
//  - onRoute: cada ruta bajo /api/ debe declarar config.acceso; si no, el
//    arranque falla. Así una ruta nueva nunca nace abierta por olvido.
//  - onRequest: capa 1 (dispositivo), capa 2 (sesión) y capa 3 (rol), en
//    ese orden, antes de leer el cuerpo y antes del handler.
export function registrarGuardia(app: FastifyInstance) {
  app.decorate('rutasApi', []);
  app.decorateRequest('dispositivoActual', null);
  app.decorateRequest('usuarioActual', null);
  app.decorateRequest('sesionActual', null);

  app.addHook('onRoute', (ruta) => {
    if (!ruta.url.startsWith('/api/')) return;
    const metodos = Array.isArray(ruta.method) ? ruta.method : [ruta.method];
    const acceso = ruta.config?.acceso;
    if (!acceso) throw new Error(`La ruta ${metodos.join(',')} ${ruta.url} no declara acceso (config.acceso). Toda ruta bajo /api/ debe declararlo.`);
    for (const metodo of metodos) app.rutasApi.push({ metodo, url: ruta.url, acceso });
  });

  app.addHook('onRequest', async (req) => {
    // ⚠ NO COPIAR ESTAS DOS LÍNEAS. Decidir sobre req.url crudo es el defecto
    // C1 que encontró la revisión de la Task 3 (2026-09-18): el enrutador
    // decodifica %61 → a y quita el esquema de las URL absolutas antes de
    // elegir la ruta, así que /%61pi/... evadía el guardia. Lo correcto, ya en
    // src/servidor/seguridad/guardia.ts: const acceso = accesoExigido(req);
    // if (!acceso) return;  — ver la sección final de este plan.
    const ruta = req.url.split('?')[0];
    if (!ruta.startsWith('/api/')) return;
    // Una URL sin ruta (404) no tiene declaración: se trata como la más
    // restrictiva, así el 404 no revela nada a quien no debe estar aquí.
    const acceso: Acceso = req.routeOptions?.config?.acceso ?? ADMIN;
    const cookies = leerCookies(req.headers.cookie);

    // Capa 1: ¿el dispositivo está autorizado? La PC de caja se la salta (y
    // SOLO esta capa: el PIN se le exige igual).
    if (!esLocal(req)) {
      const token = cookies[NOMBRE_COOKIE_DISPOSITIVO];
      req.dispositivoActual = token ? await buscarDispositivoAutorizado(app.db, token) : null;
      if (acceso.dispositivo && !req.dispositivoActual) {
        throw new ErrorAcceso(403, 'Este dispositivo no está autorizado', 'dispositivo_no_autorizado');
      }
    }
    if (!acceso.sesion) return;

    // Capa 2: ¿hay sesión viva? Y atada al aparato donde se abrió: una
    // abierta en la PC de caja (dispositivo_id nulo) solo vale desde la PC de
    // caja; una abierta en un celular solo vale desde ese celular. Copiar la
    // cookie a otro aparato no sirve.
    const sinSesion = () => new ErrorAcceso(401, 'Tu sesión no está iniciada o venció; escribe tu PIN', 'sin_sesion');
    const tokenSesion = cookies[NOMBRE_COOKIE_SESION];
    const viva = tokenSesion ? await buscarSesionViva(app.db, tokenSesion) : null;
    if (!viva) throw sinSesion();
    const aparatoEsperado = viva.sesion.dispositivo_id;
    const coincide = aparatoEsperado === null ? esLocal(req) : req.dispositivoActual?.id === aparatoEsperado;
    if (!coincide) throw sinSesion();

    // Capa 3: ¿el rol permite esta ruta? Responde 403 y no ejecuta nada.
    if (!acceso.roles.includes(viva.usuario.rol)) {
      throw new ErrorAcceso(403, 'No tienes permiso para esta pantalla', 'sin_permiso');
    }

    req.sesionActual = await renovarSesion(app.db, viva.sesion, viva.usuario.rol);
    req.usuarioActual = viva.usuario;
  });
}
```

En `src/servidor/app.ts`: añadir `import { rutasSesion } from './modulos/sesiones';` y, después de `rutasDispositivos(app);`, `rutasSesion(app);`.

- [ ] **Step 8: Ejecutar todo**

Run: `npm run typecheck && npm test`
Expected: sin errores de tipos; 0 failed. Todas las pruebas del plan 1 pasan porque `crearAppDePrueba` mete la cookie del admin de prueba en cada `inject`. Nuevas: 14 en `sesiones.test.ts`, 7 en `guardia.test.ts`.

Si el barrido de capa 3 falla en `POST /api/admin/productos/:id/foto` con 500: el handler llama `req.file()` sin multipart; debe responder 406 (`Se esperaba un archivo`), que ya traduce `MENSAJES_ERROR_FASTIFY`. Si responde 500, revisar que `@fastify/multipart` lance `FST_INVALID_MULTIPART_CONTENT_TYPE` con `statusCode: 406` y no cambiar el barrido.

- [ ] **Step 9: Verificar en vivo el ciclo completo desde una IP no local**

Run: `npm run dev`. En otra terminal (usa un admin que exista en la base de desarrollo; si ninguno tiene PIN, dárselo con `POST /api/admin/usuarios/:id/pin` desde 127.0.0.1... que ahora exige sesión: usar el paso siguiente, Task 5, o crear uno directo: `npx tsx -e "import('./src/servidor/db/conexion').then(async ({crearDb}) => { const {db, sql} = crearDb(process.env.DATABASE_URL ?? 'postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria'); const {crearUsuario} = await import('./src/servidor/modulos/usuarios'); console.log(await crearUsuario(db, {nombre: 'Admin vivo', rol: 'admin', pin: '2468'})); await sql.end(); })"`):
```bash
IP=$(ipconfig getifaddr en0)
curl -s -c /tmp/c.txt -X POST http://$IP:3000/api/dispositivos/solicitar     # anota espera_id
# Autorizar hace falta una sesión de admin; hasta Task 5 no hay instalación, así que se autoriza por SQL:
docker exec cafeteria-pg psql -U cafeteria -d cafeteria -c "UPDATE dispositivo SET estado='autorizado', nombre='Curl', codigo=NULL, autorizado_en=now() WHERE estado='pendiente'"
curl -s -b /tmp/c.txt http://$IP:3000/api/sesion/usuarios                       # lista con id de 'Admin vivo'
curl -s -b /tmp/c.txt -c /tmp/c.txt -X POST http://$IP:3000/api/sesion -H 'content-type: application/json' -d '{"usuario_id":"<id>","pin":"2468"}'
curl -s -b /tmp/c.txt http://$IP:3000/api/admin/usuarios | grep -c pin_hash      # 0
curl -s -b /tmp/c.txt -X DELETE -i http://$IP:3000/api/sesion | head -1          # 204
curl -s -b /tmp/c.txt -i http://$IP:3000/api/admin/usuarios | head -1            # 401
```
Expected: lo indicado en cada comentario. Limpiar: `DELETE FROM sesion; DELETE FROM intento_fallido; DELETE FROM dispositivo WHERE nombre = 'Curl'; DELETE FROM usuario WHERE nombre = 'Admin vivo'` (cuatro `docker exec ... psql -c` separados, por el aprendizaje del 2026-09-17 sobre borrados encadenados). Ctrl+C.

- [ ] **Step 10: Commit y push**

```bash
git add src/servidor/modulos/sesiones.ts src/servidor/seguridad/guardia.ts src/servidor/app.ts tests/ayuda/app.ts tests/ayuda/acceso.ts tests/sesiones.test.ts tests/guardia.test.ts tests/usuarios.test.ts
git commit -m "Sesión con PIN, expiración por rol, bloqueo por intentos y guardia completo con barrido de rutas"
git push origin main
```

---

### Task 5: Instalación inicial (solo desde 127.0.0.1, solo sin admin activo) y comando `restablecer-pin`
**Modelo ejecutor:** `claude-fable-5-1`. **Motivo:** ambas piezas crean o cambian credenciales de administrador: la instalación debe resistir dos peticiones simultáneas (dos pestañas abiertas) sin crear dos admins, y el comando de recuperación no puede quedar expuesto por red. Exige decidir, no transcribir.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`. Sondeo en vivo: `POST /api/instalacion` desde una IP no local, con `x-forwarded-for: 127.0.0.1`, con `rol: 'mesero'` en el cuerpo (debe ignorarse), y repetida.

**Files:**
- Create: `src/servidor/modulos/instalacion.ts`, `src/servidor/restablecer-pin.ts`, `tests/instalacion.test.ts`, `tests/restablecer-pin.test.ts`
- Modify: `src/servidor/app.ts` (registrar rutas), `package.json` (script)

**Interfaces:**
- Consumes: `crearUsuario`, `hayAdminActivo`, `restablecerPinAdmin` (Task 2); `abrirSesion` (Task 4); `exigirLocal`, `PUBLICO`, `cookieSesion`, `ErrorNegocio`, `exigirObjeto`.
- Produces: `estaInstalado(db): Promise<boolean>`, `instalar(db, { nombre, pin }): Promise<{ usuario: UsuarioPublico; token: string }>`, `rutasInstalacion(app)`: `GET /api/instalacion` → `{ instalado }`, `POST /api/instalacion` → 201 `{ token, usuario }` + cookie `sesion`; script npm `restablecer-pin`.
- Reglas: regla 31; 403 `solo_local` desde la red; 409 `'El sistema ya está configurado'` si ya hay admin activo; el rol del cuerpo se ignora (siempre `admin`).

- [ ] **Step 1: Escribir las pruebas**

`tests/instalacion.test.ts` (no usa `crearAppDePrueba` porque esa crea un admin; aquí hace falta una base sin admin):
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { prepararBaseDePrueba } from './ayuda/db';
import { crearApp } from '../src/servidor/app';
import { IP_REMOTA } from './ayuda/acceso';

let ctx: { app: Awaited<ReturnType<typeof crearApp>>; db: Awaited<ReturnType<typeof prepararBaseDePrueba>>['db']; sql: Awaited<ReturnType<typeof prepararBaseDePrueba>>['sql'] };
beforeAll(async () => {
  const { db, sql } = await prepararBaseDePrueba();
  const app = await crearApp({ db });
  await app.ready();
  ctx = { app, db, sql };
});
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

const instalar = (payload: unknown, extra: Record<string, unknown> = {}) =>
  ctx.app.inject({ method: 'POST', url: '/api/instalacion', payload: payload as any, ...extra } as any);

test('sin admin activo, GET dice instalado: false desde la PC de caja y 403 desde la red', async () => {
  const local = await ctx.app.inject({ method: 'GET', url: '/api/instalacion' });
  expect(local.statusCode).toBe(200);
  expect(local.json()).toEqual({ instalado: false });
  const remoto = await ctx.app.inject({ method: 'GET', url: '/api/instalacion', remoteAddress: IP_REMOTA });
  expect(remoto.statusCode).toBe(403);
  expect(remoto.json().codigo).toBe('solo_local');
  const fingido = await ctx.app.inject({ method: 'GET', url: '/api/instalacion', remoteAddress: IP_REMOTA, headers: { 'x-forwarded-for': '127.0.0.1' } });
  expect(fingido.statusCode).toBe(403);
});

test('POST desde la red responde 403 sin crear nada', async () => {
  const r = await instalar({ nombre: 'Intruso', pin: '1234' }, { remoteAddress: IP_REMOTA });
  expect(r.statusCode).toBe(403);
  expect(await ctx.sql`SELECT id FROM usuario`).toHaveLength(0);
});

test('POST valida tipos antes que nada: sin cuerpo, cuerpo que no es objeto, nombre o pin con tipo equivocado', async () => {
  expect((await ctx.app.inject({ method: 'POST', url: '/api/instalacion' })).statusCode).toBe(400);
  expect((await ctx.app.inject({ method: 'POST', url: '/api/instalacion', headers: { 'content-type': 'application/json' }, payload: '"texto"' })).statusCode).toBe(400);
  expect((await instalar({ nombre: 7, pin: '1234' })).statusCode).toBe(400);
  expect((await instalar({ nombre: 'Dave', pin: 1234 })).statusCode).toBe(400);
  expect((await instalar({ nombre: 'Dave', pin: '12' })).statusCode).toBe(400);
  expect((await instalar({ nombre: '  ', pin: '1234' })).statusCode).toBe(400);
  expect(await ctx.sql`SELECT id FROM usuario`).toHaveLength(0);
});

test('carrera determinista: dos instalaciones a la vez crean un solo admin', async () => {
  // Una transacción externa toma el mismo bloqueo consultivo que usa instalar();
  // se lanza el POST sin esperarlo (queda esperando el bloqueo); dentro de la
  // transacción externa se crea un admin; se confirma. El POST retoma, ve el
  // admin y responde 409. Sin el bloqueo, el POST leería "no hay admin" de
  // inmediato y crearía un segundo: esta prueba debe fallar con ese código.
  let postPromise: Promise<{ statusCode: number; json: () => any }> | null = null;
  await ctx.sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(20260917)`;
    postPromise = Promise.resolve(instalar({ nombre: 'Segundo', pin: '1234' }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    await tx`INSERT INTO usuario (nombre, rol, pin_hash) VALUES ('Primero', 'admin', 'x:y')`;
  });
  const r = await postPromise!;
  expect(r.statusCode).toBe(409);
  expect(r.json().error).toBe('El sistema ya está configurado');
  expect(await ctx.sql`SELECT id FROM usuario WHERE rol = 'admin'`).toHaveLength(1);
  await ctx.sql`DELETE FROM usuario WHERE nombre = 'Primero'`;
});

test('POST crea el primer admin (ignorando cualquier rol del cuerpo), abre su sesión y deja el sistema instalado; repetir responde 409', async () => {
  const r = await instalar({ nombre: 'Dave', pin: '2468', rol: 'mesero' });
  expect(r.statusCode).toBe(201);
  expect(r.json().usuario).toMatchObject({ nombre: 'Dave', rol: 'admin', activo: true, tiene_pin: true });
  expect(JSON.stringify(r.json())).not.toContain('pin_hash');
  expect(r.json().token).toMatch(/^[0-9a-f]{64}$/);
  const set = r.headers['set-cookie'];
  const cookie = String(Array.isArray(set) ? set[0] : set).split(';')[0];
  expect(cookie).toMatch(/^sesion=[0-9a-f]{64}$/);

  const yo = await ctx.app.inject({ method: 'GET', url: '/api/sesion', headers: { cookie } });
  expect(yo.statusCode).toBe(200);
  expect(yo.json().usuario.nombre).toBe('Dave');
  const admin = await ctx.app.inject({ method: 'GET', url: '/api/admin/usuarios', headers: { cookie } });
  expect(admin.statusCode).toBe(200);

  expect((await ctx.app.inject({ method: 'GET', url: '/api/instalacion' })).json()).toEqual({ instalado: true });
  const otraVez = await instalar({ nombre: 'Otro', pin: '1234' });
  expect(otraVez.statusCode).toBe(409);
  expect(otraVez.json().error).toBe('El sistema ya está configurado');
  expect(await ctx.sql`SELECT id FROM usuario`).toHaveLength(1);
});

test('si no queda ningún admin activo, la instalación vuelve a estar disponible', async () => {
  await ctx.sql`UPDATE usuario SET activo = false WHERE rol = 'admin'`;
  expect((await ctx.app.inject({ method: 'GET', url: '/api/instalacion' })).json()).toEqual({ instalado: false });
  const r = await instalar({ nombre: 'Dave de nuevo', pin: '1357' });
  expect(r.statusCode).toBe(201);
});
```

`tests/restablecer-pin.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { crearAppDePrueba } from './ayuda/app';
import { verificarPin } from '../src/servidor/seguridad/pin';

const ejecutar = promisify(execFile);
const URL = process.env.DATABASE_URL_TEST ?? 'postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria_test';
const TSX = join('node_modules', '.bin', 'tsx');

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

// El comando lee DATABASE_URL; dotenv no pisa una variable que ya viene en el entorno.
const correr = (args: string[]) => ejecutar(TSX, ['src/servidor/restablecer-pin.ts', ...args], { env: { ...process.env, DATABASE_URL: URL } });

test('el comando escribe el PIN nuevo del administrador y avisa por consola', async () => {
  const { stdout } = await correr(['--nombre', 'admin de prueba', '--pin', '9876']);
  expect(stdout).toContain('PIN restablecido para Admin de prueba');
  const [fila] = await ctx.sql`SELECT pin_hash FROM usuario WHERE id = ${ctx.admin.id}`;
  expect(await verificarPin('9876', fila.pin_hash)).toBe(true);
  expect(await verificarPin('1234', fila.pin_hash)).toBe(false);
});

test('con un nombre que no es de un admin activo, o un PIN inválido, termina con código 1 y el motivo', async () => {
  const nadie = await correr(['--nombre', 'Nadie', '--pin', '9876']).catch((e) => e);
  expect(nadie.code).toBe(1);
  expect(nadie.stderr).toContain('No hay un administrador activo llamado "Nadie"');
  const pinMalo = await correr(['--nombre', 'Admin de prueba', '--pin', '98']).catch((e) => e);
  expect(pinMalo.code).toBe(1);
  expect(pinMalo.stderr).toContain('El PIN debe tener exactamente 4 dígitos');
});
```

- [ ] **Step 2: Ejecutar para ver que fallan**

Run: `npm test -- tests/instalacion.test.ts tests/restablecer-pin.test.ts`
Expected: FAIL: `GET /api/instalacion` desde 127.0.0.1 responde 401 (la ruta no existe todavía y el guardia trata una URL sin ruta como de admin) en vez de 200; el comando `restablecer-pin` no existe (tsx falla al no encontrar el archivo).

- [ ] **Step 3: Escribir `instalacion.ts` y registrar sus rutas**

`src/servidor/modulos/instalacion.ts`:
```ts
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { ErrorNegocio, exigirObjeto } from '../errores';
import { PUBLICO } from '../seguridad/acceso';
import { exigirLocal } from '../seguridad/guardia';
import { cookieSesion } from '../seguridad/cookies';
import { crearUsuario, hayAdminActivo, type UsuarioPublico } from './usuarios';
import { abrirSesion } from './sesiones';

// Un número fijo cualquiera para el bloqueo consultivo de PostgreSQL: solo
// tiene que ser el mismo en todas las instalaciones simultáneas.
const CERROJO_INSTALACION = 20260917;

export async function estaInstalado(db: Db): Promise<boolean> {
  return hayAdminActivo(db);
}

// Crea el primer administrador y abre su sesión desde la PC de caja. Va en
// una transacción con un bloqueo consultivo: dos instalaciones a la vez (dos
// pestañas abiertas) no pueden crear dos admins; la segunda espera, ve al
// primero y responde 409. El rol no se lee del cuerpo: siempre admin.
export async function instalar(db: Db, datos: { nombre?: unknown; pin?: unknown }): Promise<{ usuario: UsuarioPublico; token: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${CERROJO_INSTALACION})`);
    if (await hayAdminActivo(tx)) throw new ErrorNegocio('El sistema ya está configurado');
    const usuario = await crearUsuario(tx, { nombre: datos.nombre, rol: 'admin', pin: datos.pin });
    const { token } = await abrirSesion(tx, usuario, null);
    return { usuario, token };
  });
}

export function rutasInstalacion(app: FastifyInstance) {
  // Regla 31: las dos rutas solo responden desde la propia PC de caja.
  app.get('/api/instalacion', { config: { acceso: PUBLICO } }, async (req) => {
    exigirLocal(req);
    return { instalado: await estaInstalado(app.db) };
  });
  app.post('/api/instalacion', { config: { acceso: PUBLICO } }, async (req, reply) => {
    exigirLocal(req);
    const datos = exigirObjeto(req.body);
    const { usuario, token } = await instalar(app.db, datos);
    reply.header('set-cookie', cookieSesion(token));
    app.bus.emitir('config');
    return reply.status(201).send({ token, usuario });
  });
}
```

En `src/servidor/app.ts`: `import { rutasInstalacion } from './modulos/instalacion';` y `rutasInstalacion(app);` después de `rutasSesion(app);`.

- [ ] **Step 4: Escribir el comando `restablecer-pin`**

`src/servidor/restablecer-pin.ts`:
```ts
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { config } from './config';
import { crearDb } from './db/conexion';
import { restablecerPinAdmin } from './modulos/usuarios';

// Restablecer el PIN de un administrador (spec 5.5). Se ejecuta en la PC de
// caja, con acceso físico: a propósito NO existe ninguna ruta HTTP para esto.
//   npm run restablecer-pin                                  pregunta nombre y PIN
//   npm run restablecer-pin -- --nombre "Dave" --pin 4321    sin preguntas
// En el paquete de Windows (plan 4, Task 3) el lanzador ofrece esta opción.
const { values } = parseArgs({ options: { nombre: { type: 'string' }, pin: { type: 'string' } }, strict: true });
let nombre = values.nombre;
let pin = values.pin;

if (nombre === undefined || pin === undefined) {
  const rl = createInterface({ input: stdin, output: stdout });
  if (nombre === undefined) nombre = (await rl.question('Nombre del administrador: ')).trim();
  if (pin === undefined) {
    pin = (await rl.question('PIN nuevo (4 dígitos): ')).trim();
    const confirmacion = (await rl.question('Repite el PIN: ')).trim();
    if (confirmacion !== pin) {
      rl.close();
      console.error('Los PIN no coinciden. No se cambió nada.');
      process.exit(1);
    }
  }
  rl.close();
}

const { db, sql } = crearDb(config.databaseUrl);
try {
  const u = await restablecerPinAdmin(db, nombre, pin);
  console.log(`PIN restablecido para ${u.nombre}.`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
```

En `package.json`, dentro de `"scripts"`, después de `"db:migrar"`: `"restablecer-pin": "tsx src/servidor/restablecer-pin.ts"`.

- [ ] **Step 5: Ejecutar todo**

Run: `npm run typecheck && npm test`
Expected: 0 failed. Nuevas: 6 en `instalacion.test.ts`, 2 en `restablecer-pin.test.ts`. El barrido de `guardia.test.ts` ya cubre `GET/POST /api/instalacion` como exentas (están en su lista blanca).

- [ ] **Step 6: Verificar en vivo la instalación en la base de desarrollo**

La base de desarrollo tiene meseros migrados (rol `mesero`) y ningún admin, así que está "sin instalar". Run: `npm run dev`; en otra terminal:
```bash
curl -s http://127.0.0.1:3000/api/instalacion                                                       # {"instalado":false}
IP=$(ipconfig getifaddr en0); curl -s -i http://$IP:3000/api/instalacion | head -1                  # 403
curl -s -c /tmp/i.txt -X POST http://127.0.0.1:3000/api/instalacion -H 'content-type: application/json' -d '{"nombre":"Dave","pin":"2468"}'
curl -s -b /tmp/i.txt http://127.0.0.1:3000/api/admin/usuarios | head -c 200                        # lista, con Dave como admin
curl -s -X POST http://127.0.0.1:3000/api/instalacion -H 'content-type: application/json' -d '{"nombre":"Otro","pin":"1111"}'   # 409
npm run restablecer-pin -- --nombre Dave --pin 1357                                                   # PIN restablecido para Dave.
```
Expected: lo indicado en cada comentario. **Dejar a "Dave" con PIN 1357 en la base de desarrollo**: es el administrador con el que Dave probará la fase (queda anotado en `docs/fases/2-seguridad-de-acceso.md` en Task 7). Ctrl+C.

- [ ] **Step 7: Commit y push**

```bash
git add src/servidor/modulos/instalacion.ts src/servidor/restablecer-pin.ts src/servidor/app.ts package.json tests/instalacion.test.ts tests/restablecer-pin.test.ts
git commit -m "Instalación inicial solo desde la PC de caja y comando restablecer-pin"
git push origin main
```

---

### Task 6: Registro de cambios de precio dentro de la transacción del precio
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y la verificación completos; el registro se inserta dentro de una transacción que `editarProducto` ya abre con bloqueo de fila, y la ruta de historial es una lectura simple. La tarea es ejecutar fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`. Sondeo en vivo: editar precio, editar nombre sin precio, mandar el mismo precio como número y como texto, y comprobar en la base cuántas filas hay en `cambio_precio`.

**Files:**
- Create: `src/servidor/modulos/precios.ts`, `tests/precios.test.ts`
- Modify: `src/servidor/modulos/catalogo.ts` (`editarProducto` recibe `usuarioId` y registra), `src/servidor/app.ts` (ruta de historial)

**Interfaces:**
- Consumes: tabla `cambioPrecio` (Task 1), `Tx`, `usuarioDe` (Task 4), `ADMIN`.
- Produces: `registrarCambioPrecio(tx: Tx, { productoId, precioAnterior, precioNuevo, usuarioId }): Promise<void>`, `listarCambiosPrecio(db, productoId): Promise<{ id, precio_anterior, precio_nuevo, usuario_id, usuario_nombre, creado_en }[]>` (más reciente primero), `rutasPrecios(app)`: `GET /api/admin/productos/:id/precios`. **Firma nueva:** `editarProducto(db, id, datos, usuarioId: string)`.
- Regla 30: exactamente un registro por cambio real de precio; ninguno si el precio no cambia; todos los caminos que escriben `producto.precio` llaman `registrarCambioPrecio` dentro de su transacción (hoy `editarProducto`; en el plan 3, la carga por CSV: ver la sección final).

- [ ] **Step 1: Escribir las pruebas**

`tests/precios.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
let categoriaId: string;
beforeAll(async () => {
  ctx = await crearAppDePrueba();
  const c = await ctx.app.inject({ method: 'POST', url: '/api/admin/categorias', payload: { nombre: 'Cafés', orden: 1 } });
  categoriaId = c.json().id;
});
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

const crearProducto = async (nombre: string, precio: number) =>
  (await ctx.app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, nombre, precio, controla_stock: false } })).json();
const cambios = (productoId: string) => ctx.sql`SELECT precio_anterior, precio_nuevo, usuario_id FROM cambio_precio WHERE producto_id = ${productoId} ORDER BY creado_en`;

test('crear un producto no deja registro; cambiar el precio deja exactamente uno con anterior, nuevo y quién', async () => {
  const p = await crearProducto('Capuchino', 2.5);
  expect(await cambios(p.id)).toHaveLength(0);
  const r = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: 3 } });
  expect(r.statusCode).toBe(200);
  expect(r.json().precio).toBe('3.00');
  expect(await cambios(p.id)).toEqual([{ precio_anterior: '2.50', precio_nuevo: '3.00', usuario_id: ctx.admin.id }]);
});

test('editar sin tocar el precio, o mandar el mismo precio como número o como texto, no deja registro', async () => {
  const p = await crearProducto('Mocaccino', 3.25);
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { nombre: 'Mocaccino grande' } });
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: 3.25 } });
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: '3.25' } });
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}` });
  expect(await cambios(p.id)).toHaveLength(0);
});

test('un precio inválido no deja registro ni cambia el precio', async () => {
  const p = await crearProducto('Té', 1.5);
  const r = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: -1 } });
  expect(r.statusCode).toBe(400);
  expect(await cambios(p.id)).toHaveLength(0);
});

test('el historial se lee más reciente primero con el nombre de quien cambió; 404 y 400 en ids malos', async () => {
  const p = await crearProducto('Latte', 2);
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: 2.25 } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: 2.75 } });
  const h = await ctx.app.inject({ method: 'GET', url: `/api/admin/productos/${p.id}/precios` });
  expect(h.statusCode).toBe(200);
  expect(h.json()).toHaveLength(2);
  expect(h.json()[0]).toMatchObject({ precio_anterior: '2.25', precio_nuevo: '2.75', usuario_nombre: 'Admin de prueba' });
  expect(h.json()[1]).toMatchObject({ precio_anterior: '2.00', precio_nuevo: '2.25' });
  expect(JSON.stringify(h.json())).not.toContain('pin_hash');
  expect((await ctx.app.inject({ method: 'GET', url: '/api/admin/productos/00000000-0000-0000-0000-000000000000/precios' })).statusCode).toBe(404);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/admin/productos/no-es-uuid/precios' })).statusCode).toBe(400);
});

test('carrera determinista: el precio anterior registrado es el que había al tomar el bloqueo, no el leído antes', async () => {
  const p = await crearProducto('Espresso', 1);
  // Una transacción externa bloquea la fila, se lanza el PATCH a 1.50 sin
  // esperarlo, la externa sube el precio a 1.25 y confirma. Como editarProducto
  // lee la fila con FOR UPDATE dentro de su propia transacción, ve 1.25 al
  // retomar y registra 1.25 → 1.50. Si leyera fuera de la transacción,
  // registraría 1.00 → 1.50 y la suma de cambios dejaría de cuadrar.
  let patchPromise: Promise<{ statusCode: number; json: () => any }> | null = null;
  await ctx.sql.begin(async (tx) => {
    await tx`SELECT id FROM producto WHERE id = ${p.id} FOR UPDATE`;
    patchPromise = Promise.resolve(ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${p.id}`, payload: { precio: 1.5 } }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    await tx`UPDATE producto SET precio = 1.25, actualizado_en = now() WHERE id = ${p.id}`;
  });
  const r = await patchPromise!;
  expect(r.statusCode).toBe(200);
  expect(await cambios(p.id)).toEqual([{ precio_anterior: '1.25', precio_nuevo: '1.50', usuario_id: ctx.admin.id }]);
});
```

- [ ] **Step 2: Ejecutar para ver que falla**

Run: `npm test -- tests/precios.test.ts`
Expected: FAIL: la primera prueba encuentra 0 filas en `cambio_precio` tras cambiar el precio (esperaba 1), y el historial responde 401/404 (la ruta no existe: desde 127.0.0.1 con sesión de admin, 404).

- [ ] **Step 3: Escribir `precios.ts`**

`src/servidor/modulos/precios.ts`:
```ts
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db, Tx } from '../db/conexion';
import { cambioPrecio, producto, usuario } from '../db/schema';
import { NoEncontrado, exigirUuid } from '../errores';
import { ADMIN } from '../seguridad/acceso';

// Regla 30. Se llama DENTRO de la transacción que cambia el precio, y solo
// cuando cambia de verdad (quien llama compara antes). Todo camino que
// escriba producto.precio pasa por aquí: hoy editarProducto (catalogo.ts);
// en el plan 3, la carga masiva por CSV. Un cambio de precio sin su registro
// es un error, igual que un cambio de stock sin movimiento_stock.
export async function registrarCambioPrecio(
  tx: Tx,
  datos: { productoId: string; precioAnterior: string; precioNuevo: string; usuarioId: string },
) {
  await tx.insert(cambioPrecio).values({
    producto_id: datos.productoId,
    precio_anterior: datos.precioAnterior,
    precio_nuevo: datos.precioNuevo,
    usuario_id: datos.usuarioId,
  });
}

export async function listarCambiosPrecio(db: Db, productoId: string) {
  const id = exigirUuid(productoId, 'El identificador del producto no es válido');
  const [p] = await db.select({ id: producto.id }).from(producto).where(eq(producto.id, id));
  if (!p) throw new NoEncontrado('El producto no existe');
  return db.select({
    id: cambioPrecio.id,
    precio_anterior: cambioPrecio.precio_anterior,
    precio_nuevo: cambioPrecio.precio_nuevo,
    usuario_id: cambioPrecio.usuario_id,
    usuario_nombre: usuario.nombre,
    creado_en: cambioPrecio.creado_en,
  }).from(cambioPrecio)
    .innerJoin(usuario, eq(cambioPrecio.usuario_id, usuario.id))
    .where(eq(cambioPrecio.producto_id, id))
    .orderBy(desc(cambioPrecio.creado_en));
}

export function rutasPrecios(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/admin/productos/:id/precios', { config: { acceso: ADMIN } }, async (req) => listarCambiosPrecio(app.db, req.params.id));
}
```

- [ ] **Step 4: Registrar el cambio en `editarProducto` y pasar el usuario desde la ruta**

En `src/servidor/modulos/catalogo.ts`:
- Añadir `import { registrarCambioPrecio } from './precios';` y `import { usuarioDe } from '../seguridad/guardia';`.
- Firma: `export async function editarProducto(db: Db, id: string, datos: DatosProducto) {` → `export async function editarProducto(db: Db, id: string, datos: DatosProducto, usuarioId: string) {`
- Dentro de la transacción, justo después de `const [p] = await tx.update(producto).set(cambios).where(eq(producto.id, id)).returning();` añadir:
```ts
    // Regla 30: solo cuando el precio cambia de verdad. Ambos lados vienen
    // normalizados a texto con dos decimales (numeric(10,2) de la base y
    // exigirMonto), así que la comparación de textos es exacta.
    if (cambios.precio !== undefined && cambios.precio !== existe.precio) {
      await registrarCambioPrecio(tx, { productoId: id, precioAnterior: existe.precio, precioNuevo: cambios.precio, usuarioId });
    }
```
- En `rutasCatalogo`, la ruta `PATCH /api/admin/productos/:id`: `const p = await editarProducto(app.db, req.params.id, datos);` → `const p = await editarProducto(app.db, req.params.id, datos, usuarioDe(req).id);`

En `src/servidor/app.ts`: `import { rutasPrecios } from './modulos/precios';` y `rutasPrecios(app);` después de `rutasInstalacion(app);`.

- [ ] **Step 5: Ejecutar todo**

Run: `npm run typecheck && npm test`
Expected: 0 failed; 5 nuevas en `precios.test.ts`. El barrido de `guardia.test.ts` incluye ahora `GET /api/admin/productos/:id/precios` como ruta de admin.

- [ ] **Step 6: Commit y push**

```bash
git add src/servidor/modulos/precios.ts src/servidor/modulos/catalogo.ts src/servidor/app.ts tests/precios.test.ts
git commit -m "Registro de cambios de precio dentro de la transacción del producto e historial por producto"
git push origin main
```

---

### Task 7: Pantallas: teclado de PIN (completo y como capa), aparato no autorizado, instalación, admin con Usuarios y Dispositivos, historial de precios, barra con Salir
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae los componentes completos y la API ya está probada en las tareas 1 a 6; la tarea es transcribir, compilar y verificar en vivo con el navegador. Antes de copiar, comparar campo por campo lo que cada formulario envía contra el tipo que la ruta exige (aprendizaje del 2026-09-17, tarea 7 del plan 1): `pin` texto, `usuario_id` uuid, `nombre` texto, `rol` uno de tres.
**Skill del ejecutor:** `superpowers:test-driven-development` (no hay pruebas de componentes en este proyecto; la prueba es `npm run build`, las 8 rutas de `tests/web.test.ts` y la verificación en vivo del paso 8). **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`, repitiendo la verificación en vivo del paso 8 con Chromium headless.

**Files:**
- Create: `src/web/acceso/Acceso.tsx`, `src/web/acceso/TecladoPin.tsx`, `src/web/acceso/DispositivoNoAutorizado.tsx`, `src/web/acceso/Instalacion.tsx`, `src/web/acceso/BarraSesion.tsx`, `src/web/admin/Dispositivos.tsx`
- Modify: `src/web/api.ts`, `src/web/main.tsx`, `src/web/admin/AppAdmin.tsx`, `src/web/admin/Menu.tsx`, `src/web/mesero/AppMesero.tsx`, `src/web/caja/AppCaja.tsx`, `src/web/estilos.css`, `docs/fases/2-seguridad-de-acceso.md`, `docs/ESTADO.md`, `docs/BITACORA.md`, `docs/APRENDIZAJES.md`

**Interfaces:**
- Consumes: todas las rutas de las tareas 3 a 6; `ROLES_POR_PANTALLA`, `Rol` de `src/compartido/roles.ts`; evento `dispositivos`.
- Produces:
  - `api.ts`: `class ErrorApi extends Error { estado: number; codigo: string | null }`, `registrarGanchosDeAcceso({ esperarDesbloqueo, dispositivoNoAutorizado })`; `api.get/post/patch/del/subirArchivo` como antes. Un 401 en cualquier ruta que no sea de acceso espera al desbloqueo y **reintenta la misma petición**; un 403 `dispositivo_no_autorizado` avisa al componente `Acceso`.
  - `Acceso.tsx`: `<Acceso rolesPermitidos={Rol[] | null}>`; `useSesion(): { usuario: UsuarioSesion | null; salir(): Promise<void> }`; `type UsuarioSesion = { id, nombre, rol }`.
  - `TecladoPin.tsx`: `<TecladoPin capa={boolean} alEntrar={(u) => void} />`.
  - `DispositivoNoAutorizado.tsx`: `<DispositivoNoAutorizado codigo={string} />`. `Instalacion.tsx`: `<Instalacion />`. `BarraSesion.tsx`: `<BarraSesion />`.
  - `Dispositivos.tsx`: `<Dispositivos />` (pestaña de admin).

- [ ] **Step 1: `api.ts` con errores tipados, reintento tras desbloquear y aviso de aparato revocado**

Contenido completo de `src/web/api.ts`:
```ts
export class ErrorApi extends Error {
  constructor(mensaje: string, public estado: number, public codigo: string | null) {
    super(mensaje);
  }
}

// Ganchos que registra el componente Acceso cuando la pantalla ya está
// dentro: qué hacer si el servidor dice que no hay sesión (poner el teclado
// de PIN encima y avisar cuando se desbloqueó) o que el aparato ya no está
// autorizado (volver a pedir código).
type Ganchos = { esperarDesbloqueo: (() => Promise<void>) | null; dispositivoNoAutorizado: (() => void) | null };
let ganchos: Ganchos = { esperarDesbloqueo: null, dispositivoNoAutorizado: null };
export function registrarGanchosDeAcceso(nuevos: Ganchos) {
  ganchos = nuevos;
}

// En estas rutas un 401 o 403 es parte del flujo normal de entrada (PIN
// incorrecto, aparato pendiente, no es la PC de caja) y no dispara los ganchos.
const RUTAS_DE_ACCESO = ['/api/sesion', '/api/instalacion', '/api/dispositivos/'];
const esRutaDeAcceso = (url: string) => RUTAS_DE_ACCESO.some((r) => url.startsWith(r));

// Lee el cuerpo de una respuesta ya obtenida con fetch: lo intenta parsear
// como JSON (puede venir vacío) y, si la respuesta no fue exitosa, lanza el
// mensaje de error del servidor con su estado y su código.
async function leerRespuesta(r: Response) {
  const texto = await r.text();
  let datos: any = null;
  if (texto) {
    try {
      datos = JSON.parse(texto);
    } catch {
      throw new ErrorApi('Respuesta inválida del servidor', r.status, null);
    }
  }
  if (!r.ok) throw new ErrorApi(datos?.error ?? `Error ${r.status}`, r.status, datos?.codigo ?? null);
  return datos;
}

// fetch lanza (no devuelve una respuesta con estado de error) cuando no hay
// red o el servidor no responde. Se traduce a un mensaje en español.
async function buscar(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ErrorApi('Sin conexión con el servidor', 0, null);
  }
}

async function pedir(url: string, init: RequestInit) {
  let r = await buscar(url, init);
  if (!esRutaDeAcceso(url)) {
    // Sesión vencida (spec 5.4): el teclado de PIN se pone encima sin
    // desmontar la pantalla, y al desbloquear se reintenta esta misma
    // petición, con el mismo cuerpo, y la pantalla sigue donde estaba.
    if (r.status === 401 && ganchos.esperarDesbloqueo) {
      await ganchos.esperarDesbloqueo();
      r = await buscar(url, init);
    }
    if (r.status === 403 && ganchos.dispositivoNoAutorizado) {
      const datos = await r.clone().json().catch(() => null);
      if (datos?.codigo === 'dispositivo_no_autorizado') ganchos.dispositivoNoAutorizado();
    }
  }
  return leerRespuesta(r);
}

async function llamar(metodo: string, url: string, cuerpo?: unknown) {
  return pedir(url, {
    method: metodo,
    headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

export const api = {
  get: (url: string) => llamar('GET', url),
  post: (url: string, cuerpo?: unknown) => llamar('POST', url, cuerpo ?? {}),
  patch: (url: string, cuerpo: unknown) => llamar('PATCH', url, cuerpo),
  del: (url: string) => llamar('DELETE', url),
  subirArchivo(url: string, campo: string, archivo: File) {
    const fd = new FormData(); fd.append(campo, archivo);
    return pedir(url, { method: 'POST', body: fd });
  },
};
```

- [ ] **Step 2: Componentes de acceso**

`src/web/acceso/Acceso.tsx`:
```tsx
import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { api, ErrorApi, registrarGanchosDeAcceso } from '../api';
import type { Rol } from '../../compartido/roles';
import { TecladoPin } from './TecladoPin';
import { DispositivoNoAutorizado } from './DispositivoNoAutorizado';
import { Instalacion } from './Instalacion';

export type UsuarioSesion = { id: string; nombre: string; rol: Rol };
type Sesion = { usuario: UsuarioSesion | null; salir: () => Promise<void> };
const ContextoSesion = createContext<Sesion>({ usuario: null, salir: async () => {} });
export const useSesion = () => useContext(ContextoSesion);

type Fase = 'cargando' | 'instalacion' | 'dispositivo' | 'pin' | 'listo' | 'sin-permiso';
const SONDEO_MS = 3000;
const REINTENTO_MS = 2000;

// Envuelve cada pantalla. Resuelve, en orden: instalación (solo la PC de
// caja la ve), autorización del aparato (código de 4 dígitos), PIN (salvo
// cocina) y rol. Cuando la sesión vence estando dentro, pone el teclado de
// PIN ENCIMA de la pantalla sin desmontarla: lo que había en memoria sigue
// ahí y, al desbloquear, api.ts reintenta la petición que falló.
// rolesPermitidos: null = pantalla sin sesión (cocina), solo exige aparato.
export function Acceso({ rolesPermitidos, children }: { rolesPermitidos: Rol[] | null; children: any }) {
  const [fase, setFase] = useState<Fase>('cargando');
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [codigo, setCodigo] = useState('');
  const [bloqueado, setBloqueado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const pendientes = useRef<(() => void)[]>([]);
  const sondeo = useRef<any>(null);
  const vivo = useRef(true);

  const admitir = (u: UsuarioSesion | null) => {
    if (rolesPermitidos === null) { setFase('listo'); return; }
    if (!u) { setFase('pin'); return; }
    setUsuario(u);
    setFase(rolesPermitidos.includes(u.rol) ? 'listo' : 'sin-permiso');
  };

  const comprobarSesion = async () => {
    if (!vivo.current) return;
    try {
      const s = await api.get('/api/sesion');
      setAviso(null);
      admitir(s.usuario);
    } catch (e) {
      const err = e as ErrorApi;
      if (err.codigo === 'dispositivo_no_autorizado') { pedirAutorizacion(); return; }
      if (err.codigo === 'sin_sesion') { setAviso(null); admitir(null); return; }
      // Sin conexión u otro error: reintentar, sin dejar la pantalla colgada.
      setAviso(err.message);
      setTimeout(comprobarSesion, REINTENTO_MS);
    }
  };

  const pedirAutorizacion = async () => {
    if (!vivo.current) return;
    clearInterval(sondeo.current);
    try {
      const { codigo: nuevo, espera_id } = await api.post('/api/dispositivos/solicitar');
      setAviso(null);
      setCodigo(nuevo);
      setFase('dispositivo');
      sondeo.current = setInterval(async () => {
        try {
          const r = await api.get(`/api/dispositivos/estado?espera_id=${espera_id}`);
          if (r.estado === 'autorizado') { clearInterval(sondeo.current); setCodigo(''); comprobarSesion(); }
          else if (r.estado === 'revocado') { clearInterval(sondeo.current); pedirAutorizacion(); }
        } catch (e) {
          if ((e as ErrorApi).codigo === 'solicitud_caducada') { clearInterval(sondeo.current); pedirAutorizacion(); }
        }
      }, SONDEO_MS);
    } catch (e) {
      setAviso((e as ErrorApi).message);
      setTimeout(pedirAutorizacion, REINTENTO_MS);
    }
  };

  const arrancar = async () => {
    try {
      const i = await api.get('/api/instalacion');
      if (i.instalado === false) { setFase('instalacion'); return; }
    } catch {
      // 403: no es la PC de caja. Sin conexión: comprobarSesion reintenta.
    }
    await comprobarSesion();
  };

  useEffect(() => {
    vivo.current = true;
    arrancar();
    return () => { vivo.current = false; clearInterval(sondeo.current); };
  }, []);

  // Los ganchos de api.ts solo actúan cuando la pantalla ya está dentro.
  useEffect(() => {
    if (fase !== 'listo') {
      registrarGanchosDeAcceso({ esperarDesbloqueo: null, dispositivoNoAutorizado: null });
      return;
    }
    registrarGanchosDeAcceso({
      esperarDesbloqueo: rolesPermitidos === null ? null : () => new Promise<void>((resolve) => {
        pendientes.current.push(resolve);
        setBloqueado(true);
      }),
      dispositivoNoAutorizado: () => { setFase('cargando'); pedirAutorizacion(); },
    });
    return () => registrarGanchosDeAcceso({ esperarDesbloqueo: null, dispositivoNoAutorizado: null });
  }, [fase]);

  const alEntrar = (u: UsuarioSesion) => {
    if (!bloqueado) { admitir(u); return; }
    // Desbloqueo: se quita la capa y se sueltan las peticiones que esperaban.
    setBloqueado(false);
    setUsuario(u);
    if (rolesPermitidos && !rolesPermitidos.includes(u.rol)) { pendientes.current = []; setFase('sin-permiso'); return; }
    const lista = pendientes.current;
    pendientes.current = [];
    for (const soltar of lista) soltar();
  };

  const salir = async () => {
    try { await api.del('/api/sesion'); } catch { /* si ya no había sesión, da igual */ }
    setUsuario(null);
    setBloqueado(false);
    pendientes.current = [];
    setFase(rolesPermitidos === null ? 'listo' : 'pin');
  };

  if (fase === 'cargando') return <div class="contenido">{aviso ? <div class="aviso error">{aviso}</div> : 'Cargando…'}</div>;
  if (fase === 'instalacion') return <Instalacion />;
  if (fase === 'dispositivo') return <DispositivoNoAutorizado codigo={codigo} />;
  if (fase === 'pin') return <TecladoPin capa={false} alEntrar={alEntrar} />;
  if (fase === 'sin-permiso') {
    return (
      <div class="contenido">
        <h1>No tienes permiso para esta pantalla</h1>
        <p>{usuario?.nombre} entró con el rol {usuario?.rol}.</p>
        <button class="primario" onClick={salir}>Salir</button>
      </div>
    );
  }
  return (
    <ContextoSesion.Provider value={{ usuario, salir }}>
      {children}
      {bloqueado && <TecladoPin capa={true} alEntrar={alEntrar} />}
    </ContextoSesion.Provider>
  );
}
```

`src/web/acceso/TecladoPin.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api, ErrorApi } from '../api';
import type { UsuarioSesion } from './Acceso';

type Entrada = { id: string; nombre: string; rol: string };
const CLAVE_ULTIMO = 'ultimo_usuario';
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'borrar', '0', 'limpiar'];

function leerUltimo(): string {
  try { return localStorage.getItem(CLAVE_ULTIMO) ?? ''; } catch { return ''; }
}

// capa=false: pantalla completa al entrar. capa=true: encima de la pantalla
// cuando la sesión venció (la pantalla de abajo sigue montada).
export function TecladoPin({ capa, alEntrar }: { capa: boolean; alEntrar: (u: UsuarioSesion) => void }) {
  const [usuarios, setUsuarios] = useState<Entrada[]>([]);
  const [elegido, setElegido] = useState(leerUltimo);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get('/api/sesion/usuarios').then((lista: Entrada[]) => {
      setUsuarios(lista);
      setElegido((actual) => (lista.some((u) => u.id === actual) ? actual : (lista[0]?.id ?? '')));
    }).catch((e: ErrorApi) => setError(e.message));
  }, []);

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      // El PIN viaja como texto de 4 dígitos, nunca como número.
      const r = await api.post('/api/sesion', { usuario_id: elegido, pin });
      try { localStorage.setItem(CLAVE_ULTIMO, elegido); } catch { /* sin almacenamiento, no pasa nada */ }
      setPin('');
      alEntrar(r.usuario);
    } catch (e) {
      // "PIN incorrecto" o "Demasiados intentos": el mensaje viene del servidor y no dice si el usuario existe.
      setError((e as ErrorApi).message);
      setPin('');
    } finally {
      setEnviando(false);
    }
  };

  useEffect(() => {
    if (pin.length === 4 && elegido && !enviando) enviar();
  }, [pin]);

  const tecla = (t: string) => {
    setError(null);
    if (t === 'borrar') setPin((p) => p.slice(0, -1));
    else if (t === 'limpiar') setPin('');
    else setPin((p) => (p.length < 4 ? p + t : p));
  };

  return (
    <div class={capa ? 'capa-bloqueo' : 'contenido pantalla-pin'}>
      <div class="teclado-pin">
        <h1>{capa ? 'La sesión venció: escribe tu PIN' : 'Entrar'}</h1>
        <label>Quién eres
          <select value={elegido} onChange={(e) => { setElegido((e.target as HTMLSelectElement).value); setPin(''); setError(null); }}>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </label>
        <div class="puntos" aria-label={`${pin.length} de 4 dígitos`}>
          {[0, 1, 2, 3].map((i) => <span key={i} class={i < pin.length ? 'punto lleno' : 'punto'} />)}
        </div>
        <div class="teclas">
          {TECLAS.map((t) => (
            <button key={t} type="button" disabled={enviando || !elegido} onClick={() => tecla(t)}>
              {t === 'borrar' ? '←' : t === 'limpiar' ? 'C' : t}
            </button>
          ))}
        </div>
        {error && <div class="aviso error">{error}</div>}
        {usuarios.length === 0 && !error && <p>No hay usuarios con PIN. Un administrador debe crearlos desde la PC de caja.</p>}
      </div>
    </div>
  );
}
```

`src/web/acceso/DispositivoNoAutorizado.tsx`:
```tsx
// Sin nombre del local, sin menú, sin nada del negocio (spec 8).
export function DispositivoNoAutorizado({ codigo }: { codigo: string }) {
  return (
    <div class="contenido pantalla-codigo">
      <h1>Este dispositivo no está autorizado</h1>
      <p>Pide al administrador que lo autorice desde la PC de caja con este código:</p>
      <div class="codigo-grande">{codigo || '····'}</div>
      <p>Esta pantalla seguirá sola cuando lo autoricen.</p>
    </div>
  );
}
```

`src/web/acceso/Instalacion.tsx`:
```tsx
import { useState } from 'preact/hooks';
import { api, ErrorApi } from '../api';

export function Instalacion() {
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: Event) => {
    e.preventDefault();
    setError(null);
    if (pin !== confirmacion) { setError('Los PIN no coinciden'); return; }
    setEnviando(true);
    try {
      await api.post('/api/instalacion', { nombre, pin });
      // Spec 5.1.5: termina y entra a /admin con la sesión ya iniciada (cookie).
      location.href = '/admin';
    } catch (err) {
      setError((err as ErrorApi).message);
      setEnviando(false);
    }
  };

  return (
    <div class="contenido">
      <h1>Configuración inicial</h1>
      <p>Crea el primer usuario administrador. Este paso se hace una sola vez, en la PC de caja.</p>
      <form onSubmit={enviar} style="display:grid;gap:12px;max-width:360px">
        <label>Nombre del administrador<input value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} /></label>
        <label>PIN (4 dígitos)<input type="password" inputMode="numeric" maxLength={4} value={pin} onInput={(e) => setPin((e.target as HTMLInputElement).value)} /></label>
        <label>Repite el PIN<input type="password" inputMode="numeric" maxLength={4} value={confirmacion} onInput={(e) => setConfirmacion((e.target as HTMLInputElement).value)} /></label>
        {error && <div class="aviso error">{error}</div>}
        <button class="primario" type="submit" disabled={enviando}>Crear administrador y entrar</button>
      </form>
    </div>
  );
}
```

`src/web/acceso/BarraSesion.tsx`:
```tsx
import { useSesion } from './Acceso';

// Nombre de quien está dentro y botón Salir, para la barra superior de toda
// pantalla con sesión (spec 8). Salir cierra la sesión en el servidor y borra
// su cookie; el aparato sigue autorizado.
export function BarraSesion() {
  const { usuario, salir } = useSesion();
  if (!usuario) return null;
  return (
    <span class="sesion">
      <span class="pill ok">{usuario.nombre}</span>
      <button onClick={salir}>Salir</button>
    </span>
  );
}
```

- [ ] **Step 3: Envolver las apps en `main.tsx` y poner la barra en cada pantalla**

`src/web/main.tsx`, contenido completo:
```tsx
import { render } from 'preact';
import { Acceso } from './acceso/Acceso';
import { ROLES_POR_PANTALLA } from '../compartido/roles';
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

// Cada pantalla va dentro de <Acceso>, que resuelve instalación, aparato,
// PIN y rol antes de mostrarla. Cocina no lleva sesión (rolesPermitidos null).
function Raiz() {
  if (ruta === '/admin') return <Acceso rolesPermitidos={ROLES_POR_PANTALLA['/admin']}><AppAdmin /></Acceso>;
  if (ruta === '/caja') return <Acceso rolesPermitidos={ROLES_POR_PANTALLA['/caja']}><AppCaja /></Acceso>;
  if (ruta === '/mesero') return <Acceso rolesPermitidos={ROLES_POR_PANTALLA['/mesero']}><AppMesero /></Acceso>;
  if (ruta === '/cocina') return <Acceso rolesPermitidos={null}><AppCocina /></Acceso>;
  return <Indice />;
}

render(<Raiz />, document.getElementById('app')!);
```

`src/web/mesero/AppMesero.tsx`, contenido completo:
```tsx
import { useEstado } from '../eventos';
import { BarraSesion } from '../acceso/BarraSesion';

export function AppMesero() {
  const { estado } = useEstado();
  return (
    <div>
      <div class="barra"><h1>Mesero</h1><BarraSesion /></div>
      {!estado && <div class="contenido">Cargando…</div>}
      {estado && !estado.jornada && <div class="contenido"><h1>Caja cerrada</h1><p>No se pueden tomar pedidos hasta que caja abra la jornada.</p></div>}
      {estado && estado.jornada && <div class="contenido"><p>Pantalla en construcción (plan 2).</p></div>}
    </div>
  );
}
```

`src/web/caja/AppCaja.tsx`, contenido completo:
```tsx
import { BarraSesion } from '../acceso/BarraSesion';

export function AppCaja() {
  return (
    <div>
      <div class="barra"><h1>Caja</h1><BarraSesion /></div>
      <div class="contenido"><p>Pantalla en construcción (plan 2).</p></div>
    </div>
  );
}
```

`src/web/admin/AppAdmin.tsx`, contenido completo:
```tsx
import { useState } from 'preact/hooks';
import { useEstado } from '../eventos';
import { BarraSesion } from '../acceso/BarraSesion';
import { Configuracion } from './Configuracion';
import { Usuarios } from './Usuarios';
import { Dispositivos } from './Dispositivos';
import { Menu } from './Menu';

const PESTANAS = [['config', 'Configuración'], ['usuarios', 'Usuarios'], ['dispositivos', 'Dispositivos'], ['menu', 'Menú']] as const;
type Pestana = (typeof PESTANAS)[number][0];

export function AppAdmin() {
  const { estado, conectado } = useEstado();
  const [pestana, setPestana] = useState<Pestana>('menu');
  return (
    <div>
      {!conectado && <div class="sin-conexion">Sin conexión con el servidor. Reintentando…</div>}
      <div class="barra"><h1>Admin · {estado?.configuracion?.nombre_local ?? ''}</h1>
        <span class="pill">{estado?.jornada ? 'Caja abierta' : 'Caja cerrada'}</span>
        <BarraSesion /></div>
      <div class="contenido">
        <div class="pestanas">
          {PESTANAS.map(([k, t]) => <button key={k} class={pestana === k ? 'activa' : ''} onClick={() => setPestana(k)}>{t}</button>)}
        </div>
        {pestana === 'config' && <Configuracion />}
        {pestana === 'usuarios' && <Usuarios />}
        {pestana === 'dispositivos' && <Dispositivos />}
        {pestana === 'menu' && <Menu />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Pestaña Dispositivos**

`src/web/admin/Dispositivos.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { Aviso } from '../componentes/Aviso';

type Datos = { pendientes: any[]; autorizados: any[]; intentos_fallidos: any[] };
const VACIO: Datos = { pendientes: [], autorizados: [], intentos_fallidos: [] };

const haceCuanto = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? 'hace un momento' : min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`;
};
const fechaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-EC') : '—');

export function Dispositivos() {
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const cargar = () => api.get('/api/admin/dispositivos').then(setDatos).catch((e: any) => setError(e.message));
  // El evento 'dispositivos' avisa de solicitudes nuevas y cambios; el
  // intervalo cubre la caducidad de pendientes, que no emite evento.
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, []);
  useEventos(['dispositivos'], () => cargar());

  const autorizar = async (d: any) => {
    setError(null);
    try { await api.post(`/api/admin/dispositivos/${d.id}/autorizar`, { nombre: nombres[d.id] ?? '' }); await cargar(); }
    catch (e: any) { setError(e.message); }
  };
  const revocar = async (d: any) => {
    if (!confirm(`¿Quitar el acceso a "${d.nombre}"? Sus sesiones se cerrarán.`)) return;
    setError(null);
    try { await api.post(`/api/admin/dispositivos/${d.id}/revocar`); await cargar(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div style="display:grid;gap:24px">
      <Aviso tipo="error" texto={error} />
      <section class="tarjeta">
        <h2>Esperando autorización</h2>
        {datos.pendientes.length === 0 ? <p>Ningún aparato está pidiendo acceso.</p> : (
          <table><thead><tr><th>Código</th><th>Navegador</th><th>Desde</th><th>Nombre</th><th></th></tr></thead>
            <tbody>{datos.pendientes.map((d) => (
              <tr key={d.id}>
                <td class="codigo-celda">{d.codigo}</td><td>{d.descripcion}</td><td>{haceCuanto(d.solicitado_en)}</td>
                <td><input placeholder="Celular de Ana" value={nombres[d.id] ?? ''} onInput={(e) => setNombres({ ...nombres, [d.id]: (e.target as HTMLInputElement).value })} /></td>
                <td><button class="primario" onClick={() => autorizar(d)}>Autorizar</button></td>
              </tr>
            ))}</tbody></table>
        )}
      </section>
      <section class="tarjeta">
        <h2>Autorizados</h2>
        {datos.autorizados.length === 0 ? <p>Ninguno todavía. La PC de caja no necesita autorización.</p> : (
          <table><thead><tr><th>Nombre</th><th>Navegador</th><th>Último uso</th><th></th></tr></thead>
            <tbody>{datos.autorizados.map((d) => (
              <tr key={d.id}><td>{d.nombre}</td><td>{d.descripcion}</td><td>{fechaHora(d.ultimo_uso_en)}</td>
                <td><button class="peligro" onClick={() => revocar(d)}>Quitar acceso</button></td></tr>
            ))}</tbody></table>
        )}
      </section>
      <section class="tarjeta">
        <h2>Últimos intentos fallidos</h2>
        {datos.intentos_fallidos.length === 0 ? <p>Ninguno.</p> : (
          <table><thead><tr><th>Aparato</th><th>Usuario</th><th>Hora</th></tr></thead>
            <tbody>{datos.intentos_fallidos.map((i) => (
              <tr key={i.id}><td>{i.dispositivo}</td><td>{i.usuario}</td><td>{fechaHora(i.ocurrido_en)}</td></tr>
            ))}</tbody></table>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Historial de precios en el producto (`Menu.tsx`)**

En `src/web/admin/Menu.tsx`:
- Después de `const [error, setError] = useState<string | null>(null);` añadir:
```tsx
  const [historialDe, setHistorialDe] = useState<any | null>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const verHistorial = async (p: any) => {
    setError(null);
    try { setHistorial(await api.get(`/api/admin/productos/${p.id}/precios`)); setHistorialDe(p); }
    catch (err: any) { setError(err.message); }
  };
```
- En la fila de cada producto, en la celda de botones, `<button onClick={() => editar(p)}>Editar</button>` pasa a `<button onClick={() => editar(p)}>Editar</button> <button onClick={() => verHistorial(p)}>Precios</button>`.
- Después de la sección `Productos` (antes del `</div>` final) añadir:
```tsx
      {historialDe && (
        <section class="tarjeta">
          <h2>Historial de precios · {historialDe.nombre} <button type="button" onClick={() => setHistorialDe(null)}>Cerrar</button></h2>
          {historial.length === 0 ? <p>Este producto nunca cambió de precio.</p> : (
            <table><thead><tr><th>Cuándo</th><th>Antes</th><th>Después</th><th>Quién</th></tr></thead>
              <tbody>{historial.map((h) => (
                <tr key={h.id}><td>{new Date(h.creado_en).toLocaleString('es-EC')}</td><td>{h.precio_anterior}</td><td>{h.precio_nuevo}</td><td>{h.usuario_nombre}</td></tr>
              ))}</tbody></table>
          )}
        </section>
      )}
```

- [ ] **Step 6: Estilos**

Añadir al final de `src/web/estilos.css`:
```css
.sesion { margin-left:auto; display:flex; gap:8px; align-items:center; }
.capa-bloqueo { position:fixed; inset:0; background:rgba(27,31,28,.85); display:flex; align-items:center; justify-content:center; z-index:100; padding:16px; }
.pantalla-pin { display:flex; justify-content:center; }
.teclado-pin { background:#fff; border-radius:12px; padding:20px; width:100%; max-width:360px; display:grid; gap:14px; }
.teclado-pin h1 { font-size:20px; margin:0; text-align:center; }
.puntos { display:flex; gap:14px; justify-content:center; }
.punto { width:16px; height:16px; border-radius:50%; border:2px solid var(--acento); }
.punto.lleno { background:var(--acento); }
.teclas { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
.teclas button { min-height:64px; font-size:24px; }
.pantalla-codigo { text-align:center; }
.codigo-grande { font-size:96px; font-weight:700; letter-spacing:.2em; color:var(--acento); margin:24px 0; }
.codigo-celda { font-size:24px; font-weight:700; letter-spacing:.1em; }
```

- [ ] **Step 7: Compilar y correr todo**

Run: `npm run typecheck && npm run build && npm test`
Expected: sin errores; `dist/web/index.html` regenerado; 0 failed (las 8 rutas de `tests/web.test.ts` incluidas).

- [ ] **Step 8: Verificación en vivo con Chromium headless (patrón del aprendizaje del 2026-09-17)**

Preparación: `npm run dev` en una terminal. La base de desarrollo debe tener al admin "Dave" con PIN 1357 (Task 5, paso 6); si no, `npm run restablecer-pin -- --nombre Dave --pin 1357`. Fuera del repo:
```bash
mkdir -p /tmp/cafeteria-t7-fase2 && cd /tmp/cafeteria-t7-fase2 && npm init -y >/dev/null && npm install playwright-core@1 >/dev/null
CHROMIUM=$(ls -d ~/Library/Caches/ms-playwright/chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium | head -1); echo $CHROMIUM
IP=$(ipconfig getifaddr en0); echo $IP
```
Guardar en `/tmp/cafeteria-t7-fase2/verificar.mjs` (reemplazar `IP` y `CHROMIUM` por los valores impresos):
```js
import { chromium } from 'playwright-core';
const IP = 'IP_LOCAL_AQUI';
const CHROMIUM = 'RUTA_CHROMIUM_AQUI';
const LOCAL = 'http://127.0.0.1:3000';
const REMOTO = `http://${IP}:3000`;
const navegador = await chromium.launch({ executablePath: CHROMIUM });
const registro = [];
const ok = (nombre, condicion) => { registro.push(`${condicion ? 'OK ' : 'FALLA'} ${nombre}`); if (!condicion) console.error('FALLA', nombre); };

// PC de caja: entra como admin con PIN.
const pc = await navegador.newContext();
const admin = await pc.newPage();
await admin.goto(`${LOCAL}/admin`, { waitUntil: 'load' });   // nunca networkidle: el SSE no termina
await admin.waitForSelector('.teclado-pin', { timeout: 10000 });
await admin.selectOption('.teclado-pin select', { label: 'Dave' });
for (const d of ['1', '3', '5', '7']) await admin.click(`.teclas button:text-is("${d}")`);
await admin.waitForSelector('.sesion .pill', { timeout: 10000 });
ok('admin entra con PIN y la barra muestra a Dave', (await admin.textContent('.sesion .pill')).trim() === 'Dave');
await admin.screenshot({ path: '1-admin-dentro.png' });

// Celular: aparato no autorizado, muestra código.
const celular = await navegador.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/128.0 Mobile Safari/537.36' });
const mesero = await celular.newPage();
await mesero.goto(`${REMOTO}/mesero`, { waitUntil: 'load' });
await mesero.waitForSelector('.codigo-grande', { timeout: 10000 });
const codigo = (await mesero.textContent('.codigo-grande')).trim();
ok('el celular ve un código de 4 dígitos', /^\d{4}$/.test(codigo));
ok('la pantalla de código no muestra el nombre del local', !(await mesero.content()).includes('Delicadas'));
await mesero.screenshot({ path: '2-celular-codigo.png' });

// Admin autoriza desde la pestaña Dispositivos.
await admin.click('.pestanas button:text-is("Dispositivos")');
await admin.waitForSelector(`.codigo-celda:text-is("${codigo}")`, { timeout: 10000 });
ok('admin ve el código pendiente con "Chrome en Android"', (await admin.textContent('table')).includes('Chrome en Android'));
await admin.fill('table input[placeholder="Celular de Ana"]', 'Celular de prueba');
await admin.click('table button:text-is("Autorizar")');
await admin.waitForSelector('td:text-is("Celular de prueba")', { timeout: 10000 });

// El celular sigue solo: pasa al teclado de PIN y entra como mesero.
await mesero.waitForSelector('.teclado-pin', { timeout: 10000 });
ok('el celular pasa solo al teclado de PIN tras autorizar', true);
await mesero.selectOption('.teclado-pin select', { label: 'Dave' });
for (const d of ['1', '3', '5', '7']) await mesero.click(`.teclas button:text-is("${d}")`);
await mesero.waitForSelector('.sesion .pill', { timeout: 10000 });
ok('el celular entra y ve la barra con Salir', (await mesero.textContent('.barra')).includes('Salir'));
await mesero.screenshot({ path: '3-celular-dentro.png' });

// PIN incorrecto: mensaje genérico.
await mesero.click('.sesion button:text-is("Salir")');
await mesero.waitForSelector('.teclado-pin');
for (const d of ['0', '0', '0', '0']) await mesero.click(`.teclas button:text-is("${d}")`);
await mesero.waitForSelector('.teclado-pin .aviso.error');
ok('PIN incorrecto muestra el mensaje genérico', (await mesero.textContent('.teclado-pin .aviso.error')).trim() === 'PIN incorrecto');

// Bloqueo sin perder el estado: se vence la sesión del admin por SQL y se escribe algo antes.
await admin.click('.pestanas button:text-is("Usuarios")');
await admin.waitForSelector('form.fila input');
await admin.fill('form.fila input', 'Texto a medio escribir');
console.log('AHORA ejecuta en otra terminal: docker exec cafeteria-pg psql -U cafeteria -d cafeteria -c "UPDATE sesion SET expira_en = now() - interval \'1 second\' WHERE dispositivo_id IS NULL AND cerrada_en IS NULL" y pulsa Enter aquí');
await new Promise((resolve) => process.stdin.once('data', resolve));
await admin.click('.pestanas button:text-is("Dispositivos")');
await admin.waitForSelector('.capa-bloqueo', { timeout: 10000 });
ok('al vencer la sesión aparece el teclado ENCIMA', true);
await admin.screenshot({ path: '4-admin-bloqueado.png' });
await admin.selectOption('.capa-bloqueo select', { label: 'Dave' });
for (const d of ['1', '3', '5', '7']) await admin.click(`.capa-bloqueo .teclas button:text-is("${d}")`);
await admin.waitForSelector('.capa-bloqueo', { state: 'detached', timeout: 10000 });
await admin.waitForSelector('td:text-is("Celular de prueba")', { timeout: 10000 });
ok('tras desbloquear, la petición pendiente se reintenta y la lista carga', true);
await admin.click('.pestanas button:text-is("Usuarios")');
ok('lo escrito antes del bloqueo sigue ahí', (await admin.inputValue('form.fila input')) === 'Texto a medio escribir');

// Revocar el celular: su siguiente petición lo manda a la pantalla de código.
await admin.click('.pestanas button:text-is("Dispositivos")');
admin.once('dialog', (d) => d.accept());
await admin.click('table button:text-is("Quitar acceso")');
await mesero.reload({ waitUntil: 'load' });
await mesero.waitForSelector('.codigo-grande', { timeout: 15000 });
ok('el celular revocado vuelve a la pantalla de código', true);

// Historial de precios.
await admin.click('.pestanas button:text-is("Menú")');
await admin.waitForSelector('table button:text-is("Precios")');
await admin.click('table button:text-is("Precios")');
await admin.waitForSelector('h2:has-text("Historial de precios")');
ok('el producto muestra su historial de precios', true);
await admin.screenshot({ path: '5-historial-precios.png' });

console.log(registro.join('\n'));
await navegador.close();
```
Run: `node /tmp/cafeteria-t7-fase2/verificar.mjs` (y seguir la instrucción que imprime a mitad).
Expected: todas las líneas empiezan con `OK`. Capturas en `/tmp/cafeteria-t7-fase2/*.png`. Si `Delicadas` no es el nombre del local en la base de desarrollo, cambiar esa palabra por el nombre real. Limpiar la base de desarrollo al terminar, con un `docker exec cafeteria-pg psql -U cafeteria -d cafeteria -c "..."` por sentencia: `DELETE FROM sesion`, `DELETE FROM intento_fallido`, `DELETE FROM dispositivo`. Dejar a "Dave" (PIN 1357). Ctrl+C.

- [ ] **Step 9: Documentación de cierre del plan**

`docs/fases/2-seguridad-de-acceso.md`: estado pasa a "construido, pendiente de que Dave lo pruebe"; en **Para probar**, estos pasos en orden y sin jerga:
1. En la PC: `npm run build` y `npm run dev`; abrir `http://127.0.0.1:3000/admin`. Se ve "Entrar" con la lista de nombres y un teclado. Elegir "Dave" y escribir 1357. Debería verse la pantalla de Admin con "Dave" y el botón Salir arriba a la derecha.
2. En el celular (misma WiFi): abrir `http://<IP de la PC>:3000/mesero`. Debería verse "Este dispositivo no está autorizado" y un código de 4 números.
3. En la PC, pestaña Dispositivos: aparece el código; ponerle nombre ("Mi celular") y pulsar Autorizar. En el celular, sin tocar nada, en unos segundos aparece el teclado de PIN. Entrar como Dave con 1357.
4. En el celular, pulsar Salir: vuelve al teclado. Escribir un PIN equivocado 5 veces: a la sexta dice "Demasiados intentos. Espera 5 minutos."
5. En la PC, pestaña Usuarios: crear un mesero con PIN. En el celular, entrar con él. Abrir `http://<IP>:3000/admin` en el celular con ese mesero: debe decir "No tienes permiso para esta pantalla".
6. En la PC, dejar Admin abierto 15 minutos sin tocar nada y luego pulsar una pestaña: aparece el teclado encima; al escribir el PIN sigue donde estaba.
7. En la PC, pestaña Dispositivos, "Quitar acceso" al celular: el celular vuelve a pedir código.
8. En Menú, cambiar el precio de un producto y pulsar "Precios": aparece el cambio con la hora y "Dave".
9. Si olvida el PIN: en la carpeta del proyecto, `npm run restablecer-pin`, escribir "Dave" y un PIN nuevo.
En **Pendientes**: nada, salvo que alguna prueba falle.

`docs/ESTADO.md`: sección "Dónde estamos" añade "Fase 2 (seguridad de acceso) construida: <resumen de una línea por tarea>"; "Riesgos aceptados" quita el riesgo "sin contraseñas" (resuelto) y deja la recomendación de red aparte para el manual del plan 4; "Siguiente paso exacto" pasa a "Dave prueba la fase 2 con `docs/fases/2-seguridad-de-acceso.md`; después, ejecutar el plan 2 con los cambios listados en la sección final del plan de seguridad"; "Cómo probarlo hoy" se actualiza con el PIN.

`docs/BITACORA.md`: una entrada por tarea de este plan, con commits y número de pruebas.

`docs/APRENDIZAJES.md`: lo aprendido al ejecutar (mínimo: qué salió distinto de lo escrito en el plan y por qué).

- [ ] **Step 10: Commit y push**

```bash
git add src/web docs/fases/2-seguridad-de-acceso.md docs/ESTADO.md docs/BITACORA.md docs/APRENDIZAJES.md
git commit -m "Pantallas de acceso: teclado de PIN, aparato no autorizado, instalación, pestaña Dispositivos e historial de precios"
git push origin main
```

---

## Cambios que los planes 2 y 3 deben incorporar por este plan

Los planes `2026-09-15-plan-2-operacion.md` y `2026-09-15-plan-3-complementos.md` se escribieron antes de la fase 2. Antes de ejecutarlos, quien los despache aplica esto (y lo anota en `docs/ESTADO.md` como hecho):

1. **Toda ruta nueva declara `config.acceso`** o el servidor no arranca. Tabla de roles (spec 3.2):
   - `POST /api/jornadas/abrir`, `POST /api/jornadas/cerrar`, `GET /api/jornadas/actual/resumen`, `GET /api/jornadas` → `CAJA`.
   - `GET /api/mesas`, `POST /api/pedidos`, `GET /api/pedidos/:id`, `PATCH /api/pedidos/:id`, `POST /api/pedidos/:id/rondas`, `POST /api/pedidos/:id/items/:itemId/anular`, `POST /api/pedidos/:id/anular`, `POST /api/rondas/:id/aviso-visto` → `TODOS`.
   - `POST /api/pedidos/:id/cuentas`, `DELETE /api/cuentas/:id`, `POST /api/cuentas/:id/items`, `PATCH /api/cuentas/:id`, `POST /api/cuentas/:id/pagos`, `GET /api/cuentas/:id/ticket` (o como se llame la ruta del ticket) → `CAJA`.
   - `GET/POST /api/clientes`, `PATCH /api/clientes/:id` → `CAJA`.
   - `GET /api/egresos`, `POST /api/egresos`, todo `/api/encargos*`, reportes → `CAJA`.
   - `GET /api/cocina/rondas`, `POST /api/rondas/:id/lista` → `SOLO_DISPOSITIVO`, y **añadirlas a `EXENTAS_DE_SESION` en `tests/guardia.test.ts`** citando la spec 3.1.
   - Todo `/api/admin/*` (clientes en admin, importar menú) → `ADMIN`.
2. **`pedido.mesero_id` se llama `usuario_id`** y **no viene del cuerpo**: `crearPedido` toma `usuarioDe(req).id`. Las pruebas del plan 2 que mandan `mesero_id: meseroId` en `POST /api/pedidos` lo quitan; el usuario es el de la sesión de prueba (`ctx.admin`) o el de `abrirSesionDePrueba`.
3. **`cerrarJornada` llama `cerrarSesionesDeRol(tx, 'mesero')`** dentro de su transacción (regla 29), y su prueba comprueba que una sesión de mesero deja de valer y una de caja sigue.
4. **La carga masiva por CSV (plan 3, Task 6) llama `registrarCambioPrecio(tx, ...)`** por cada producto cuyo precio cambia, con el `usuarioId` de la sesión, dentro de la transacción de la importación (regla 30). Su prueba cuenta filas en `cambio_precio`.
5. **Las pantallas de mesero y caja** (plan 2, tareas 7 y 8) usan `useSesion()` para saber quién toma el pedido y muestran `<BarraSesion />`; el botón "Cambiar" mesero de la spec original ya no existe (spec 12.4). No hay lista de meseros en `/api/estado`.
6. **Las pruebas nuevas** siguen usando `crearAppDePrueba()` (ya trae sesión de admin desde la PC de caja). Para probar como mesero o caja: `crearUsuarioDePrueba` + `abrirSesionDePrueba` de `tests/ayuda/acceso.ts`, y `remoteAddress: IP_REMOTA` con `autorizarDispositivoDePrueba` cuando haga falta un aparato.
7. **La pantalla de cocina** (plan 3, Task 1) va dentro de `<Acceso rolesPermitidos={null}>` (ya está así en `main.tsx`); no muestra precios ni dinero, como manda la regla 22.
8. **Plan 4, Task 3 (lanzador de Windows):** ofrecer "Restablecer PIN de administrador", que ejecuta `npm run restablecer-pin` (o su equivalente empaquetado). Plan 4, manual: la recomendación de red de la spec sección 11.

## Decisiones del plan (no están en la spec; el revisor las conoce y no las cuenta como desvío)

- **Tokens en cookies `HttpOnly`** y no en cabeceras: `EventSource` (`/api/eventos`) no puede mandar cabeceras propias y esa ruta exige dispositivo. Una sola forma de transporte para todo. `SameSite=Strict`, sin `Secure` (HTTP en red local).
- **Sesión atada al aparato** (`sesion.dispositivo_id` debe coincidir con la cookie de dispositivo, o ser nula y venir de 127.0.0.1). No está en la spec; cuesta tres líneas y hace inútil copiar una cookie de sesión a otro aparato.
- **`/api/estado` deja de devolver la lista de meseros**: la lista de nombres para entrar es `GET /api/sesion/usuarios`, y `/api/estado` es una ruta sin sesión (cocina).
- **Rutas bajo `/api/` sin declaración: el arranque falla** (`onRoute`), y si aun así una URL sin ruta llega al guardia (404) se trata como admin: 403/401 antes que 404.
- **Un usuario desactivado pierde sus sesiones en la siguiente petición** (`buscarSesionViva` exige `activo`).
- **Tope de 20 solicitudes de aparato pendientes a la vez** (409): evita que alguien en la WiFi llene la lista de admin o agote los códigos.
- **Bloqueo de la PC de caja por intentos fallidos en memoria del proceso**, con los intentos registrados en `intento_fallido` con `dispositivo_id` nulo (ver Huecos, punto 2).

## Huecos encontrados en la spec (no se cambió la spec; decidir y anotar en la spec al cerrar el plan)

1. **5.2.5 dice que `GET /api/dispositivos/estado` "devuelve el token definitivo"** y 4.2 dice que en el servidor solo queda la huella del token. Las dos cosas no pueden ser: para entregar el token en la consulta de estado habría que guardarlo en claro hasta entonces. El plan lo entrega en `POST /api/dispositivos/solicitar` (cookie `HttpOnly`) y solo empieza a servir al autorizar; `estado` devuelve `{ estado }`. Recomendación: corregir 5.2.5 y la línea de `GET /api/dispositivos/estado` en la sección 7.
2. **4.4 y 5.3.5 definen el bloqueo por intentos "desde un mismo dispositivo"**, pero la PC de caja no tiene fila de dispositivo (5.2.6). La spec no dice qué pasa con 5 fallos desde la PC de caja. El plan aplica la misma regla en memoria del proceso (se pierde al reiniciar el servidor, que exige acceso físico) y registra los intentos con `dispositivo_id` nulo, que admin muestra como "PC de caja". Recomendación: añadirlo a 4.4.
3. **4.3 nombra `creada_en` en `sesion` y 4.4 `ocurrido_en` en `intento_fallido`**, mientras la restricción global del proyecto dice que toda tabla lleva `creado_en`/`actualizado_en`. El plan usa `creado_en` para ambos (sin columna duplicada); `listarDispositivos` lo expone como `ocurrido_en`. Recomendación: alinear los nombres en 4.3 y 4.4.
4. **3.1 exime `GET /api/instalacion` de dispositivo y sesión pero lo limita a 127.0.0.1**; 5.1.2 dice "cualquier pantalla que reciba eso muestra la instalación". Un celular nunca recibe `{ instalado: false }` (recibe 403). El plan sigue 3.1: solo la PC de caja ve la instalación; un celular antes de instalar ve la pantalla de código (que nadie podrá autorizar hasta instalar). Recomendación: precisar 5.1.2 ("la PC de caja").
5. **7 dice `POST /api/sesion → { token, usuario }`** y 8/5.4 hablan de expiración en pantalla. El plan añade `expira_en` a esa respuesta y a `GET /api/sesion` (ya lo tiene). Recomendación: añadir `expira_en` en 7.
6. ~~**Cambiar el PIN de un usuario (o desactivarlo) no dice qué pasa con sus sesiones abiertas.**~~ **Resuelto por Dave el 2026-09-17: al instante.** Cambiar el PIN cierra las sesiones abiertas de ese usuario, en la misma transacción que escribe el PIN nuevo (`cambiarPin`, Task 2, con su prueba). Desactivar ya cortaba el acceso en la petición siguiente. Anotado en la spec 4.1.
7. **Revocar un aparato pendiente** (no autorizado todavía) no está descrito; el plan lo marca `revocado` (desaparece de la lista) y su cookie nunca sirve. Recomendación: una línea en 4.2.
8. **`autorizado_por`** exige un usuario, pero hasta la Task 4 de este plan no hay sesión; el plan lo deja nulo en ese tramo y siempre lleno después. No es hueco de la spec, solo orden de construcción; se anota para el revisor de Task 3.

## Correcciones hechas durante la ejecución

**C1, Task 3 (2026-09-18): el guardia de este plan podía evadirse desde la WiFi.** El `onRequest` que este plan trae en las Tasks 3 y 4 decide si una petición es de la API mirando si `req.url` empieza por `/api/`. El enrutador de Fastify (`find-my-way`) decodifica la dirección antes de elegir la ruta (`%61` pasa a `a`) y quita esquema y servidor de las peticiones en forma absoluta, así que `GET /%61pi/admin/configuracion` o `GET http://x/api/estado` llegaban al manejador sin pasar por ninguna capa. La revisión lo reprodujo en vivo: un aparato sin autorizar se autorizó a sí mismo en dos peticiones. Corregido en el commit `19cc528`: la decisión la toma `accesoExigido(req)`, que usa la declaración de la ruta elegida por el enrutador y solo recurre al texto (normalizado de forma igual o más restrictiva que el enrutador) cuando no hay ruta. La Task 4 construye las capas 2 y 3 sobre esa función, y su barrido de rutas ataca también con direcciones codificadas. **Quien relea este plan: el código del `onRequest` de las Tasks 3 y 4 no es el que quedó; el que vale es el del repositorio.**

