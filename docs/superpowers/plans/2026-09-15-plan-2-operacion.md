# Plan 2 de 4 — Operación del Núcleo POS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la cafetería pueda operar un día completo: abrir caja, tomar pedidos por mesa desde el celular del mesero con control de stock, agregar y anular en caja, dividir cuentas, cobrar con varios métodos, imprimir ticket y cerrar caja con arqueo.

**Architecture:** Módulos del servidor por dominio (`jornada`, `totales`, `pedidos`, `cuentas`, `clientes`, `ticket`), cada uno con funciones puras o con `Db` y su función `rutasX(app)`. Toda regla de negocio vive en el servidor y se prueba con `app.inject()` contra PostgreSQL real. Las pantallas de mesero y caja consumen la API y se refrescan con los eventos SSE del plan 1.

**Tech Stack:** el del plan 1. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-12-nucleo-pos-design.md` secciones 4.2, 4.3, 4.5, 5 (reglas 1 a 15), 6, 7.1, 7.3, 7.5. **Requiere plan 1 terminado** (`docs/superpowers/plans/2026-09-15-plan-1-cimientos.md`).

**Modelos y skills:** no hay modelo por defecto. Cada tarea indica abajo su modelo ejecutor, su skill, su revisor y su motivo. Resumen de este plan:

| Tarea | Modelo ejecutor | Skill principal | Revisor |
|---|---|---|---|
| Task 1 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 2 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 3 | `claude-fable-5-1` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 4 | `claude-fable-5-1` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 5 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 6 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 7 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 8 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |

**Revisión de cada tarea:** el revisor usa `superpowers:requesting-code-review` con modelo `claude-fable-5-1`: primero revisa contra la spec (¿hace lo que el plan pide, ni más ni menos?), luego calidad del código. Si hay observaciones, el ejecutor las atiende con `superpowers:receiving-code-review` y se vuelve a revisar. La tarea solo se marca terminada cuando el revisor aprueba y `superpowers:verification-before-completion` confirma la salida del comando de verificación.

## Global Constraints

- Las del plan 1 (español, `{error}`, puertos, montos `numeric(10,2)` que Drizzle devuelve como `string`).
- Toda operación de pedidos, rondas, cuentas y pagos exige jornada abierta: si no la hay, 409 `No hay caja abierta`.
- Redondeo a 2 decimales en cada paso con `redondear()` de `totales.ts`. Comparaciones de dinero con tolerancia 0.005.
- Idempotencia: rondas, pagos y (en plan 3) abonos reciben `id` uuid generado en el cliente. Si ya existe, se devuelve el resultado anterior con HTTP 200.
- Cada tarea termina con `npm run typecheck && npm test`, commit y `git push origin main`.

## Ajuste a la spec decidido en este plan

- Regla 4.2 "cuenta": la spec decía que la cuenta 1 no se puede eliminar. Se cambia a: **se puede eliminar cualquier cuenta vacía siempre que quede al menos una cuenta en el pedido**. Motivo: si caja mueve todos los ítems de la cuenta 1 a la 2, la cuenta 1 vacía nunca podría cobrarse y la mesa nunca se liberaría. (Reflejar en la spec al cerrar el plan.)
- Un pago debe ser mayor a 0, salvo que el saldo de la cuenta sea 0 (ítems gratis), en cuyo caso se acepta un pago de 0 para marcarla cobrada.

## File Structure

```
src/servidor/modulos/totales.ts     puro: redondear, calcularTotales, validarDescuento
src/servidor/modulos/jornada.ts     obtenerJornadaAbierta, requerirJornadaAbierta, abrirJornada, cerrarJornada, rutasJornada
src/servidor/modulos/pedidos.ts     crearPedido, listarMesas, obtenerPedido, enviarRonda, anularItem, anularPedido, marcarAvisoVisto, rutasPedidos
src/servidor/modulos/cuentas.ts     crearCuenta, eliminarCuenta, moverItems, editarCuenta, registrarPago, rutasCuentas
src/servidor/modulos/clientes.ts    buscarClientes, crearCliente, editarCliente, rutasClientes
src/servidor/modulos/ticket.ts      generarTicketHtml, rutaTicket
src/servidor/app.ts                 registrar rutas nuevas
src/web/comun/dinero.ts             formato de montos
src/web/comun/Catalogo.tsx          selector de productos reutilizado por mesero y caja (stock, ítem libre)
src/web/mesero/AppMesero.tsx        elegir mesero, mesas, pedido, nueva ronda
src/web/caja/AppCaja.tsx            barra de jornada, mesas, pedido, cuentas, pagos
src/web/caja/AbrirCaja.tsx, CerrarCaja.tsx, Pedido.tsx, Cuenta.tsx, Dividir.tsx, ClienteSelector.tsx
tests/totales.test.ts, jornada.test.ts, pedidos.test.ts, cuentas.test.ts, clientes.test.ts, ticket.test.ts
tests/ayuda/datos.ts                helpers: abrirCajaDePrueba, crearMenuDePrueba, crearMeseroDePrueba
```

---

### Task 1: Totales (función pura)
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/modulos/totales.ts`, `tests/totales.test.ts`

**Interfaces:**
- Produces:
  - `redondear(n: number): number` → 2 decimales.
  - `type ItemParaTotal = { precio_unitario: string | number; cantidad: number; anulado: boolean }`
  - `type CuentaParaTotal = { descuento_tipo: 'ninguno' | 'monto' | 'porcentaje'; descuento_valor: string | number; propina: string | number }`
  - `calcularTotales(items, cuenta, pagos: { monto: string | number }[]): { subtotal, descuento, total, pagado, saldo }` (números).
  - `validarDescuento(tipo, valor, subtotal)`: lanza `ErrorValidacion` si valor < 0, porcentaje > 100 o monto > subtotal.

- [ ] **Step 1: Escribir la prueba**

`tests/totales.test.ts`:
```ts
import { test, expect } from 'vitest';
import { calcularTotales, redondear, validarDescuento } from '../src/servidor/modulos/totales';

test('redondear a 2 decimales', () => {
  expect(redondear(1.005)).toBe(1.01);
  expect(redondear(2.675)).toBe(2.68);
  expect(redondear(10)).toBe(10);
});

test('totales sin descuento ni propina', () => {
  const t = calcularTotales([{ precio_unitario: '2.50', cantidad: 2, anulado: false }, { precio_unitario: '4.50', cantidad: 1, anulado: false }, { precio_unitario: '9.99', cantidad: 1, anulado: true }],
    { descuento_tipo: 'ninguno', descuento_valor: '0', propina: '0' }, []);
  expect(t).toEqual({ subtotal: 9.5, descuento: 0, total: 9.5, pagado: 0, saldo: 9.5 });
});

test('descuento por porcentaje, propina y pagos parciales', () => {
  const t = calcularTotales([{ precio_unitario: 12.5, cantidad: 1, anulado: false }],
    { descuento_tipo: 'porcentaje', descuento_valor: 10, propina: 1 }, [{ monto: '6.25' }, { monto: 6 }]);
  expect(t).toEqual({ subtotal: 12.5, descuento: 1.25, total: 12.25, pagado: 12.25, saldo: 0 });
});

test('descuento por monto', () => {
  const t = calcularTotales([{ precio_unitario: 10, cantidad: 1, anulado: false }], { descuento_tipo: 'monto', descuento_valor: '3', propina: 0 }, []);
  expect(t.total).toBe(7);
});

test('validarDescuento rechaza valores imposibles', () => {
  expect(() => validarDescuento('monto', 11, 10)).toThrow('El descuento no puede superar el subtotal');
  expect(() => validarDescuento('porcentaje', 101, 10)).toThrow('El porcentaje de descuento debe estar entre 0 y 100');
  expect(() => validarDescuento('monto', -1, 10)).toThrow('El descuento no puede ser negativo');
  expect(() => validarDescuento('ninguno', 0, 10)).not.toThrow();
});
```

- [ ] **Step 2: Ejecutar para ver que falla**

Run: `npm test -- tests/totales.test.ts` → FAIL, módulo no existe.

- [ ] **Step 3: Escribir totales.ts**

`src/servidor/modulos/totales.ts`:
```ts
import { ErrorValidacion } from '../errores';

export function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type ItemParaTotal = { precio_unitario: string | number; cantidad: number; anulado: boolean };
export type CuentaParaTotal = { descuento_tipo: 'ninguno' | 'monto' | 'porcentaje'; descuento_valor: string | number; propina: string | number };

export function validarDescuento(tipo: CuentaParaTotal['descuento_tipo'], valor: string | number, subtotal: number) {
  const v = Number(valor);
  if (tipo === 'ninguno') return;
  if (Number.isNaN(v) || v < 0) throw new ErrorValidacion('El descuento no puede ser negativo');
  if (tipo === 'porcentaje' && v > 100) throw new ErrorValidacion('El porcentaje de descuento debe estar entre 0 y 100');
  if (tipo === 'monto' && v > subtotal + 0.005) throw new ErrorValidacion('El descuento no puede superar el subtotal');
}

export function calcularTotales(items: ItemParaTotal[], cuenta: CuentaParaTotal, pagos: { monto: string | number }[]) {
  const subtotal = redondear(items.filter((i) => !i.anulado).reduce((s, i) => s + redondear(Number(i.precio_unitario) * i.cantidad), 0));
  const v = Number(cuenta.descuento_valor) || 0;
  const descuento = cuenta.descuento_tipo === 'monto' ? redondear(Math.min(v, subtotal)) : cuenta.descuento_tipo === 'porcentaje' ? redondear(subtotal * v / 100) : 0;
  const total = redondear(subtotal - descuento + (Number(cuenta.propina) || 0));
  const pagado = redondear(pagos.reduce((s, p) => s + Number(p.monto), 0));
  const saldo = redondear(total - pagado);
  return { subtotal, descuento, total, pagado, saldo };
}
```

- [ ] **Step 4: Ejecutar** → `npm test -- tests/totales.test.ts` → 5 passed.

- [ ] **Step 5: Commit y push**

```bash
git add -A && git commit -m "Totales de cuenta: cálculo puro con descuento, propina y saldo" && git push origin main
```

---

### Task 2: Jornada: abrir y cerrar caja
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/modulos/jornada.ts`, `tests/ayuda/datos.ts`, `tests/jornada.test.ts`
- Modify: `src/servidor/app.ts`

**Interfaces:**
- Consumes: `ajustarStock` (plan 1), `calcularTotales`.
- Produces:
  - `obtenerJornadaAbierta(db): Promise<Jornada | null>`
  - `requerirJornadaAbierta(db): Promise<Jornada>` → 409 `No hay caja abierta`.
  - `abrirJornada(db, { fondo_inicial: number, ajustes_stock?: { producto_id: string; stock: number }[] }): Promise<Jornada>` → 409 `Ya hay una caja abierta`; fondo ≥ 0; cada ajuste crea movimiento con origen `apertura` y motivo `Apertura de caja`.
  - `cerrarJornada(db, { efectivo_contado: number }): Promise<Jornada>` → 409 `Hay mesas ocupadas; cobra o anula los pedidos antes de cerrar`; congela totales según spec regla 12.
  - `resumenJornada(db, jornadaId)`: los mismos totales sin congelar (para mostrar antes de cerrar y para reportes del plan 3).
  - Rutas: `POST /api/jornadas/abrir`, `POST /api/jornadas/cerrar`, `GET /api/jornadas/actual/resumen`, `GET /api/jornadas` (historial, más reciente primero).
  - Helpers de prueba en `tests/ayuda/datos.ts`: `abrirCajaDePrueba(app, fondo = 20)`, `crearMenuDePrueba(app)` → `{ categoriaId, capuchinoId (sin stock, 2.50), sandwichId (stock 12, 4.50), bolonId (stock 2, 3.00) }`, `crearMeseroDePrueba(app, nombre = 'Carlos')` → id.

- [ ] **Step 1: Escribir helpers y pruebas**

`tests/ayuda/datos.ts`:
```ts
import type { FastifyInstance } from 'fastify';

export async function crearMeseroDePrueba(app: FastifyInstance, nombre = 'Carlos'): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/admin/meseros', payload: { nombre } });
  return r.json().id;
}

export async function crearMenuDePrueba(app: FastifyInstance) {
  const cat = await app.inject({ method: 'POST', url: '/api/admin/categorias', payload: { nombre: 'Todo', orden: 1 } });
  const categoriaId = cat.json().id;
  const crear = async (p: any) => (await app.inject({ method: 'POST', url: '/api/admin/productos', payload: { categoria_id: categoriaId, ...p } })).json().id;
  return {
    categoriaId,
    capuchinoId: await crear({ nombre: 'Capuchino', precio: 2.5, controla_stock: false }),
    sandwichId: await crear({ nombre: 'Sándwich de pollo', precio: 4.5, controla_stock: true, stock_actual: 12 }),
    bolonId: await crear({ nombre: 'Bolón', precio: 3, controla_stock: true, stock_actual: 2 }),
  };
}

export async function abrirCajaDePrueba(app: FastifyInstance, fondo = 20) {
  const r = await app.inject({ method: 'POST', url: '/api/jornadas/abrir', payload: { fondo_inicial: fondo } });
  if (r.statusCode !== 201) throw new Error(`No se pudo abrir caja: ${r.body}`);
  return r.json();
}
```

`tests/jornada.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';
import { crearMenuDePrueba } from './ayuda/datos';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
let menu: Awaited<ReturnType<typeof crearMenuDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); menu = await crearMenuDePrueba(ctx.app); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('cerrar sin caja abierta responde 409', async () => {
  const r = await ctx.app.inject({ method: 'POST', url: '/api/jornadas/cerrar', payload: { efectivo_contado: 0 } });
  expect(r.statusCode).toBe(409);
  expect(r.json().error).toBe('No hay caja abierta');
});

test('abrir caja con fondo y ajuste de stock, y no abrir dos veces', async () => {
  const eventos: string[] = [];
  ctx.app.bus.suscribir((e) => eventos.push(e.nombre));
  const r = await ctx.app.inject({ method: 'POST', url: '/api/jornadas/abrir', payload: { fondo_inicial: 25, ajustes_stock: [{ producto_id: menu.sandwichId, stock: 30 }] } });
  expect(r.statusCode).toBe(201);
  expect(r.json().fondo_inicial).toBe('25.00');
  expect(eventos).toContain('jornada');
  const p = await ctx.sql`SELECT stock_actual FROM producto WHERE id = ${menu.sandwichId}`;
  expect(p[0].stock_actual).toBe(30);
  const m = await ctx.sql`SELECT origen, cantidad FROM movimiento_stock WHERE producto_id = ${menu.sandwichId}`;
  expect(m[0]).toMatchObject({ origen: 'apertura', cantidad: 18 });
  const otra = await ctx.app.inject({ method: 'POST', url: '/api/jornadas/abrir', payload: { fondo_inicial: 1 } });
  expect(otra.statusCode).toBe(409);
  expect(otra.json().error).toBe('Ya hay una caja abierta');
  const estado = await ctx.app.inject({ method: 'GET', url: '/api/estado' });
  expect(estado.json().jornada.fondo_inicial).toBe('25.00');
});

test('fondo negativo se rechaza', async () => {
  await ctx.app.inject({ method: 'POST', url: '/api/jornadas/cerrar', payload: { efectivo_contado: 25 } });
  const r = await ctx.app.inject({ method: 'POST', url: '/api/jornadas/abrir', payload: { fondo_inicial: -1 } });
  expect(r.statusCode).toBe(400);
});

test('cerrar caja sin ventas congela totales y arqueo', async () => {
  await ctx.app.inject({ method: 'POST', url: '/api/jornadas/abrir', payload: { fondo_inicial: 20 } });
  const resumen = await ctx.app.inject({ method: 'GET', url: '/api/jornadas/actual/resumen' });
  expect(resumen.json().efectivo_esperado).toBe(20);
  const r = await ctx.app.inject({ method: 'POST', url: '/api/jornadas/cerrar', payload: { efectivo_contado: 18.5 } });
  expect(r.statusCode).toBe(200);
  expect(r.json().cerrada_en).not.toBeNull();
  expect(r.json().total_ventas).toBe('0.00');
  expect(r.json().efectivo_esperado).toBe('20.00');
  expect(r.json().diferencia_efectivo).toBe('-1.50');
  const hist = await ctx.app.inject({ method: 'GET', url: '/api/jornadas' });
  expect(hist.json().length).toBeGreaterThanOrEqual(2);
  expect(hist.json()[0].cerrada_en).not.toBeNull();
});
```

- [ ] **Step 2: Ejecutar** → `npm test -- tests/jornada.test.ts` → FAIL (404).

- [ ] **Step 3: Escribir jornada.ts**

`src/servidor/modulos/jornada.ts`:
```ts
import { and, desc, eq, gte, isNull, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { jornada, pedido, cuenta, pedidoItem, pago, egreso, abono } from '../db/schema';
import { ErrorNegocio, ErrorValidacion } from '../errores';
import { ajustarStock } from './catalogo';
import { calcularTotales, redondear } from './totales';

export type Jornada = typeof jornada.$inferSelect;

export async function obtenerJornadaAbierta(db: Db): Promise<Jornada | null> {
  const [j] = await db.select().from(jornada).where(isNull(jornada.cerrada_en)).limit(1);
  return j ?? null;
}

export async function requerirJornadaAbierta(db: Db): Promise<Jornada> {
  const j = await obtenerJornadaAbierta(db);
  if (!j) throw new ErrorNegocio('No hay caja abierta');
  return j;
}

function montoNoNegativo(v: unknown, mensaje: string): number {
  const n = Number(v);
  if (v === undefined || v === null || v === '' || Number.isNaN(n) || n < 0) throw new ErrorValidacion(mensaje);
  return redondear(n);
}

export async function abrirJornada(db: Db, datos: { fondo_inicial: number; ajustes_stock?: { producto_id: string; stock: number }[] }) {
  const fondo = montoNoNegativo(datos.fondo_inicial, 'El fondo inicial debe ser un monto mayor o igual a 0');
  if (await obtenerJornadaAbierta(db)) throw new ErrorNegocio('Ya hay una caja abierta');
  const [j] = await db.insert(jornada).values({ fondo_inicial: fondo.toFixed(2) }).returning();
  for (const a of datos.ajustes_stock ?? []) {
    await ajustarStock(db, a.producto_id, { stock: Number(a.stock), motivo: 'Apertura de caja', origen: 'apertura' });
  }
  return j;
}

export async function resumenJornada(db: Db, j: Jornada) {
  const pedidos = await db.select({ id: pedido.id }).from(pedido).where(eq(pedido.jornada_id, j.id));
  const ids = pedidos.map((p) => p.id);
  let total_ventas = 0, total_efectivo = 0, total_tarjeta = 0, total_transferencia = 0, total_descuentos = 0, total_propinas = 0;
  if (ids.length) {
    const cuentas = await db.select().from(cuenta).where(and(inArray(cuenta.pedido_id, ids), eq(cuenta.estado, 'cobrada')));
    const cids = cuentas.map((c) => c.id);
    const items = cids.length ? await db.select().from(pedidoItem).where(inArray(pedidoItem.cuenta_id, cids)) : [];
    const pagos = cids.length ? await db.select().from(pago).where(inArray(pago.cuenta_id, cids)) : [];
    for (const c of cuentas) {
      const t = calcularTotales(items.filter((i) => i.cuenta_id === c.id), c, []);
      total_ventas += t.subtotal - t.descuento; total_descuentos += t.descuento; total_propinas += Number(c.propina);
    }
    for (const p of pagos) {
      const m = Number(p.monto);
      if (p.metodo === 'efectivo') total_efectivo += m; else if (p.metodo === 'tarjeta') total_tarjeta += m; else total_transferencia += m;
    }
  }
  const egresos = await db.select().from(egreso).where(eq(egreso.jornada_id, j.id));
  const total_egresos = egresos.reduce((s, e) => s + Number(e.monto), 0);
  const recibidos = await db.select().from(abono).where(eq(abono.jornada_id, j.id));
  const devueltos = await db.select().from(abono).where(and(eq(abono.estado, 'devuelto'), gte(abono.devuelto_en, j.abierta_en)));
  const total_abonos_recibidos = recibidos.reduce((s, a) => s + Number(a.monto), 0);
  const total_abonos_devueltos = devueltos.reduce((s, a) => s + Number(a.monto), 0);
  const pendientes = await db.select().from(abono).where(and(eq(abono.estado, 'pendiente'), eq(abono.metodo, 'efectivo')));
  const saldo_caja_encargos = pendientes.reduce((s, a) => s + Number(a.monto), 0);
  const fondo = Number(j.fondo_inicial);
  const efectivo_esperado = redondear(fondo + total_efectivo - total_egresos);
  const r = { total_ventas, total_efectivo, total_tarjeta, total_transferencia, total_descuentos, total_propinas, total_egresos, total_abonos_recibidos, total_abonos_devueltos, saldo_caja_encargos, efectivo_esperado };
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, redondear(v)])) as typeof r;
}

export async function cerrarJornada(db: Db, datos: { efectivo_contado: number }) {
  const j = await requerirJornadaAbierta(db);
  const contado = montoNoNegativo(datos.efectivo_contado, 'El efectivo contado debe ser un monto mayor o igual a 0');
  const [abierto] = await db.select({ id: pedido.id }).from(pedido).where(and(eq(pedido.jornada_id, j.id), eq(pedido.estado, 'abierto'))).limit(1);
  if (abierto) throw new ErrorNegocio('Hay mesas ocupadas; cobra o anula los pedidos antes de cerrar');
  const r = await resumenJornada(db, j);
  const f = (n: number) => n.toFixed(2);
  const [cerrada] = await db.update(jornada).set({
    cerrada_en: new Date(), efectivo_contado: f(contado),
    total_ventas: f(r.total_ventas), total_efectivo: f(r.total_efectivo), total_tarjeta: f(r.total_tarjeta), total_transferencia: f(r.total_transferencia),
    total_descuentos: f(r.total_descuentos), total_propinas: f(r.total_propinas), total_egresos: f(r.total_egresos),
    total_abonos_recibidos: f(r.total_abonos_recibidos), total_abonos_devueltos: f(r.total_abonos_devueltos),
    efectivo_esperado: f(r.efectivo_esperado), diferencia_efectivo: f(redondear(contado - r.efectivo_esperado)), actualizado_en: new Date(),
  }).where(eq(jornada.id, j.id)).returning();
  return cerrada;
}

export function rutasJornada(app: FastifyInstance) {
  app.post('/api/jornadas/abrir', async (req, reply) => {
    const j = await abrirJornada(app.db, req.body as any);
    app.bus.emitir('jornada'); app.bus.emitir('stock');
    return reply.status(201).send(j);
  });
  app.post('/api/jornadas/cerrar', async (req) => {
    const j = await cerrarJornada(app.db, req.body as any);
    app.bus.emitir('jornada');
    return j;
  });
  app.get('/api/jornadas/actual/resumen', async () => {
    const j = await requerirJornadaAbierta(app.db);
    return { jornada: j, ...(await resumenJornada(app.db, j)) };
  });
  app.get('/api/jornadas', async () => app.db.select().from(jornada).orderBy(desc(jornada.abierta_en)).limit(200));
}
```

- [ ] **Step 4: Registrar en app.ts**: `import { rutasJornada } from './modulos/jornada';` y `rutasJornada(app);` después de `rutasCatalogo(app);`.

- [ ] **Step 5: Ejecutar** → `npm test` → todo pasa.

- [ ] **Step 6: Commit y push**

```bash
git add -A && git commit -m "Jornada: abrir y cerrar caja con arqueo y resumen" && git push origin main
```

---

### Task 3: Pedidos, mesas y rondas con descuento de stock
**Modelo ejecutor:** `claude-fable-5-1`. **Motivo:** la tarea exige criterio propio (concurrencia, dinero, depuración o selectores que el plan no puede anticipar del todo).
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/modulos/pedidos.ts`, `tests/pedidos.test.ts`
- Modify: `src/servidor/app.ts`

**Interfaces:**
- Consumes: `requerirJornadaAbierta`, `obtenerConfiguracion`, `calcularTotales`, tablas.
- Produces:
  - `crearPedido(db, { numero_mesa: number; mesero_id: string }): Promise<Pedido>` → crea cuenta 1; `numero` = siguiente en la jornada; `origen` `mesa` si `numero_mesa > 0`, si no `llevar`. Errores 409: `La mesa ya tiene un pedido abierto`; 400: `La mesa no existe` (fuera de 0..cantidad_mesas), `El mesero no existe o está inactivo`.
  - `listarMesas(db)`: `{ mesas: { numero, estado: 'libre'|'ocupada', pedido_id, total, mesero, hora_ultima_ronda, ronda_lista: boolean }[], para_llevar: { pedido_id, numero, total, mesero, ronda_lista }[] }`.
  - `obtenerPedido(db, id)`: `{ ...pedido, mesero_nombre, rondas: (Ronda & { items: Item[] })[], cuentas: (Cuenta & { items: Item[]; pagos: Pago[]; totales })[], total_pedido }`.
  - `type ItemEntrada = { producto_id?: string | null; es_libre?: boolean; nombre?: string; precio?: number | string; cantidad: number; nota?: string }`
  - `enviarRonda(db, pedidoId, { id: string; origen: 'mesero'|'caja'; enviada_a_cocina?: boolean; items: ItemEntrada[] }): Promise<{ ronda, repetida: boolean }>` — transacción con `FOR UPDATE` por producto; 409 `Se acaba de agotar: <nombre>` si no alcanza; 400 `La ronda no tiene ítems`; ítem libre 409 `Los ítems libres están desactivados` si config lo prohíbe; los ítems van a la cuenta abierta de menor número.
  - `anularItem(db, itemId, { motivo })` → 409 si cuenta cobrada o pedido no abierto; devuelve stock si `afecta_stock`.
  - `anularPedido(db, pedidoId, { motivo })` → 409 `El pedido tiene pagos registrados` si alguna cuenta tiene pagos.
  - `marcarAvisoVisto(db, rondaId, pantalla: 'mesero'|'caja')`.
  - Rutas: `GET /api/mesas`, `POST /api/pedidos`, `GET /api/pedidos/:id`, `POST /api/pedidos/:id/rondas` (201 nueva, 200 repetida), `POST /api/pedidos/:id/items/:itemId/anular`, `POST /api/pedidos/:id/anular`, `PATCH /api/pedidos/:id` (notas), `POST /api/rondas/:id/aviso-visto`.
- Eventos: `mesa` con `{ pedido_id, numero_mesa }` en crear, ronda, anulaciones; `stock` con `{ producto_id, stock_actual }` por cada producto afectado.

- [ ] **Step 1: Escribir las pruebas**

`tests/pedidos.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { crearAppDePrueba } from './ayuda/app';
import { abrirCajaDePrueba, crearMenuDePrueba, crearMeseroDePrueba } from './ayuda/datos';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
let menu: Awaited<ReturnType<typeof crearMenuDePrueba>>;
let meseroId: string;
beforeAll(async () => {
  ctx = await crearAppDePrueba();
  menu = await crearMenuDePrueba(ctx.app);
  meseroId = await crearMeseroDePrueba(ctx.app);
});
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

const post = (url: string, payload: any) => ctx.app.inject({ method: 'POST', url, payload });
const get = (url: string) => ctx.app.inject({ method: 'GET', url });

test('sin caja abierta no se crean pedidos', async () => {
  const r = await post('/api/pedidos', { numero_mesa: 1, mesero_id: meseroId });
  expect(r.statusCode).toBe(409);
  expect(r.json().error).toBe('No hay caja abierta');
});

test('crear pedido en mesa, ver mesas, no duplicar mesa', async () => {
  await abrirCajaDePrueba(ctx.app);
  const r = await post('/api/pedidos', { numero_mesa: 2, mesero_id: meseroId });
  expect(r.statusCode).toBe(201);
  expect(r.json().numero).toBe(1);
  expect(r.json().origen).toBe('mesa');
  const dup = await post('/api/pedidos', { numero_mesa: 2, mesero_id: meseroId });
  expect(dup.statusCode).toBe(409);
  expect(dup.json().error).toBe('La mesa ya tiene un pedido abierto');
  const fuera = await post('/api/pedidos', { numero_mesa: 999, mesero_id: meseroId });
  expect(fuera.statusCode).toBe(400);
  const mesas = await get('/api/mesas');
  const m2 = mesas.json().mesas.find((m: any) => m.numero === 2);
  expect(m2.estado).toBe('ocupada');
  expect(m2.pedido_id).toBe(r.json().id);
  expect(m2.mesero).toBe('Carlos');
  expect(mesas.json().mesas.find((m: any) => m.numero === 1).estado).toBe('libre');
});

test('enviar ronda descuenta stock, copia precio, va a cuenta 1 y es idempotente', async () => {
  const p = (await post('/api/pedidos', { numero_mesa: 3, mesero_id: meseroId })).json();
  const eventos: any[] = [];
  ctx.app.bus.suscribir((e) => eventos.push(e));
  const rondaId = randomUUID();
  const cuerpo = { id: rondaId, origen: 'mesero', items: [{ producto_id: menu.sandwichId, cantidad: 2, nota: 'sin mayonesa' }, { producto_id: menu.capuchinoId, cantidad: 1 }] };
  const r = await post(`/api/pedidos/${p.id}/rondas`, cuerpo);
  expect(r.statusCode).toBe(201);
  expect(r.json().ronda.numero).toBe(1);
  const otra = await post(`/api/pedidos/${p.id}/rondas`, cuerpo);
  expect(otra.statusCode).toBe(200);
  expect(otra.json().repetida).toBe(true);
  const stock = await ctx.sql`SELECT stock_actual FROM producto WHERE id = ${menu.sandwichId}`;
  expect(stock[0].stock_actual).toBe(10);
  expect(eventos.some((e) => e.nombre === 'stock' && e.datos.producto_id === menu.sandwichId && e.datos.stock_actual === 10)).toBe(true);
  const det = (await get(`/api/pedidos/${p.id}`)).json();
  expect(det.rondas).toHaveLength(1);
  expect(det.rondas[0].items).toHaveLength(2);
  expect(det.cuentas).toHaveLength(1);
  expect(det.cuentas[0].items).toHaveLength(2);
  expect(det.cuentas[0].totales.total).toBe(11.5);
  expect(det.total_pedido).toBe(11.5);
  const item = det.cuentas[0].items.find((i: any) => i.producto_id === menu.sandwichId);
  expect(item.precio_unitario).toBe('4.50');
  expect(item.nota).toBe('sin mayonesa');
  await ctx.app.inject({ method: 'PATCH', url: `/api/admin/productos/${menu.sandwichId}`, payload: { precio: 5 } });
  const det2 = (await get(`/api/pedidos/${p.id}`)).json();
  expect(det2.cuentas[0].items.find((i: any) => i.producto_id === menu.sandwichId).precio_unitario).toBe('4.50');
});

test('stock insuficiente rechaza toda la ronda sin descontar nada', async () => {
  const p = (await post('/api/pedidos', { numero_mesa: 4, mesero_id: meseroId })).json();
  const r = await post(`/api/pedidos/${p.id}/rondas`, { id: randomUUID(), origen: 'mesero', items: [{ producto_id: menu.capuchinoId, cantidad: 1 }, { producto_id: menu.bolonId, cantidad: 3 }] });
  expect(r.statusCode).toBe(409);
  expect(r.json().error).toBe('Se acaba de agotar: Bolón');
  const stock = await ctx.sql`SELECT stock_actual FROM producto WHERE id = ${menu.bolonId}`;
  expect(stock[0].stock_actual).toBe(2);
  const det = (await get(`/api/pedidos/${p.id}`)).json();
  expect(det.rondas).toHaveLength(0);
});

test('dos rondas simultaneas por el ultimo bolon: solo una gana', async () => {
  const p = (await post('/api/pedidos', { numero_mesa: 5, mesero_id: meseroId })).json();
  const [a, b] = await Promise.all([
    post(`/api/pedidos/${p.id}/rondas`, { id: randomUUID(), origen: 'mesero', items: [{ producto_id: menu.bolonId, cantidad: 2 }] }),
    post(`/api/pedidos/${p.id}/rondas`, { id: randomUUID(), origen: 'mesero', items: [{ producto_id: menu.bolonId, cantidad: 2 }] }),
  ]);
  expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
  const stock = await ctx.sql`SELECT stock_actual FROM producto WHERE id = ${menu.bolonId}`;
  expect(stock[0].stock_actual).toBe(0);
});

test('item libre respeta la configuracion', async () => {
  const p = (await post('/api/pedidos', { numero_mesa: 6, mesero_id: meseroId })).json();
  const ok = await post(`/api/pedidos/${p.id}/rondas`, { id: randomUUID(), origen: 'caja', enviada_a_cocina: false, items: [{ es_libre: true, nombre: 'Choripán sin pan', precio: 1.5, cantidad: 1 }] });
  expect(ok.statusCode).toBe(201);
  const det = (await get(`/api/pedidos/${p.id}`)).json();
  expect(det.cuentas[0].items[0]).toMatchObject({ es_libre: true, nombre_producto: 'Choripán sin pan', precio_unitario: '1.50', afecta_stock: false, producto_id: null });
  expect(det.rondas[0].enviada_a_cocina).toBe(false);
  await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { permitir_items_libres: false } });
  const no = await post(`/api/pedidos/${p.id}/rondas`, { id: randomUUID(), origen: 'caja', items: [{ es_libre: true, nombre: 'Otro', precio: 1, cantidad: 1 }] });
  expect(no.statusCode).toBe(409);
  expect(no.json().error).toBe('Los ítems libres están desactivados');
  await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { permitir_items_libres: true } });
  const sinNombre = await post(`/api/pedidos/${p.id}/rondas`, { id: randomUUID(), origen: 'caja', items: [{ es_libre: true, nombre: ' ', precio: 1, cantidad: 1 }] });
  expect(sinNombre.statusCode).toBe(400);
});

test('anular item devuelve stock; anular pedido libera la mesa', async () => {
  const p = (await post('/api/pedidos', { numero_mesa: 7, mesero_id: meseroId })).json();
  await post(`/api/pedidos/${p.id}/rondas`, { id: randomUUID(), origen: 'mesero', items: [{ producto_id: menu.sandwichId, cantidad: 3 }] });
  const antes = (await ctx.sql`SELECT stock_actual FROM producto WHERE id = ${menu.sandwichId}`)[0].stock_actual;
  const det = (await get(`/api/pedidos/${p.id}`)).json();
  const itemId = det.cuentas[0].items[0].id;
  const sinMotivo = await post(`/api/pedidos/${p.id}/items/${itemId}/anular`, { motivo: '' });
  expect(sinMotivo.statusCode).toBe(400);
  const r = await post(`/api/pedidos/${p.id}/items/${itemId}/anular`, { motivo: 'Cliente cambió de idea' });
  expect(r.statusCode).toBe(200);
  const despues = (await ctx.sql`SELECT stock_actual FROM producto WHERE id = ${menu.sandwichId}`)[0].stock_actual;
  expect(despues).toBe(antes + 3);
  const det2 = (await get(`/api/pedidos/${p.id}`)).json();
  expect(det2.cuentas[0].items[0].anulado).toBe(true);
  expect(det2.cuentas[0].totales.total).toBe(0);
  const otraVez = await post(`/api/pedidos/${p.id}/items/${itemId}/anular`, { motivo: 'x' });
  expect(otraVez.statusCode).toBe(409);
  const an = await post(`/api/pedidos/${p.id}/anular`, { motivo: 'Se fueron' });
  expect(an.statusCode).toBe(200);
  expect(an.json().estado).toBe('anulado');
  const mesas = await get('/api/mesas');
  expect(mesas.json().mesas.find((m: any) => m.numero === 7).estado).toBe('libre');
  const ronda = await post(`/api/pedidos/${p.id}/rondas`, { id: randomUUID(), origen: 'mesero', items: [{ producto_id: menu.capuchinoId, cantidad: 1 }] });
  expect(ronda.statusCode).toBe(409);
});

test('para llevar admite varios pedidos abiertos', async () => {
  const a = await post('/api/pedidos', { numero_mesa: 0, mesero_id: meseroId });
  const b = await post('/api/pedidos', { numero_mesa: 0, mesero_id: meseroId });
  expect(a.statusCode).toBe(201); expect(b.statusCode).toBe(201);
  expect(a.json().origen).toBe('llevar');
  const mesas = await get('/api/mesas');
  expect(mesas.json().para_llevar.length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Ejecutar** → `npm test -- tests/pedidos.test.ts` → FAIL (404).

- [ ] **Step 3: Escribir pedidos.ts**

`src/servidor/modulos/pedidos.ts`:
```ts
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { pedido, cuenta, ronda, pedidoItem, pago, producto, movimientoStock, mesero } from '../db/schema';
import { ErrorNegocio, ErrorValidacion, NoEncontrado } from '../errores';
import { requerirJornadaAbierta } from './jornada';
import { obtenerConfiguracion } from './configuracion';
import { calcularTotales, redondear } from './totales';

export type Pedido = typeof pedido.$inferSelect;
export type ItemEntrada = { producto_id?: string | null; es_libre?: boolean; nombre?: string; precio?: number | string; cantidad: number; nota?: string };

export async function crearPedido(db: Db, datos: { numero_mesa: number; mesero_id: string }) {
  const j = await requerirJornadaAbierta(db);
  const cfg = await obtenerConfiguracion(db);
  const numeroMesa = Number(datos.numero_mesa);
  if (!Number.isInteger(numeroMesa) || numeroMesa < 0 || numeroMesa > cfg.cantidad_mesas) throw new ErrorValidacion('La mesa no existe');
  const [m] = await db.select().from(mesero).where(and(eq(mesero.id, String(datos.mesero_id)), eq(mesero.activo, true)));
  if (!m) throw new ErrorValidacion('El mesero no existe o está inactivo');
  if (numeroMesa > 0) {
    const [abierto] = await db.select({ id: pedido.id }).from(pedido).where(and(eq(pedido.numero_mesa, numeroMesa), eq(pedido.estado, 'abierto')));
    if (abierto) throw new ErrorNegocio('La mesa ya tiene un pedido abierto');
  }
  return db.transaction(async (tx) => {
    const [{ ultimo }] = await tx.select({ ultimo: max(pedido.numero) }).from(pedido).where(eq(pedido.jornada_id, j.id));
    const [p] = await tx.insert(pedido).values({ jornada_id: j.id, numero_mesa: numeroMesa, numero: (ultimo ?? 0) + 1, mesero_id: m.id, origen: numeroMesa > 0 ? 'mesa' : 'llevar' }).returning();
    await tx.insert(cuenta).values({ pedido_id: p.id, numero: 1 });
    return p;
  });
}

async function cargarDetalle(db: Db, ids: string[]) {
  if (!ids.length) return { cuentas: [], items: [], pagos: [], rondas: [] };
  const cuentas = await db.select().from(cuenta).where(inArray(cuenta.pedido_id, ids)).orderBy(asc(cuenta.numero));
  const rondas = await db.select().from(ronda).where(inArray(ronda.pedido_id, ids)).orderBy(asc(ronda.numero));
  const cids = cuentas.map((c) => c.id);
  const items = cids.length ? await db.select().from(pedidoItem).where(inArray(pedidoItem.cuenta_id, cids)).orderBy(asc(pedidoItem.creado_en)) : [];
  const pagos = cids.length ? await db.select().from(pago).where(inArray(pago.cuenta_id, cids)).orderBy(asc(pago.creado_en)) : [];
  return { cuentas, items, pagos, rondas };
}

export function totalDePedido(pedidoId: string, d: Awaited<ReturnType<typeof cargarDetalle>>) {
  return redondear(d.cuentas.filter((c) => c.pedido_id === pedidoId).reduce((s, c) => s + calcularTotales(d.items.filter((i) => i.cuenta_id === c.id), c, []).total, 0));
}

export async function listarMesas(db: Db) {
  const cfg = await obtenerConfiguracion(db);
  const abiertos = await db.select({ p: pedido, mesero_nombre: mesero.nombre }).from(pedido).leftJoin(mesero, eq(mesero.id, pedido.mesero_id)).where(eq(pedido.estado, 'abierto'));
  const d = await cargarDetalle(db, abiertos.map((a) => a.p.id));
  const resumen = (a: typeof abiertos[number]) => {
    const rs = d.rondas.filter((r) => r.pedido_id === a.p.id);
    const ultima = rs.length ? rs[rs.length - 1].creado_en : a.p.creado_en;
    return { pedido_id: a.p.id, numero: a.p.numero, total: totalDePedido(a.p.id, d), mesero: a.mesero_nombre ?? null, hora_ultima_ronda: ultima,
      ronda_lista: rs.some((r) => r.estado === 'lista' && !r.aviso_visto_mesero) };
  };
  const mesas = [];
  for (let n = 1; n <= cfg.cantidad_mesas; n++) {
    const a = abiertos.find((x) => x.p.numero_mesa === n);
    mesas.push(a ? { numero: n, estado: 'ocupada' as const, ...resumen(a) } : { numero: n, estado: 'libre' as const, pedido_id: null, total: 0, mesero: null, hora_ultima_ronda: null, ronda_lista: false });
  }
  const para_llevar = abiertos.filter((x) => x.p.numero_mesa === 0).map(resumen);
  return { mesas, para_llevar };
}

export async function obtenerPedido(db: Db, id: string) {
  const [fila] = await db.select({ p: pedido, mesero_nombre: mesero.nombre }).from(pedido).leftJoin(mesero, eq(mesero.id, pedido.mesero_id)).where(eq(pedido.id, id));
  if (!fila) throw new NoEncontrado('El pedido no existe');
  const d = await cargarDetalle(db, [id]);
  const rondas = d.rondas.map((r) => ({ ...r, items: d.items.filter((i) => i.ronda_id === r.id) }));
  const cuentas = d.cuentas.map((c) => {
    const items = d.items.filter((i) => i.cuenta_id === c.id);
    const pagos = d.pagos.filter((p) => p.cuenta_id === c.id);
    return { ...c, items, pagos, totales: calcularTotales(items, c, pagos) };
  });
  return { ...fila.p, mesero_nombre: fila.mesero_nombre ?? null, rondas, cuentas, total_pedido: totalDePedido(id, d) };
}

async function pedidoAbierto(db: Db, id: string) {
  const [p] = await db.select().from(pedido).where(eq(pedido.id, id));
  if (!p) throw new NoEncontrado('El pedido no existe');
  if (p.estado !== 'abierto') throw new ErrorNegocio('El pedido ya está cobrado o anulado');
  return p;
}

export async function enviarRonda(db: Db, pedidoId: string, datos: { id: string; origen: 'mesero' | 'caja'; enviada_a_cocina?: boolean; items: ItemEntrada[] }) {
  await requerirJornadaAbierta(db);
  if (!datos.id) throw new ErrorValidacion('La ronda necesita un id');
  const [existente] = await db.select().from(ronda).where(eq(ronda.id, datos.id));
  if (existente) return { ronda: existente, repetida: true, stockCambiado: [] as { producto_id: string; stock_actual: number }[] };
  const p = await pedidoAbierto(db, pedidoId);
  const items = Array.isArray(datos.items) ? datos.items : [];
  if (!items.length) throw new ErrorValidacion('La ronda no tiene ítems');
  const cfg = await obtenerConfiguracion(db);
  const origen = datos.origen === 'caja' ? 'caja' : 'mesero';
  const enviada = datos.enviada_a_cocina === undefined ? true : Boolean(datos.enviada_a_cocina);
  const stockCambiado: { producto_id: string; stock_actual: number }[] = [];

  const nueva = await db.transaction(async (tx) => {
    const [destino] = await tx.select().from(cuenta).where(and(eq(cuenta.pedido_id, p.id), eq(cuenta.estado, 'abierta'))).orderBy(asc(cuenta.numero)).limit(1);
    if (!destino) throw new ErrorNegocio('El pedido no tiene cuentas abiertas');
    const [{ ultimo }] = await tx.select({ ultimo: max(ronda.numero) }).from(ronda).where(eq(ronda.pedido_id, p.id));
    const [r] = await tx.insert(ronda).values({ id: datos.id, pedido_id: p.id, numero: (ultimo ?? 0) + 1, origen, enviada_a_cocina: enviada }).returning();
    for (const it of items) {
      const cantidad = Number(it.cantidad);
      if (!Number.isInteger(cantidad) || cantidad < 1) throw new ErrorValidacion('La cantidad debe ser un entero mayor a 0');
      const nota = it.nota ? String(it.nota).trim() || null : null;
      if (it.es_libre) {
        if (!cfg.permitir_items_libres) throw new ErrorNegocio('Los ítems libres están desactivados');
        const nombre = String(it.nombre ?? '').trim();
        if (!nombre) throw new ErrorValidacion('El ítem libre necesita un nombre');
        const precio = Number(it.precio);
        if (Number.isNaN(precio) || precio < 0) throw new ErrorValidacion('El precio del ítem libre debe ser mayor o igual a 0');
        await tx.insert(pedidoItem).values({ ronda_id: r.id, cuenta_id: destino.id, producto_id: null, es_libre: true, nombre_producto: nombre, precio_unitario: redondear(precio).toFixed(2), cantidad, nota, afecta_stock: false });
        continue;
      }
      const [prod] = await tx.select().from(producto).where(eq(producto.id, String(it.producto_id))).for('update');
      if (!prod || !prod.activo) throw new ErrorValidacion('El producto no existe o está inactivo');
      let afectaStock = false;
      if (prod.controla_stock) {
        const actual = prod.stock_actual ?? 0;
        if (actual < cantidad) throw new ErrorNegocio(`Se acaba de agotar: ${prod.nombre}`);
        afectaStock = true;
        const nuevo = actual - cantidad;
        await tx.update(producto).set({ stock_actual: nuevo, actualizado_en: new Date() }).where(eq(producto.id, prod.id));
        stockCambiado.push({ producto_id: prod.id, stock_actual: nuevo });
      }
      const [item] = await tx.insert(pedidoItem).values({ ronda_id: r.id, cuenta_id: destino.id, producto_id: prod.id, es_libre: false, nombre_producto: prod.nombre, precio_unitario: prod.precio, cantidad, nota, afecta_stock: afectaStock }).returning();
      if (afectaStock) {
        await tx.insert(movimientoStock).values({ producto_id: prod.id, jornada_id: p.jornada_id, cantidad: -cantidad, stock_resultante: stockCambiado[stockCambiado.length - 1].stock_actual, origen: 'venta', pedido_item_id: item.id });
      }
    }
    return r;
  });
  return { ronda: nueva, repetida: false, stockCambiado };
}

export async function anularItem(db: Db, pedidoId: string, itemId: string, datos: { motivo: string }) {
  await requerirJornadaAbierta(db);
  const motivo = String(datos?.motivo ?? '').trim();
  if (!motivo) throw new ErrorValidacion('La anulación necesita un motivo');
  const p = await pedidoAbierto(db, pedidoId);
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(pedidoItem).where(eq(pedidoItem.id, itemId)).for('update');
    if (!item) throw new NoEncontrado('El ítem no existe');
    const [c] = await tx.select().from(cuenta).where(eq(cuenta.id, item.cuenta_id));
    if (!c || c.pedido_id !== p.id) throw new NoEncontrado('El ítem no pertenece a este pedido');
    if (c.estado === 'cobrada') throw new ErrorNegocio('La cuenta ya está cobrada');
    if (item.anulado) throw new ErrorNegocio('El ítem ya está anulado');
    const [actualizado] = await tx.update(pedidoItem).set({ anulado: true, motivo_anulacion: motivo, anulado_en: new Date(), actualizado_en: new Date() }).where(eq(pedidoItem.id, itemId)).returning();
    let stock: { producto_id: string; stock_actual: number } | null = null;
    if (item.afecta_stock && item.producto_id) {
      const [prod] = await tx.select().from(producto).where(eq(producto.id, item.producto_id)).for('update');
      const nuevo = (prod.stock_actual ?? 0) + item.cantidad;
      await tx.update(producto).set({ stock_actual: nuevo, actualizado_en: new Date() }).where(eq(producto.id, prod.id));
      await tx.insert(movimientoStock).values({ producto_id: prod.id, jornada_id: p.jornada_id, cantidad: item.cantidad, stock_resultante: nuevo, origen: 'anulacion', motivo, pedido_item_id: item.id });
      stock = { producto_id: prod.id, stock_actual: nuevo };
    }
    return { item: actualizado, stock };
  });
}

export async function anularPedido(db: Db, pedidoId: string, datos: { motivo: string }) {
  await requerirJornadaAbierta(db);
  const motivo = String(datos?.motivo ?? '').trim();
  if (!motivo) throw new ErrorValidacion('La anulación necesita un motivo');
  const p = await pedidoAbierto(db, pedidoId);
  const d = await cargarDetalle(db, [p.id]);
  if (d.pagos.length) throw new ErrorNegocio('El pedido tiene pagos registrados');
  const stocks: { producto_id: string; stock_actual: number }[] = [];
  for (const it of d.items.filter((i) => !i.anulado)) {
    const r = await anularItem(db, p.id, it.id, { motivo });
    if (r.stock) stocks.push(r.stock);
  }
  const [anulado] = await db.update(pedido).set({ estado: 'anulado', notas: sql`coalesce(${pedido.notas}, '') || ${' Anulado: ' + motivo}`, actualizado_en: new Date() }).where(eq(pedido.id, p.id)).returning();
  return { pedido: anulado, stocks };
}

export async function marcarAvisoVisto(db: Db, rondaId: string, pantalla: 'mesero' | 'caja') {
  const cambios = pantalla === 'caja' ? { aviso_visto_caja: true } : { aviso_visto_mesero: true };
  const [r] = await db.update(ronda).set({ ...cambios, actualizado_en: new Date() }).where(eq(ronda.id, rondaId)).returning();
  if (!r) throw new NoEncontrado('La ronda no existe');
  return r;
}

export function rutasPedidos(app: FastifyInstance) {
  const emitirStock = (lista: { producto_id: string; stock_actual: number }[]) => { for (const s of lista) app.bus.emitir('stock', s); };
  app.get('/api/mesas', async () => listarMesas(app.db));
  app.post('/api/pedidos', async (req, reply) => {
    const p = await crearPedido(app.db, req.body as any);
    app.bus.emitir('mesa', { pedido_id: p.id, numero_mesa: p.numero_mesa });
    return reply.status(201).send(p);
  });
  app.get<{ Params: { id: string } }>('/api/pedidos/:id', async (req) => obtenerPedido(app.db, req.params.id));
  app.patch<{ Params: { id: string } }>('/api/pedidos/:id', async (req) => {
    const p = await pedidoAbierto(app.db, req.params.id);
    const notas = String((req.body as any)?.notas ?? '').trim() || null;
    const [r] = await app.db.update(pedido).set({ notas, actualizado_en: new Date() }).where(eq(pedido.id, p.id)).returning();
    return r;
  });
  app.post<{ Params: { id: string } }>('/api/pedidos/:id/rondas', async (req, reply) => {
    const r = await enviarRonda(app.db, req.params.id, req.body as any);
    if (!r.repetida) { app.bus.emitir('mesa', { pedido_id: req.params.id }); emitirStock(r.stockCambiado); }
    return reply.status(r.repetida ? 200 : 201).send({ ronda: r.ronda, repetida: r.repetida });
  });
  app.post<{ Params: { id: string; itemId: string } }>('/api/pedidos/:id/items/:itemId/anular', async (req) => {
    const r = await anularItem(app.db, req.params.id, req.params.itemId, req.body as any);
    app.bus.emitir('mesa', { pedido_id: req.params.id }); if (r.stock) emitirStock([r.stock]);
    return r.item;
  });
  app.post<{ Params: { id: string } }>('/api/pedidos/:id/anular', async (req) => {
    const r = await anularPedido(app.db, req.params.id, req.body as any);
    app.bus.emitir('mesa', { pedido_id: req.params.id, numero_mesa: r.pedido.numero_mesa }); emitirStock(r.stocks);
    return r.pedido;
  });
  app.post<{ Params: { id: string } }>('/api/rondas/:id/aviso-visto', async (req) => {
    const r = await marcarAvisoVisto(app.db, req.params.id, (req.body as any)?.pantalla === 'caja' ? 'caja' : 'mesero');
    app.bus.emitir('mesa', { pedido_id: r.pedido_id });
    return r;
  });
}
```

- [ ] **Step 4: Registrar en app.ts**: `import { rutasPedidos } from './modulos/pedidos';` y `rutasPedidos(app);` después de `rutasJornada(app);`.

- [ ] **Step 5: Ejecutar** → `npm run typecheck && npm test` → todo pasa. Si la prueba de concurrencia falla por deadlock, verificar que el `for('update')` está dentro de la transacción y que los ítems se procesan en el orden recibido.

- [ ] **Step 6: Commit y push**

```bash
git add -A && git commit -m "Pedidos, mesas y rondas con descuento de stock transaccional e idempotencia" && git push origin main
```

---

### Task 4: Cuentas, división y pagos
**Modelo ejecutor:** `claude-fable-5-1`. **Motivo:** la tarea exige criterio propio (concurrencia, dinero, depuración o selectores que el plan no puede anticipar del todo).
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/modulos/cuentas.ts`, `tests/cuentas.test.ts`
- Modify: `src/servidor/app.ts`

**Interfaces:**
- Consumes: `requerirJornadaAbierta`, `obtenerPedido`, `calcularTotales`, `validarDescuento`.
- Produces:
  - `crearCuenta(db, pedidoId): Promise<Cuenta>` (siguiente número).
  - `eliminarCuenta(db, cuentaId)` → 409 `La cuenta tiene ítems` / `El pedido debe conservar al menos una cuenta` / `La cuenta ya está cobrada`.
  - `moverItems(db, cuentaDestinoId, { items: { pedido_item_id: string; cantidad?: number }[] })` → mueve filas; si `cantidad` < cantidad del ítem, divide la fila (la parte movida es una fila nueva con misma ronda, producto, precio, nota, `afecta_stock`). 409 si origen o destino cobradas, o si el ítem está anulado. 400 si cantidad inválida.
  - `editarCuenta(db, cuentaId, { descuento_tipo?, descuento_valor?, propina?, cliente_id? })` → valida con `validarDescuento` contra el subtotal actual; propina ≥ 0; `cliente_id` debe existir o ser `null`. 409 si cobrada.
  - `registrarPago(db, cuentaId, { id, metodo, monto, referencia? })` → `{ pago, cuenta, pedido, totales, repetido }`; 409 `El pago supera el saldo pendiente`; 400 monto ≤ 0 salvo saldo 0; marca cuenta `cobrada` cuando `saldo <= 0.005`; marca pedido `cobrado` cuando todas sus cuentas están cobradas.
  - Rutas: `POST /api/pedidos/:id/cuentas` (201), `DELETE /api/cuentas/:id`, `POST /api/cuentas/:id/items`, `PATCH /api/cuentas/:id`, `POST /api/cuentas/:id/pagos` (201 nuevo, 200 repetido). Todas emiten `mesa` con `{ pedido_id }`.

- [ ] **Step 1: Escribir las pruebas**

`tests/cuentas.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { crearAppDePrueba } from './ayuda/app';
import { abrirCajaDePrueba, crearMenuDePrueba, crearMeseroDePrueba } from './ayuda/datos';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
let menu: Awaited<ReturnType<typeof crearMenuDePrueba>>;
let meseroId: string;
beforeAll(async () => {
  ctx = await crearAppDePrueba();
  menu = await crearMenuDePrueba(ctx.app);
  meseroId = await crearMeseroDePrueba(ctx.app);
  await abrirCajaDePrueba(ctx.app);
});
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

const post = (url: string, payload: any) => ctx.app.inject({ method: 'POST', url, payload });
const patch = (url: string, payload: any) => ctx.app.inject({ method: 'PATCH', url, payload });
const get = (url: string) => ctx.app.inject({ method: 'GET', url });
const del = (url: string) => ctx.app.inject({ method: 'DELETE', url });

async function pedidoConItems(mesa: number) {
  const p = (await post('/api/pedidos', { numero_mesa: mesa, mesero_id: meseroId })).json();
  await post(`/api/pedidos/${p.id}/rondas`, { id: randomUUID(), origen: 'mesero', items: [{ producto_id: menu.capuchinoId, cantidad: 2 }, { producto_id: menu.sandwichId, cantidad: 1 }] });
  return (await get(`/api/pedidos/${p.id}`)).json();
}

test('cobrar una mesa completa con dos metodos libera la mesa', async () => {
  const p = await pedidoConItems(1);
  const c = p.cuentas[0];
  expect(c.totales.total).toBe(9.5);
  const demas = await post(`/api/cuentas/${c.id}/pagos`, { id: randomUUID(), metodo: 'efectivo', monto: 10 });
  expect(demas.statusCode).toBe(409);
  expect(demas.json().error).toBe('El pago supera el saldo pendiente');
  const cero = await post(`/api/cuentas/${c.id}/pagos`, { id: randomUUID(), metodo: 'efectivo', monto: 0 });
  expect(cero.statusCode).toBe(400);
  const idPago = randomUUID();
  const p1 = await post(`/api/cuentas/${c.id}/pagos`, { id: idPago, metodo: 'efectivo', monto: 5 });
  expect(p1.statusCode).toBe(201);
  expect(p1.json().totales.saldo).toBe(4.5);
  expect(p1.json().cuenta.estado).toBe('abierta');
  const rep = await post(`/api/cuentas/${c.id}/pagos`, { id: idPago, metodo: 'efectivo', monto: 5 });
  expect(rep.statusCode).toBe(200);
  expect(rep.json().repetido).toBe(true);
  const p2 = await post(`/api/cuentas/${c.id}/pagos`, { id: randomUUID(), metodo: 'transferencia', monto: 4.5, referencia: 'TRX-778' });
  expect(p2.statusCode).toBe(201);
  expect(p2.json().cuenta.estado).toBe('cobrada');
  expect(p2.json().pedido.estado).toBe('cobrado');
  expect(p2.json().pedido.cobrado_en).not.toBeNull();
  const mesas = await get('/api/mesas');
  expect(mesas.json().mesas.find((m: any) => m.numero === 1).estado).toBe('libre');
  const mas = await post(`/api/cuentas/${c.id}/pagos`, { id: randomUUID(), metodo: 'efectivo', monto: 1 });
  expect(mas.statusCode).toBe(409);
});

test('descuento, propina y cliente por cuenta', async () => {
  const p = await pedidoConItems(2);
  const c = p.cuentas[0];
  const mal = await patch(`/api/cuentas/${c.id}`, { descuento_tipo: 'monto', descuento_valor: 50 });
  expect(mal.statusCode).toBe(400);
  const ok = await patch(`/api/cuentas/${c.id}`, { descuento_tipo: 'porcentaje', descuento_valor: 10, propina: 1 });
  expect(ok.statusCode).toBe(200);
  const det = (await get(`/api/pedidos/${p.id}`)).json();
  expect(det.cuentas[0].totales).toMatchObject({ subtotal: 9.5, descuento: 0.95, total: 9.55 });
  const cli = await post('/api/clientes', { nombre: 'Ana Ruiz' });
  expect(cli.statusCode).toBe(201);
  const conCliente = await patch(`/api/cuentas/${c.id}`, { cliente_id: cli.json().id });
  expect(conCliente.json().cliente_id).toBe(cli.json().id);
  const inexistente = await patch(`/api/cuentas/${c.id}`, { cliente_id: '00000000-0000-0000-0000-000000000000' });
  expect(inexistente.statusCode).toBe(404);
});

test('dividir en dos cuentas, mover y partir items, cobrar por separado', async () => {
  const p = await pedidoConItems(3);
  const c1 = p.cuentas[0];
  const capuchino = c1.items.find((i: any) => i.producto_id === menu.capuchinoId);
  const sandwich = c1.items.find((i: any) => i.producto_id === menu.sandwichId);
  const c2 = (await post(`/api/pedidos/${p.id}/cuentas`, {})).json();
  expect(c2.numero).toBe(2);
  const mover = await post(`/api/cuentas/${c2.id}/items`, { items: [{ pedido_item_id: capuchino.id, cantidad: 1 }, { pedido_item_id: sandwich.id }] });
  expect(mover.statusCode).toBe(200);
  const det = (await get(`/api/pedidos/${p.id}`)).json();
  const d1 = det.cuentas.find((c: any) => c.numero === 1), d2 = det.cuentas.find((c: any) => c.numero === 2);
  expect(d1.items).toHaveLength(1); expect(d1.items[0].cantidad).toBe(1); expect(d1.totales.total).toBe(2.5);
  expect(d2.items).toHaveLength(2); expect(d2.totales.total).toBe(7);
  expect(det.rondas[0].items).toHaveLength(3);
  expect(det.total_pedido).toBe(9.5);
  const cobro2 = await post(`/api/cuentas/${d2.id}/pagos`, { id: randomUUID(), metodo: 'tarjeta', monto: 7 });
  expect(cobro2.json().cuenta.estado).toBe('cobrada');
  expect(cobro2.json().pedido.estado).toBe('abierto');
  const moverACobrada = await post(`/api/cuentas/${d2.id}/items`, { items: [{ pedido_item_id: d1.items[0].id }] });
  expect(moverACobrada.statusCode).toBe(409);
  const cobro1 = await post(`/api/cuentas/${d1.id}/pagos`, { id: randomUUID(), metodo: 'efectivo', monto: 2.5 });
  expect(cobro1.json().pedido.estado).toBe('cobrado');
});

test('eliminar cuentas vacias respeta las reglas', async () => {
  const p = await pedidoConItems(4);
  const c1 = p.cuentas[0];
  const c2 = (await post(`/api/pedidos/${p.id}/cuentas`, {})).json();
  const conItems = await del(`/api/cuentas/${c1.id}`);
  expect(conItems.statusCode).toBe(409);
  expect(conItems.json().error).toBe('La cuenta tiene ítems');
  const vacia = await del(`/api/cuentas/${c2.id}`);
  expect(vacia.statusCode).toBe(200);
  const det = (await get(`/api/pedidos/${p.id}`)).json();
  expect(det.cuentas).toHaveLength(1);
  const c3 = (await post(`/api/pedidos/${p.id}/cuentas`, {})).json();
  await post(`/api/cuentas/${c3.id}/items`, { items: c1.items.map((i: any) => ({ pedido_item_id: i.id })) });
  const primera = await del(`/api/cuentas/${c1.id}`);
  expect(primera.statusCode).toBe(200);
  const det2 = (await get(`/api/pedidos/${p.id}`)).json();
  expect(det2.cuentas).toHaveLength(1);
  const ultima = await del(`/api/cuentas/${c3.id}`);
  expect(ultima.statusCode).toBe(409);
});

test('cuenta con total 0 se cobra con pago 0', async () => {
  const p = (await post('/api/pedidos', { numero_mesa: 5, mesero_id: meseroId })).json();
  await post(`/api/pedidos/${p.id}/rondas`, { id: randomUUID(), origen: 'caja', items: [{ es_libre: true, nombre: 'Cortesía', precio: 0, cantidad: 1 }] });
  const det = (await get(`/api/pedidos/${p.id}`)).json();
  const r = await post(`/api/cuentas/${det.cuentas[0].id}/pagos`, { id: randomUUID(), metodo: 'efectivo', monto: 0 });
  expect(r.statusCode).toBe(201);
  expect(r.json().pedido.estado).toBe('cobrado');
});
```

- [ ] **Step 2: Ejecutar** → `npm test -- tests/cuentas.test.ts` → FAIL (404 en `/api/clientes` y cuentas).

- [ ] **Step 3: Escribir cuentas.ts**

`src/servidor/modulos/cuentas.ts`:
```ts
import { and, asc, eq, max } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { pedido, cuenta, pedidoItem, pago, cliente } from '../db/schema';
import { ErrorNegocio, ErrorValidacion, NoEncontrado } from '../errores';
import { requerirJornadaAbierta } from './jornada';
import { calcularTotales, redondear, validarDescuento } from './totales';

export type Cuenta = typeof cuenta.$inferSelect;

async function cuentaDe(db: Db, id: string) {
  const [c] = await db.select().from(cuenta).where(eq(cuenta.id, id));
  if (!c) throw new NoEncontrado('La cuenta no existe');
  const [p] = await db.select().from(pedido).where(eq(pedido.id, c.pedido_id));
  if (p.estado !== 'abierto') throw new ErrorNegocio('El pedido ya está cobrado o anulado');
  return { c, p };
}

async function totalesDe(db: Db, c: Cuenta) {
  const items = await db.select().from(pedidoItem).where(eq(pedidoItem.cuenta_id, c.id));
  const pagos = await db.select().from(pago).where(eq(pago.cuenta_id, c.id)).orderBy(asc(pago.creado_en));
  return { items, pagos, totales: calcularTotales(items, c, pagos) };
}

export async function crearCuenta(db: Db, pedidoId: string) {
  await requerirJornadaAbierta(db);
  const [p] = await db.select().from(pedido).where(eq(pedido.id, pedidoId));
  if (!p) throw new NoEncontrado('El pedido no existe');
  if (p.estado !== 'abierto') throw new ErrorNegocio('El pedido ya está cobrado o anulado');
  const [{ ultimo }] = await db.select({ ultimo: max(cuenta.numero) }).from(cuenta).where(eq(cuenta.pedido_id, p.id));
  const [c] = await db.insert(cuenta).values({ pedido_id: p.id, numero: (ultimo ?? 0) + 1 }).returning();
  return c;
}

export async function eliminarCuenta(db: Db, cuentaId: string) {
  await requerirJornadaAbierta(db);
  const { c } = await cuentaDe(db, cuentaId);
  if (c.estado === 'cobrada') throw new ErrorNegocio('La cuenta ya está cobrada');
  const { items } = await totalesDe(db, c);
  if (items.length) throw new ErrorNegocio('La cuenta tiene ítems');
  const todas = await db.select({ id: cuenta.id }).from(cuenta).where(eq(cuenta.pedido_id, c.pedido_id));
  if (todas.length <= 1) throw new ErrorNegocio('El pedido debe conservar al menos una cuenta');
  await db.delete(cuenta).where(eq(cuenta.id, c.id));
  return { eliminada: true, pedido_id: c.pedido_id };
}

export async function moverItems(db: Db, destinoId: string, datos: { items: { pedido_item_id: string; cantidad?: number }[] }) {
  await requerirJornadaAbierta(db);
  const { c: destino } = await cuentaDe(db, destinoId);
  if (destino.estado === 'cobrada') throw new ErrorNegocio('La cuenta destino ya está cobrada');
  const lista = Array.isArray(datos?.items) ? datos.items : [];
  if (!lista.length) throw new ErrorValidacion('No hay ítems para mover');
  await db.transaction(async (tx) => {
    for (const m of lista) {
      const [item] = await tx.select().from(pedidoItem).where(eq(pedidoItem.id, String(m.pedido_item_id))).for('update');
      if (!item) throw new NoEncontrado('El ítem no existe');
      if (item.anulado) throw new ErrorNegocio('No se puede mover un ítem anulado');
      const [origen] = await tx.select().from(cuenta).where(eq(cuenta.id, item.cuenta_id));
      if (origen.pedido_id !== destino.pedido_id) throw new ErrorValidacion('El ítem pertenece a otro pedido');
      if (origen.estado === 'cobrada') throw new ErrorNegocio('La cuenta origen ya está cobrada');
      if (origen.id === destino.id) continue;
      const cantidad = m.cantidad === undefined ? item.cantidad : Number(m.cantidad);
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > item.cantidad) throw new ErrorValidacion('La cantidad a mover no es válida');
      if (cantidad === item.cantidad) {
        await tx.update(pedidoItem).set({ cuenta_id: destino.id, actualizado_en: new Date() }).where(eq(pedidoItem.id, item.id));
      } else {
        await tx.update(pedidoItem).set({ cantidad: item.cantidad - cantidad, actualizado_en: new Date() }).where(eq(pedidoItem.id, item.id));
        await tx.insert(pedidoItem).values({ ronda_id: item.ronda_id, cuenta_id: destino.id, producto_id: item.producto_id, es_libre: item.es_libre, nombre_producto: item.nombre_producto, precio_unitario: item.precio_unitario, cantidad, nota: item.nota, afecta_stock: item.afecta_stock });
      }
    }
  });
  return { movido: true, pedido_id: destino.pedido_id };
}

export async function editarCuenta(db: Db, cuentaId: string, datos: { descuento_tipo?: string; descuento_valor?: number | string; propina?: number | string; cliente_id?: string | null }) {
  await requerirJornadaAbierta(db);
  const { c } = await cuentaDe(db, cuentaId);
  if (c.estado === 'cobrada') throw new ErrorNegocio('La cuenta ya está cobrada');
  const { items } = await totalesDe(db, c);
  const cambios: Partial<typeof cuenta.$inferInsert> = { actualizado_en: new Date() };
  const tipo = (datos.descuento_tipo ?? c.descuento_tipo) as Cuenta['descuento_tipo'];
  if (!['ninguno', 'monto', 'porcentaje'].includes(tipo)) throw new ErrorValidacion('Tipo de descuento inválido');
  const valor = datos.descuento_valor === undefined ? Number(c.descuento_valor) : Number(datos.descuento_valor);
  const subtotal = calcularTotales(items, c, []).subtotal;
  validarDescuento(tipo, valor, subtotal);
  cambios.descuento_tipo = tipo; cambios.descuento_valor = (tipo === 'ninguno' ? 0 : redondear(valor)).toFixed(2);
  if (datos.propina !== undefined) {
    const prop = Number(datos.propina);
    if (Number.isNaN(prop) || prop < 0) throw new ErrorValidacion('La propina no puede ser negativa');
    cambios.propina = redondear(prop).toFixed(2);
  }
  if (datos.cliente_id !== undefined) {
    if (datos.cliente_id === null || datos.cliente_id === '') cambios.cliente_id = null;
    else {
      const [cl] = await db.select({ id: cliente.id }).from(cliente).where(eq(cliente.id, String(datos.cliente_id)));
      if (!cl) throw new NoEncontrado('El cliente no existe');
      cambios.cliente_id = cl.id;
    }
  }
  const [r] = await db.update(cuenta).set(cambios).where(eq(cuenta.id, c.id)).returning();
  return r;
}

export async function registrarPago(db: Db, cuentaId: string, datos: { id: string; metodo: string; monto: number | string; referencia?: string }) {
  await requerirJornadaAbierta(db);
  if (!datos?.id) throw new ErrorValidacion('El pago necesita un id');
  const [existente] = await db.select().from(pago).where(eq(pago.id, datos.id));
  const { c, p } = existente ? { c: (await db.select().from(cuenta).where(eq(cuenta.id, existente.cuenta_id)))[0], p: null as any } : await cuentaDe(db, cuentaId);
  if (existente) {
    const [ped] = await db.select().from(pedido).where(eq(pedido.id, c.pedido_id));
    const t = await totalesDe(db, c);
    return { pago: existente, cuenta: c, pedido: ped, totales: t.totales, repetido: true };
  }
  if (c.estado === 'cobrada') throw new ErrorNegocio('La cuenta ya está cobrada');
  if (!['efectivo', 'tarjeta', 'transferencia'].includes(String(datos.metodo))) throw new ErrorValidacion('Método de pago inválido');
  const monto = redondear(Number(datos.monto));
  if (Number.isNaN(monto) || monto < 0) throw new ErrorValidacion('El monto no es válido');
  const antes = await totalesDe(db, c);
  if (monto === 0 && antes.totales.saldo > 0.005) throw new ErrorValidacion('El monto debe ser mayor a 0');
  if (monto > antes.totales.saldo + 0.005) throw new ErrorNegocio('El pago supera el saldo pendiente');
  return db.transaction(async (tx) => {
    const [nuevo] = await tx.insert(pago).values({ id: datos.id, cuenta_id: c.id, metodo: datos.metodo as any, monto: monto.toFixed(2), referencia: datos.referencia ? String(datos.referencia).trim() || null : null }).returning();
    const pagos = await tx.select().from(pago).where(eq(pago.cuenta_id, c.id));
    const totales = calcularTotales(antes.items, c, pagos);
    let cuentaActual = c;
    if (totales.saldo <= 0.005) {
      [cuentaActual] = await tx.update(cuenta).set({ estado: 'cobrada', cobrada_en: new Date(), actualizado_en: new Date() }).where(eq(cuenta.id, c.id)).returning();
    }
    let pedidoActual = p;
    const abiertas = await tx.select({ id: cuenta.id }).from(cuenta).where(and(eq(cuenta.pedido_id, p.id), eq(cuenta.estado, 'abierta')));
    if (!abiertas.length) {
      [pedidoActual] = await tx.update(pedido).set({ estado: 'cobrado', cobrado_en: new Date(), actualizado_en: new Date() }).where(eq(pedido.id, p.id)).returning();
    }
    return { pago: nuevo, cuenta: cuentaActual, pedido: pedidoActual, totales, repetido: false };
  });
}

export function rutasCuentas(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>('/api/pedidos/:id/cuentas', async (req, reply) => {
    const c = await crearCuenta(app.db, req.params.id); app.bus.emitir('mesa', { pedido_id: c.pedido_id }); return reply.status(201).send(c);
  });
  app.delete<{ Params: { id: string } }>('/api/cuentas/:id', async (req) => {
    const r = await eliminarCuenta(app.db, req.params.id); app.bus.emitir('mesa', { pedido_id: r.pedido_id }); return r;
  });
  app.post<{ Params: { id: string } }>('/api/cuentas/:id/items', async (req) => {
    const r = await moverItems(app.db, req.params.id, req.body as any); app.bus.emitir('mesa', { pedido_id: r.pedido_id }); return r;
  });
  app.patch<{ Params: { id: string } }>('/api/cuentas/:id', async (req) => {
    const c = await editarCuenta(app.db, req.params.id, req.body as any); app.bus.emitir('mesa', { pedido_id: c.pedido_id }); return c;
  });
  app.post<{ Params: { id: string } }>('/api/cuentas/:id/pagos', async (req, reply) => {
    const r = await registrarPago(app.db, req.params.id, req.body as any);
    if (!r.repetido) app.bus.emitir('mesa', { pedido_id: r.pedido.id, numero_mesa: r.pedido.numero_mesa });
    return reply.status(r.repetido ? 200 : 201).send(r);
  });
}
```

- [ ] **Step 4: Registrar en app.ts**: `import { rutasCuentas } from './modulos/cuentas';` y `rutasCuentas(app);` después de `rutasPedidos(app);`. La prueba de cliente pasará al terminar la Task 5; ejecutar ambas tareas y luego las pruebas.

- [ ] **Step 5: Commit parcial** (las pruebas de cuentas que dependen de clientes pasan en Task 5):

```bash
git add -A && git commit -m "Cuentas: división por ítems, descuento, propina y pagos con cobro" && git push origin main
```

---

### Task 5: Clientes
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/modulos/clientes.ts`, `tests/clientes.test.ts`
- Modify: `src/servidor/app.ts`

**Interfaces:**
- Produces: `buscarClientes(db, q: string)` (por nombre o identificación, `ilike`, máx 20, solo activos), `crearCliente(db, datos)`, `editarCliente(db, id, datos)` con `datos = { nombre, tipo_identificacion?, identificacion?, correo?, telefono?, direccion?, activo? }`. Solo `nombre` obligatorio. Si se da `identificacion` sin tipo → 400 `Indica el tipo de identificación`. Duplicado de identificación → 409 `Ya existe un cliente con esa identificación`.
- Rutas: `GET /api/clientes?q=`, `GET /api/clientes/:id`, `POST /api/clientes` (201), `PATCH /api/clientes/:id`.

- [ ] **Step 1: Escribir la prueba**

`tests/clientes.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('crear con solo nombre, buscar, editar, duplicado', async () => {
  const sin = await ctx.app.inject({ method: 'POST', url: '/api/clientes', payload: { nombre: '' } });
  expect(sin.statusCode).toBe(400);
  const a = await ctx.app.inject({ method: 'POST', url: '/api/clientes', payload: { nombre: 'Ana Ruiz' } });
  expect(a.statusCode).toBe(201);
  expect(a.json().identificacion).toBeNull();
  const b = await ctx.app.inject({ method: 'POST', url: '/api/clientes', payload: { nombre: 'Beto', tipo_identificacion: 'cedula', identificacion: '0912345678', correo: 'beto@mail.com' } });
  expect(b.statusCode).toBe(201);
  const dup = await ctx.app.inject({ method: 'POST', url: '/api/clientes', payload: { nombre: 'Otro', tipo_identificacion: 'cedula', identificacion: '0912345678' } });
  expect(dup.statusCode).toBe(409);
  const sinTipo = await ctx.app.inject({ method: 'POST', url: '/api/clientes', payload: { nombre: 'X', identificacion: '123' } });
  expect(sinTipo.statusCode).toBe(400);
  const busca = await ctx.app.inject({ method: 'GET', url: '/api/clientes?q=0912' });
  expect(busca.json()).toHaveLength(1);
  expect(busca.json()[0].nombre).toBe('Beto');
  const porNombre = await ctx.app.inject({ method: 'GET', url: '/api/clientes?q=ana' });
  expect(porNombre.json()[0].nombre).toBe('Ana Ruiz');
  const ed = await ctx.app.inject({ method: 'PATCH', url: `/api/clientes/${a.json().id}`, payload: { telefono: '0999', direccion: 'Calle 1' } });
  expect(ed.json().telefono).toBe('0999');
  const uno = await ctx.app.inject({ method: 'GET', url: `/api/clientes/${a.json().id}` });
  expect(uno.json().direccion).toBe('Calle 1');
});
```

- [ ] **Step 2: Ejecutar** → FAIL (404).

- [ ] **Step 3: Escribir clientes.ts**

`src/servidor/modulos/clientes.ts`:
```ts
import { and, eq, ilike, or, ne, asc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { cliente } from '../db/schema';
import { ErrorNegocio, ErrorValidacion, NoEncontrado } from '../errores';

const TIPOS = ['cedula', 'ruc', 'pasaporte', 'consumidor_final'] as const;
type Datos = { nombre?: string; tipo_identificacion?: string | null; identificacion?: string | null; correo?: string | null; telefono?: string | null; direccion?: string | null; activo?: boolean };

function limpiar(v: unknown): string | null { const t = String(v ?? '').trim(); return t || null; }

async function validar(db: Db, datos: Datos, actual?: typeof cliente.$inferSelect) {
  const cambios: Partial<typeof cliente.$inferInsert> = {};
  if (datos.nombre !== undefined || !actual) {
    const n = limpiar(datos.nombre); if (!n) throw new ErrorValidacion('El nombre del cliente no puede estar vacío'); cambios.nombre = n;
  }
  const tipo = datos.tipo_identificacion !== undefined ? limpiar(datos.tipo_identificacion) : actual?.tipo_identificacion ?? null;
  const ident = datos.identificacion !== undefined ? limpiar(datos.identificacion) : actual?.identificacion ?? null;
  if (tipo && !TIPOS.includes(tipo as any)) throw new ErrorValidacion('Tipo de identificación inválido');
  if (ident && !tipo) throw new ErrorValidacion('Indica el tipo de identificación');
  if (ident && tipo && tipo !== 'consumidor_final') {
    const [dup] = await db.select({ id: cliente.id }).from(cliente).where(and(eq(cliente.tipo_identificacion, tipo as any), eq(cliente.identificacion, ident), actual ? ne(cliente.id, actual.id) : undefined));
    if (dup) throw new ErrorNegocio('Ya existe un cliente con esa identificación');
  }
  cambios.tipo_identificacion = tipo as any; cambios.identificacion = ident;
  for (const k of ['correo', 'telefono', 'direccion'] as const) if (datos[k] !== undefined) cambios[k] = limpiar(datos[k]);
  if (datos.activo !== undefined) cambios.activo = Boolean(datos.activo);
  return cambios;
}

export async function buscarClientes(db: Db, q: string) {
  const t = `%${String(q ?? '').trim()}%`;
  return db.select().from(cliente).where(and(eq(cliente.activo, true), or(ilike(cliente.nombre, t), ilike(cliente.identificacion, t)))).orderBy(asc(cliente.nombre)).limit(20);
}
export async function obtenerCliente(db: Db, id: string) {
  const [c] = await db.select().from(cliente).where(eq(cliente.id, id));
  if (!c) throw new NoEncontrado('El cliente no existe');
  return c;
}
export async function crearCliente(db: Db, datos: Datos) {
  const cambios = await validar(db, datos);
  const [c] = await db.insert(cliente).values(cambios as typeof cliente.$inferInsert).returning();
  return c;
}
export async function editarCliente(db: Db, id: string, datos: Datos) {
  const actual = await obtenerCliente(db, id);
  const cambios = await validar(db, datos, actual);
  const [c] = await db.update(cliente).set({ ...cambios, actualizado_en: new Date() }).where(eq(cliente.id, id)).returning();
  return c;
}

export function rutasClientes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string } }>('/api/clientes', async (req) => buscarClientes(app.db, req.query.q ?? ''));
  app.get<{ Params: { id: string } }>('/api/clientes/:id', async (req) => obtenerCliente(app.db, req.params.id));
  app.post('/api/clientes', async (req, reply) => reply.status(201).send(await crearCliente(app.db, req.body as Datos)));
  app.patch<{ Params: { id: string } }>('/api/clientes/:id', async (req) => editarCliente(app.db, req.params.id, req.body as Datos));
}
```

- [ ] **Step 4: Registrar en app.ts**: `import { rutasClientes } from './modulos/clientes';` y `rutasClientes(app);`.

- [ ] **Step 5: Ejecutar** → `npm run typecheck && npm test` → todas pasan (incluida `cuentas.test.ts`).

- [ ] **Step 6: Commit y push**

```bash
git add -A && git commit -m "Clientes con solo nombre obligatorio y búsqueda" && git push origin main
```

---

### Task 6: Ticket imprimible por cuenta
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/modulos/ticket.ts`, `tests/ticket.test.ts`
- Modify: `src/servidor/app.ts`

**Interfaces:**
- Consumes: `obtenerPedido`, `obtenerConfiguracion`, `obtenerCliente`.
- Produces: `generarTicketHtml(db, cuentaId): Promise<string>` y ruta `GET /api/cuentas/:id/ticket` (`text/html; charset=utf-8`). Sin ninguna leyenda de impuestos. Muestra "Cuenta N de M" solo si el pedido tiene más de una cuenta. Pagos con método y referencia. Cliente con nombre, e identificación solo si existe.

- [ ] **Step 1: Escribir la prueba**

`tests/ticket.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { crearAppDePrueba } from './ayuda/app';
import { abrirCajaDePrueba, crearMenuDePrueba, crearMeseroDePrueba } from './ayuda/datos';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('ticket de una cuenta cobrada', async () => {
  const menu = await crearMenuDePrueba(ctx.app);
  const meseroId = await crearMeseroDePrueba(ctx.app);
  await abrirCajaDePrueba(ctx.app);
  await ctx.app.inject({ method: 'PATCH', url: '/api/admin/configuracion', payload: { nombre_local: 'Delicadas' } });
  const p = (await ctx.app.inject({ method: 'POST', url: '/api/pedidos', payload: { numero_mesa: 2, mesero_id: meseroId } })).json();
  await ctx.app.inject({ method: 'POST', url: `/api/pedidos/${p.id}/rondas`, payload: { id: randomUUID(), origen: 'mesero', items: [{ producto_id: menu.capuchinoId, cantidad: 2, nota: 'sin azúcar' }, { producto_id: menu.sandwichId, cantidad: 1 }] } });
  const det = (await ctx.app.inject({ method: 'GET', url: `/api/pedidos/${p.id}` })).json();
  const c = det.cuentas[0];
  const cli = (await ctx.app.inject({ method: 'POST', url: '/api/clientes', payload: { nombre: 'Ana Ruiz', tipo_identificacion: 'cedula', identificacion: '0912345678' } })).json();
  await ctx.app.inject({ method: 'PATCH', url: `/api/cuentas/${c.id}`, payload: { descuento_tipo: 'porcentaje', descuento_valor: 10, propina: 1, cliente_id: cli.id } });
  await ctx.app.inject({ method: 'POST', url: `/api/cuentas/${c.id}/pagos`, payload: { id: randomUUID(), metodo: 'efectivo', monto: 5 } });
  await ctx.app.inject({ method: 'POST', url: `/api/cuentas/${c.id}/pagos`, payload: { id: randomUUID(), metodo: 'transferencia', monto: 4.55, referencia: 'TRX-1' } });
  const t = await ctx.app.inject({ method: 'GET', url: `/api/cuentas/${c.id}/ticket` });
  expect(t.statusCode).toBe(200);
  expect(t.headers['content-type']).toContain('text/html');
  const h = t.body;
  expect(h).toContain('Delicadas');
  expect(h).toContain('Pedido #1');
  expect(h).toContain('Mesa 2');
  expect(h).toContain('Carlos');
  expect(h).toContain('Capuchino');
  expect(h).toContain('sin azúcar');
  expect(h).toContain('9.50');
  expect(h).toContain('-0.95');
  expect(h).toContain('9.55');
  expect(h).toContain('Efectivo');
  expect(h).toContain('Transferencia TRX-1');
  expect(h).toContain('Ana Ruiz');
  expect(h).toContain('0912345678');
  expect(h).not.toContain('Cuenta 1 de');
  expect(h.toLowerCase()).not.toContain('impuesto');
  expect(h).toContain('window.print()');
});
```

- [ ] **Step 2: Ejecutar** → FAIL (404).

- [ ] **Step 3: Escribir ticket.ts**

`src/servidor/modulos/ticket.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/conexion';
import { cuenta, cliente } from '../db/schema';
import { NoEncontrado } from '../errores';
import { obtenerPedido } from './pedidos';
import { obtenerConfiguracion } from './configuracion';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const METODOS: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
const fmt = (n: number | string) => Number(n).toFixed(2);

export async function generarTicketHtml(db: Db, cuentaId: string): Promise<string> {
  const [c] = await db.select().from(cuenta).where(eq(cuenta.id, cuentaId));
  if (!c) throw new NoEncontrado('La cuenta no existe');
  const cfg = await obtenerConfiguracion(db);
  const p = await obtenerPedido(db, c.pedido_id);
  const cu = p.cuentas.find((x) => x.id === c.id)!;
  const cli = c.cliente_id ? (await db.select().from(cliente).where(eq(cliente.id, c.cliente_id)))[0] : null;
  const fecha = new Date(cu.cobrada_en ?? p.creado_en).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' });
  const lugar = p.origen === 'encargo' ? `Encargo` : p.numero_mesa > 0 ? `Mesa ${p.numero_mesa}` : 'Para llevar';
  const subtitulo = p.cuentas.length > 1 ? ` · Cuenta ${cu.numero} de ${p.cuentas.length}` : '';
  const filas = cu.items.filter((i) => !i.anulado).map((i) => `
    <tr><td>${i.cantidad}</td><td>${esc(i.nombre_producto)}${i.nota ? `<br><small>${esc(i.nota)}</small>` : ''}</td><td class="n">${fmt(i.precio_unitario)}</td><td class="n">${fmt(Number(i.precio_unitario) * i.cantidad)}</td></tr>`).join('');
  const pagos = cu.pagos.map((pg) => `<tr><td colspan="3">${METODOS[pg.metodo]}${pg.referencia ? ' ' + esc(pg.referencia) : ''}</td><td class="n">${fmt(pg.monto)}</td></tr>`).join('');
  const t = cu.totales;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket ${p.numero}</title>
<style>
body{font-family:"Courier New",monospace;font-size:12px;margin:0;padding:8px;color:#000;background:#fff}
.t{width:100%;max-width:72mm;margin:0 auto}
h1{font-size:14px;text-align:center;margin:0 0 4px}
.c{text-align:center;margin:0 0 6px}
table{width:100%;border-collapse:collapse}
td{padding:2px 0;vertical-align:top}
.n{text-align:right;white-space:nowrap}
hr{border:0;border-top:1px dashed #000;margin:6px 0}
.tot td{font-weight:bold}
@media print{@page{size:80mm auto;margin:4mm} body{padding:0}}
@media screen and (min-width:600px){body{padding:24px}}
</style></head><body><div class="t">
<h1>${esc(cfg.nombre_local)}</h1>
<p class="c">Pedido #${p.numero}${subtitulo}<br>${lugar}${p.mesero_nombre ? ' · ' + esc(p.mesero_nombre) : ''}<br>${fecha}</p>
<hr><table>${filas}</table><hr>
<table>
<tr><td colspan="3">Subtotal</td><td class="n">${fmt(t.subtotal)}</td></tr>
${t.descuento > 0 ? `<tr><td colspan="3">Descuento${cu.descuento_tipo === 'porcentaje' ? ' ' + Number(cu.descuento_valor) + '%' : ''}</td><td class="n">-${fmt(t.descuento)}</td></tr>` : ''}
${Number(cu.propina) > 0 ? `<tr><td colspan="3">Propina</td><td class="n">${fmt(cu.propina)}</td></tr>` : ''}
<tr class="tot"><td colspan="3">TOTAL ${esc(cfg.simbolo_moneda)}</td><td class="n">${fmt(t.total)}</td></tr>
</table><hr><table>${pagos}</table>
${cli ? `<hr><p>Cliente: ${esc(cli.nombre)}${cli.identificacion ? `<br>${esc(cli.tipo_identificacion === 'ruc' ? 'RUC' : cli.tipo_identificacion === 'pasaporte' ? 'Pasaporte' : 'CI')} ${esc(cli.identificacion)}` : ''}</p>` : ''}
<p class="c">¡Gracias por su visita!</p>
</div><script>if(location.search.includes('imprimir'))window.print()</script></body></html>`;
}

export function rutaTicket(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/cuentas/:id/ticket', async (req, reply) => {
    reply.type('text/html; charset=utf-8');
    return generarTicketHtml(app.db, req.params.id);
  });
}
```

- [ ] **Step 4: Registrar en app.ts**: `import { rutaTicket } from './modulos/ticket';` y `rutaTicket(app);`.

- [ ] **Step 5: Ejecutar** → `npm run typecheck && npm test` → todo pasa.

- [ ] **Step 6: Commit y push**

```bash
git add -A && git commit -m "Ticket imprimible por cuenta sin leyenda de impuestos" && git push origin main
```

---

### Task 7: Pantalla del mesero
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/web/comun/dinero.ts`, `src/web/comun/Catalogo.tsx`, `src/web/mesero/Mesas.tsx`, `src/web/mesero/PedidoMesero.tsx`
- Modify: `src/web/mesero/AppMesero.tsx`

**Interfaces:**
- Consumes: `api`, `useEstado`, `useEventos`, `GET /api/mesas`, `GET /api/catalogo`, `GET /api/pedidos/:id`, `POST /api/pedidos`, `POST /api/pedidos/:id/rondas`, `POST /api/rondas/:id/aviso-visto`.
- Produces:
  - `dinero(n, simbolo = '$')` → `"$ 4.50"`.
  - `type ItemBorrador = { clave: string; producto_id: string | null; es_libre: boolean; nombre: string; precio: number; cantidad: number; nota: string; controla_stock: boolean }`
  - `Catalogo({ borrador, onCambiar, permitirLibres, umbral })`: cuadrícula por categorías con "Quedan N" (amarillo si ≤ umbral, gris y deshabilitado si 0), botón "Ítem libre". Compartido con caja en Task 8.
  - `AppMesero`: elección de mesero (localStorage `mesero_id`), `Mesas`, `PedidoMesero`.
- Borrador de ronda guardado en `localStorage` con clave `borrador_<pedido_id>`; id de ronda generado con `crypto.randomUUID()` al momento de enviar y guardado junto al borrador para reintentar sin duplicar.

- [ ] **Step 1: Escribir dinero.ts y Catalogo.tsx**

`src/web/comun/dinero.ts`:
```ts
export const dinero = (n: number | string, simbolo = '$') => `${simbolo} ${Number(n).toFixed(2)}`;
```

`src/web/comun/Catalogo.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { dinero } from './dinero';

export type ItemBorrador = { clave: string; producto_id: string | null; es_libre: boolean; nombre: string; precio: number; cantidad: number; nota: string; controla_stock: boolean };

export function Catalogo({ borrador, onCambiar, permitirLibres, umbral, simbolo }: { borrador: ItemBorrador[]; onCambiar: (b: ItemBorrador[]) => void; permitirLibres: boolean; umbral: number; simbolo: string }) {
  const [cats, setCats] = useState<any[]>([]);
  const [catActiva, setCatActiva] = useState<string | null>(null);
  const cargar = () => api.get('/api/catalogo').then((r) => { setCats(r.categorias); setCatActiva((a) => a ?? r.categorias[0]?.id ?? null); });
  useEffect(() => { cargar(); }, []);
  useEventos(['catalogo', 'stock'], () => cargar());

  const enBorrador = (productoId: string) => borrador.filter((b) => b.producto_id === productoId).reduce((s, b) => s + b.cantidad, 0);
  const agregar = (p: any) => {
    const ya = borrador.find((b) => b.producto_id === p.id && !b.nota);
    if (ya) onCambiar(borrador.map((b) => (b === ya ? { ...b, cantidad: b.cantidad + 1 } : b)));
    else onCambiar([...borrador, { clave: crypto.randomUUID(), producto_id: p.id, es_libre: false, nombre: p.nombre, precio: Number(p.precio), cantidad: 1, nota: '', controla_stock: p.controla_stock }]);
  };
  const agregarLibre = () => {
    const nombre = prompt('Nombre del ítem'); if (!nombre?.trim()) return;
    const precio = Number(prompt('Precio')); if (Number.isNaN(precio) || precio < 0) { alert('Precio inválido'); return; }
    onCambiar([...borrador, { clave: crypto.randomUUID(), producto_id: null, es_libre: true, nombre: nombre.trim(), precio, cantidad: 1, nota: '', controla_stock: false }]);
  };
  const cat = cats.find((c) => c.id === catActiva);
  return (
    <div>
      <div class="pestanas" style="overflow-x:auto">
        {cats.map((c) => <button key={c.id} class={c.id === catActiva ? 'activa' : ''} onClick={() => setCatActiva(c.id)}>{c.nombre}</button>)}
        {permitirLibres && <button onClick={agregarLibre} style="margin-left:auto">+ Ítem libre</button>}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">
        {(cat?.productos ?? []).map((p: any) => {
          const disponible = p.controla_stock ? (p.stock_actual ?? 0) - enBorrador(p.id) : Infinity;
          const agotado = p.controla_stock && disponible <= 0;
          const bajo = p.controla_stock && !agotado && disponible <= umbral;
          return (
            <button key={p.id} disabled={agotado} onClick={() => agregar(p)} class="tarjeta" style={`text-align:left;display:grid;gap:4px;min-height:72px;${agotado ? 'opacity:.5' : ''}`}>
              <b>{p.nombre}</b>
              <span style="font-size:13px">{dinero(p.precio, simbolo)}</span>
              {p.controla_stock && <span class={`pill ${agotado ? 'error' : bajo ? 'alerta' : 'ok'}`}>{agotado ? 'Agotado' : `Quedan ${disponible}`}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ListaBorrador({ borrador, onCambiar, simbolo }: { borrador: ItemBorrador[]; onCambiar: (b: ItemBorrador[]) => void; simbolo: string }) {
  const cambiar = (clave: string, cambios: Partial<ItemBorrador>) => onCambiar(borrador.map((b) => (b.clave === clave ? { ...b, ...cambios } : b)).filter((b) => b.cantidad > 0));
  if (!borrador.length) return <p style="color:var(--gris)">Toca productos para agregarlos.</p>;
  return (
    <table><tbody>{borrador.map((b) => (
      <tr key={b.clave}>
        <td><b>{b.nombre}</b>{b.es_libre && <span class="pill" style="margin-left:6px">libre</span>}<br />
          <input placeholder="Nota (ej. sin azúcar)" value={b.nota} onInput={(e) => cambiar(b.clave, { nota: (e.target as HTMLInputElement).value })} style="min-height:36px;font-size:13px" /></td>
        <td style="white-space:nowrap"><button onClick={() => cambiar(b.clave, { cantidad: b.cantidad - 1 })}>−</button> {b.cantidad} <button onClick={() => cambiar(b.clave, { cantidad: b.cantidad + 1 })}>+</button></td>
        <td class="n" style="text-align:right">{dinero(b.precio * b.cantidad, simbolo)}</td>
      </tr>))}</tbody></table>
  );
}

export function borradorAItems(borrador: ItemBorrador[]) {
  return borrador.map((b) => b.es_libre
    ? { es_libre: true, nombre: b.nombre, precio: b.precio, cantidad: b.cantidad, nota: b.nota || undefined }
    : { producto_id: b.producto_id, cantidad: b.cantidad, nota: b.nota || undefined });
}
```

- [ ] **Step 2: Escribir Mesas.tsx**

`src/web/mesero/Mesas.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { dinero } from '../comun/dinero';

export function Mesas({ meseroId, simbolo, cocinaActiva, onAbrir, setError }: { meseroId: string; simbolo: string; cocinaActiva: boolean; onAbrir: (pedidoId: string) => void; setError: (m: string | null) => void }) {
  const [datos, setDatos] = useState<{ mesas: any[]; para_llevar: any[] } | null>(null);
  const cargar = () => api.get('/api/mesas').then(setDatos).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);
  useEventos(['mesa', 'jornada', 'config'], () => cargar());
  const tocar = async (m: any) => {
    setError(null);
    if (m.pedido_id) return onAbrir(m.pedido_id);
    try { const p = await api.post('/api/pedidos', { numero_mesa: m.numero, mesero_id: meseroId }); onAbrir(p.id); }
    catch (e: any) { setError(e.message); cargar(); }
  };
  const llevar = async () => {
    try { const p = await api.post('/api/pedidos', { numero_mesa: 0, mesero_id: meseroId }); onAbrir(p.id); } catch (e: any) { setError(e.message); }
  };
  if (!datos) return <p>Cargando…</p>;
  return (
    <div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px">
        {datos.mesas.map((m) => {
          const lista = cocinaActiva && m.ronda_lista;
          const fondo = lista ? 'border:3px solid var(--acento);color:var(--acento)' : m.estado === 'ocupada' ? 'background:var(--acento);color:#fff;border-color:var(--acento)' : '';
          return (
            <button key={m.numero} onClick={() => tocar(m)} style={`min-height:96px;display:grid;align-content:space-between;text-align:left;${fondo}`}>
              <span style="font-size:24px;font-weight:700">{m.numero}</span>
              <small>{lista ? 'Listo para servir' : m.estado === 'ocupada' ? `${dinero(m.total, simbolo)} · ${m.mesero ?? ''}` : 'libre'}</small>
            </button>);
        })}
        <button onClick={llevar} style="min-height:96px;display:grid;align-content:space-between;text-align:left;border-style:dashed"><span style="font-size:24px">↗</span><small>Para llevar</small></button>
      </div>
      {datos.para_llevar.length > 0 && (
        <div style="margin-top:16px"><h3>Para llevar abiertos</h3>
          {datos.para_llevar.map((p) => <button key={p.pedido_id} onClick={() => onAbrir(p.pedido_id)} style="margin:0 8px 8px 0">#{p.numero} · {dinero(p.total, simbolo)} · {p.mesero}{cocinaActiva && p.ronda_lista ? ' · Listo' : ''}</button>)}
        </div>)}
    </div>
  );
}
```

- [ ] **Step 3: Escribir PedidoMesero.tsx**

`src/web/mesero/PedidoMesero.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { dinero } from '../comun/dinero';
import { Catalogo, ListaBorrador, borradorAItems, type ItemBorrador } from '../comun/Catalogo';

type Borrador = { rondaId: string; items: ItemBorrador[] };
const leer = (pedidoId: string): Borrador => { try { const t = localStorage.getItem(`borrador_${pedidoId}`); if (t) return JSON.parse(t); } catch {} return { rondaId: crypto.randomUUID(), items: [] }; };
const guardar = (pedidoId: string, b: Borrador) => { try { localStorage.setItem(`borrador_${pedidoId}`, JSON.stringify(b)); } catch {} };
const borrar = (pedidoId: string) => { try { localStorage.removeItem(`borrador_${pedidoId}`); } catch {} };

export function PedidoMesero({ pedidoId, config, conectado, onVolver, setError }: { pedidoId: string; config: any; conectado: boolean; onVolver: () => void; setError: (m: string | null) => void }) {
  const [pedido, setPedido] = useState<any>(null);
  const [borrador, setBorrador] = useState<Borrador>(() => leer(pedidoId));
  const [enviando, setEnviando] = useState(false);
  const cargar = () => api.get(`/api/pedidos/${pedidoId}`).then(setPedido).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [pedidoId]);
  useEventos(['mesa'], (_n, d) => { if (!d?.pedido_id || d.pedido_id === pedidoId) cargar(); });
  useEffect(() => { guardar(pedidoId, borrador); }, [borrador]);

  const cambiarItems = (items: ItemBorrador[]) => setBorrador({ ...borrador, items });
  const enviar = async () => {
    if (!borrador.items.length) return;
    setEnviando(true); setError(null);
    try {
      await api.post(`/api/pedidos/${pedidoId}/rondas`, { id: borrador.rondaId, origen: 'mesero', enviada_a_cocina: true, items: borradorAItems(borrador.items) });
      borrar(pedidoId); setBorrador({ rondaId: crypto.randomUUID(), items: [] }); await cargar();
    } catch (e: any) {
      setError(e.message);
      if (e.message.startsWith('Se acaba de agotar')) setBorrador({ ...borrador, rondaId: crypto.randomUUID() });
    } finally { setEnviando(false); }
  };
  const descartarAviso = async (rondaId: string) => { try { await api.post(`/api/rondas/${rondaId}/aviso-visto`, { pantalla: 'mesero' }); } catch {} };
  if (!pedido) return <p>Cargando…</p>;
  const simbolo = config.simbolo_moneda;
  const totalBorrador = borrador.items.reduce((s, b) => s + b.precio * b.cantidad, 0);
  return (
    <div style="display:grid;gap:16px">
      <div class="fila" style="align-items:center">
        <button onClick={onVolver} style="flex:0 0 auto">← Mesas</button>
        <h2 style="margin:0">{pedido.numero_mesa > 0 ? `Mesa ${pedido.numero_mesa}` : 'Para llevar'} · Pedido #{pedido.numero}</h2>
        <span style="margin-left:auto">{dinero(pedido.total_pedido, simbolo)}</span>
      </div>
      {pedido.estado !== 'abierto' && <div class="aviso ok">Este pedido ya fue {pedido.estado}.</div>}
      {pedido.rondas.map((r: any) => (
        <div key={r.id} class="tarjeta" style="font-size:14px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <b>Ronda {r.numero} · {new Date(r.creado_en).toLocaleTimeString('es-EC', { timeStyle: 'short' })} · {r.origen === 'caja' ? 'agregado en caja' : 'mesero'}</b>
            {config.cocina_activa && r.estado === 'lista' && !r.aviso_visto_mesero && <button class="primario" onClick={() => descartarAviso(r.id)}>Listo para servir ✓</button>}
          </div>
          <ul style="margin:6px 0 0">{r.items.map((i: any) => <li key={i.id} style={i.anulado ? 'text-decoration:line-through;color:var(--gris)' : ''}>{i.cantidad} × {i.nombre_producto}{i.nota ? ` (${i.nota})` : ''}</li>)}</ul>
        </div>))}
      {pedido.estado === 'abierto' && (
        <div class="tarjeta" style="display:grid;gap:12px">
          <h3 style="margin:0">Nueva ronda</h3>
          <Catalogo borrador={borrador.items} onCambiar={cambiarItems} permitirLibres={config.permitir_items_libres} umbral={config.umbral_stock_bajo} simbolo={simbolo} />
          <ListaBorrador borrador={borrador.items} onCambiar={cambiarItems} simbolo={simbolo} />
          <button class="primario" disabled={!conectado || enviando || !borrador.items.length} onClick={enviar} style="min-height:56px;font-size:18px">
            {config.cocina_activa ? 'Enviar a cocina' : 'Enviar'} · {dinero(totalBorrador, simbolo)}
          </button>
        </div>)}
    </div>
  );
}
```

- [ ] **Step 4: Escribir AppMesero.tsx**

`src/web/mesero/AppMesero.tsx`:
```tsx
import { useState } from 'preact/hooks';
import { useEstado } from '../eventos';
import { Aviso } from '../componentes/Aviso';
import { Mesas } from './Mesas';
import { PedidoMesero } from './PedidoMesero';

const leerMesero = () => { try { return localStorage.getItem('mesero_id'); } catch { return null; } };

export function AppMesero() {
  const { estado, conectado } = useEstado();
  const [meseroId, setMeseroId] = useState<string | null>(leerMesero());
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!estado) return <div class="contenido">Cargando…</div>;
  const mesero = estado.meseros.find((m) => m.id === meseroId);
  const elegir = (id: string) => { try { localStorage.setItem('mesero_id', id); } catch {} setMeseroId(id); };
  return (
    <div>
      {!conectado && <div class="sin-conexion">Sin conexión. Reintentando…</div>}
      <div class="barra"><h1>Mesero</h1>
        {mesero && <span>{mesero.nombre} <button onClick={() => setMeseroId(null)} style="min-height:32px;padding:2px 8px">Cambiar</button></span>}
        <span class="pill" style="margin-left:auto">{estado.jornada ? 'Caja abierta' : 'Caja cerrada'}</span></div>
      <div class="contenido">
        <Aviso tipo="error" texto={error} />
        {!mesero ? (
          <div><h2>¿Quién eres?</h2>
            {estado.meseros.length === 0 && <p>No hay meseros definidos. Pide a admin que los cree.</p>}
            <div style="display:grid;gap:8px;max-width:360px">{estado.meseros.map((m) => <button key={m.id} class="primario" onClick={() => elegir(m.id)} style="min-height:56px">{m.nombre}</button>)}</div>
          </div>
        ) : !estado.jornada ? (
          <div><h2>Caja cerrada</h2><p>No se pueden tomar pedidos hasta que caja abra la jornada.</p></div>
        ) : pedidoId ? (
          <PedidoMesero pedidoId={pedidoId} config={estado.configuracion} conectado={conectado} onVolver={() => setPedidoId(null)} setError={setError} />
        ) : (
          <Mesas meseroId={mesero.id} simbolo={estado.configuracion.simbolo_moneda} cocinaActiva={estado.configuracion.cocina_activa} onAbrir={setPedidoId} setError={setError} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verificar** → `npm run typecheck && npm run build && npm test` sin errores.

- [ ] **Step 6: Verificación manual**

1. `npm run dev`. En admin (`/admin`) crear mesero "Carlos", categorías y productos (uno con stock 2).
2. En caja todavía no hay pantalla: abrir jornada por API: `curl -s -X POST http://127.0.0.1:3000/api/jornadas/abrir -H 'Content-Type: application/json' -d '{"fondo_inicial":20}'`.
3. Abrir `/mesero` en el navegador y en el celular (misma WiFi, IP de la Mac). Elegir "Carlos". Tocar mesa 2, agregar 2 del producto con stock 2: el botón muestra "Quedan 0" y se deshabilita. Enviar. En la otra pantalla el stock del producto pasa a "Agotado" sin recargar.
4. Volver a mesas: la mesa 2 está en verde con total. Tocar de nuevo abre el mismo pedido con la ronda 1 en solo lectura.
5. Cerrar la jornada por API: `curl -s -X POST .../api/jornadas/cerrar -d '{"efectivo_contado":20}'` → responde 409 "Hay mesas ocupadas…" (correcto). Dejar la mesa abierta para la Task 8.

- [ ] **Step 7: Commit y push**

```bash
git add -A && git commit -m "Pantalla del mesero: mesas, pedido, nueva ronda con stock y borrador local" && git push origin main
```

---

### Task 8: Pantalla de caja
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/web/caja/AbrirCaja.tsx`, `src/web/caja/CerrarCaja.tsx`, `src/web/caja/PedidoCaja.tsx`, `src/web/caja/CuentaCaja.tsx`, `src/web/caja/Dividir.tsx`, `src/web/caja/ClienteSelector.tsx`
- Modify: `src/web/caja/AppCaja.tsx`

**Interfaces:**
- Consumes: todo lo del servidor de este plan y `Catalogo`, `ListaBorrador`, `borradorAItems`, `dinero`.
- Produces: `AppCaja` con: barra de jornada (Abrir caja / Cerrar caja / resumen en vivo), lista de mesas ocupadas y para llevar, `PedidoCaja` (rondas, agregar ítems con "Enviar a cocina" o "Ya servido", anular ítem, anular pedido, dividir cuenta, una `CuentaCaja` por cuenta con cliente, descuento, propina, pagos y ticket).

- [ ] **Step 1: Escribir AbrirCaja.tsx y CerrarCaja.tsx**

`src/web/caja/AbrirCaja.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { Aviso } from '../componentes/Aviso';

export function AbrirCaja({ onListo }: { onListo: () => void }) {
  const [fondo, setFondo] = useState('0');
  const [productos, setProductos] = useState<any[]>([]);
  const [stocks, setStocks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.get('/api/admin/productos').then((ps) => { const con = ps.filter((p: any) => p.activo && p.controla_stock); setProductos(con); setStocks(Object.fromEntries(con.map((p: any) => [p.id, String(p.stock_actual)]))); }); }, []);
  const abrir = async (e: Event) => {
    e.preventDefault(); setError(null);
    const ajustes = productos.filter((p) => Number(stocks[p.id]) !== p.stock_actual).map((p) => ({ producto_id: p.id, stock: Number(stocks[p.id]) }));
    try { await api.post('/api/jornadas/abrir', { fondo_inicial: Number(fondo), ajustes_stock: ajustes }); onListo(); } catch (err: any) { setError(err.message); }
  };
  return (
    <form onSubmit={abrir} class="tarjeta" style="display:grid;gap:12px;max-width:560px">
      <h2 style="margin:0">Abrir caja</h2>
      <label>Fondo inicial en efectivo<input type="number" step="0.01" min="0" value={fondo} onInput={(e) => setFondo((e.target as HTMLInputElement).value)} /></label>
      {productos.length > 0 && <div><b>Stock de hoy</b> <small>(ajusta si empiezas con cantidades distintas)</small>
        <table><tbody>{productos.map((p) => <tr key={p.id}><td>{p.nombre}</td><td style="width:120px"><input type="number" min="0" step="1" value={stocks[p.id]} onInput={(e) => setStocks({ ...stocks, [p.id]: (e.target as HTMLInputElement).value })} /></td></tr>)}</tbody></table></div>}
      <Aviso tipo="error" texto={error} />
      <button class="primario" type="submit" style="min-height:56px;font-size:18px">Abrir caja</button>
    </form>
  );
}
```

`src/web/caja/CerrarCaja.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { Aviso } from '../componentes/Aviso';
import { dinero } from '../comun/dinero';

export function CerrarCaja({ simbolo, onCerrada, onCancelar }: { simbolo: string; onCerrada: () => void; onCancelar: () => void }) {
  const [r, setR] = useState<any>(null);
  const [contado, setContado] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.get('/api/jornadas/actual/resumen').then(setR).catch((e) => setError(e.message)); }, []);
  if (!r) return <p>Cargando…</p>;
  const filas: [string, number][] = [['Ventas', r.total_ventas], ['Descuentos', r.total_descuentos], ['Propinas', r.total_propinas], ['Cobrado en efectivo', r.total_efectivo], ['Cobrado con tarjeta', r.total_tarjeta], ['Cobrado por transferencia', r.total_transferencia], ['Egresos', r.total_egresos], ['Abonos de encargos recibidos hoy (caja aparte)', r.total_abonos_recibidos], ['Abonos devueltos hoy', r.total_abonos_devueltos], ['Saldo en caja de encargos', r.saldo_caja_encargos]];
  const diferencia = contado === '' ? null : Number(contado) - r.efectivo_esperado;
  const cerrar = async (e: Event) => {
    e.preventDefault(); setError(null);
    if (!confirm('¿Cerrar la caja? No se podrá operar hasta abrir una nueva.')) return;
    try { await api.post('/api/jornadas/cerrar', { efectivo_contado: Number(contado) }); onCerrada(); } catch (err: any) { setError(err.message); }
  };
  return (
    <form onSubmit={cerrar} class="tarjeta" style="display:grid;gap:12px;max-width:560px">
      <h2 style="margin:0">Cerrar caja</h2>
      <table><tbody>
        <tr><td>Fondo inicial</td><td style="text-align:right">{dinero(r.jornada.fondo_inicial, simbolo)}</td></tr>
        {filas.map(([k, v]) => <tr key={k}><td>{k}</td><td style="text-align:right">{dinero(v, simbolo)}</td></tr>)}
        <tr><td><b>Efectivo esperado en caja</b></td><td style="text-align:right"><b>{dinero(r.efectivo_esperado, simbolo)}</b></td></tr>
      </tbody></table>
      <label>Efectivo contado<input type="number" step="0.01" min="0" value={contado} onInput={(e) => setContado((e.target as HTMLInputElement).value)} required /></label>
      {diferencia !== null && <div class={`aviso ${Math.abs(diferencia) < 0.005 ? 'ok' : 'error'}`}>Diferencia: {dinero(diferencia, simbolo)}</div>}
      <Aviso tipo="error" texto={error} />
      <div class="fila"><button class="primario" type="submit" style="flex:0 0 auto">Cerrar caja</button><button type="button" onClick={onCancelar} style="flex:0 0 auto">Cancelar</button></div>
    </form>
  );
}
```

- [ ] **Step 2: Escribir ClienteSelector.tsx y Dividir.tsx**

`src/web/caja/ClienteSelector.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';

export function ClienteSelector({ clienteId, onElegir, setError }: { clienteId: string | null; onElegir: (id: string | null) => void; setError: (m: string | null) => void }) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<any[]>([]);
  const [actual, setActual] = useState<any>(null);
  useEffect(() => { if (clienteId) api.get(`/api/clientes/${clienteId}`).then(setActual).catch(() => setActual(null)); else setActual(null); }, [clienteId]);
  useEffect(() => { if (q.trim().length >= 2) api.get(`/api/clientes?q=${encodeURIComponent(q)}`).then(setLista); else setLista([]); }, [q]);
  const crear = async () => {
    const nombre = prompt('Nombre del cliente', q); if (!nombre?.trim()) return;
    const identificacion = prompt('Cédula o RUC (opcional)') ?? '';
    try {
      const c = await api.post('/api/clientes', identificacion.trim() ? { nombre, tipo_identificacion: identificacion.trim().length === 13 ? 'ruc' : 'cedula', identificacion: identificacion.trim() } : { nombre });
      onElegir(c.id); setQ('');
    } catch (e: any) { setError(e.message); }
  };
  if (actual) return <div class="fila" style="align-items:center"><span>Cliente: <b>{actual.nombre}</b>{actual.identificacion ? ` · ${actual.identificacion}` : ''}</span><button onClick={() => onElegir(null)} style="flex:0 0 auto">Quitar</button></div>;
  return (
    <div style="display:grid;gap:6px">
      <div class="fila"><input placeholder="Buscar cliente por nombre o cédula" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} /><button onClick={crear} type="button" style="flex:0 0 auto">+ Nuevo</button></div>
      {lista.length > 0 && <div style="display:flex;gap:6px;flex-wrap:wrap">{lista.map((c) => <button key={c.id} onClick={() => { onElegir(c.id); setQ(''); }}>{c.nombre}{c.identificacion ? ` · ${c.identificacion}` : ''}</button>)}</div>}
    </div>
  );
}
```

`src/web/caja/Dividir.tsx`:
```tsx
import { useState } from 'preact/hooks';
import { api } from '../api';
import { dinero } from '../comun/dinero';

export function Dividir({ pedido, simbolo, setError, onCerrar }: { pedido: any; simbolo: string; setError: (m: string | null) => void; onCerrar: () => void }) {
  const [seleccion, setSeleccion] = useState<{ itemId: string; cantidad: number } | null>(null);
  const abiertas = pedido.cuentas.filter((c: any) => c.estado === 'abierta');
  const elegirItem = (i: any) => {
    if (i.anulado) return;
    let cantidad = i.cantidad;
    if (i.cantidad > 1) { const v = Number(prompt(`¿Cuántas unidades de "${i.nombre_producto}" mover? (1 a ${i.cantidad})`, String(i.cantidad))); if (!Number.isInteger(v) || v < 1 || v > i.cantidad) return; cantidad = v; }
    setSeleccion({ itemId: i.id, cantidad });
  };
  const moverA = async (cuentaId: string) => {
    if (!seleccion) return; setError(null);
    try { await api.post(`/api/cuentas/${cuentaId}/items`, { items: [{ pedido_item_id: seleccion.itemId, cantidad: seleccion.cantidad }] }); setSeleccion(null); } catch (e: any) { setError(e.message); }
  };
  const nuevaCuenta = async () => { try { await api.post(`/api/pedidos/${pedido.id}/cuentas`, {}); } catch (e: any) { setError(e.message); } };
  const eliminar = async (c: any) => { try { await api.del(`/api/cuentas/${c.id}`); } catch (e: any) { setError(e.message); } };
  return (
    <div class="tarjeta" style="display:grid;gap:12px;border-color:var(--acento)">
      <div class="fila" style="align-items:center"><h3 style="margin:0">Dividir cuenta</h3><small>Toca un ítem y luego la cuenta a la que va.</small><button onClick={onCerrar} style="flex:0 0 auto;margin-left:auto">Listo</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
        {pedido.cuentas.map((c: any) => (
          <div key={c.id} class="tarjeta" style={c.estado === 'cobrada' ? 'opacity:.6' : ''}>
            <div class="fila" style="align-items:center"><b>Cuenta {c.numero}</b><span class={`pill ${c.estado === 'cobrada' ? 'ok' : ''}`}>{c.estado}</span>
              {c.estado === 'abierta' && seleccion && <button class="primario" onClick={() => moverA(c.id)} style="flex:0 0 auto;margin-left:auto">Mover aquí</button>}
              {c.estado === 'abierta' && c.items.length === 0 && pedido.cuentas.length > 1 && <button onClick={() => eliminar(c)} style="flex:0 0 auto">Eliminar</button>}</div>
            <ul style="padding-left:18px;margin:8px 0">{c.items.map((i: any) => (
              <li key={i.id} onClick={() => c.estado === 'abierta' && elegirItem(i)} style={`cursor:pointer;padding:4px 0;${seleccion?.itemId === i.id ? 'color:var(--acento);font-weight:600' : ''}${i.anulado ? 'text-decoration:line-through;color:var(--gris)' : ''}`}>
                {i.cantidad} × {i.nombre_producto} · {dinero(Number(i.precio_unitario) * i.cantidad, simbolo)}</li>))}</ul>
            <div style="text-align:right"><b>{dinero(c.totales.total, simbolo)}</b></div>
          </div>))}
        {abiertas.length > 0 && <button onClick={nuevaCuenta} style="min-height:80px;border-style:dashed">+ Cuenta</button>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Escribir CuentaCaja.tsx**

`src/web/caja/CuentaCaja.tsx`:
```tsx
import { useState } from 'preact/hooks';
import { api } from '../api';
import { dinero } from '../comun/dinero';
import { ClienteSelector } from './ClienteSelector';

const METODOS = [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['transferencia', 'Transferencia']] as const;

export function CuentaCaja({ cuenta, totalCuentas, config, setError }: { cuenta: any; totalCuentas: number; config: any; setError: (m: string | null) => void }) {
  const simbolo = config.simbolo_moneda;
  const [descTipo, setDescTipo] = useState(cuenta.descuento_tipo);
  const [descValor, setDescValor] = useState(String(cuenta.descuento_valor));
  const [propina, setPropina] = useState(String(cuenta.propina));
  const [metodo, setMetodo] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo');
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [pagoId, setPagoId] = useState(() => crypto.randomUUID());
  const t = cuenta.totales;
  const cobrada = cuenta.estado === 'cobrada';
  const guardarAjustes = async () => {
    setError(null);
    try { await api.patch(`/api/cuentas/${cuenta.id}`, { descuento_tipo: descTipo, descuento_valor: Number(descValor) || 0, propina: Number(propina) || 0 }); } catch (e: any) { setError(e.message); }
  };
  const propinaSugerida = () => { const v = (t.subtotal - t.descuento) * Number(config.propina_sugerida_pct) / 100; setPropina(v.toFixed(2)); };
  const pagar = async (e: Event) => {
    e.preventDefault(); setError(null);
    try {
      const r = await api.post(`/api/cuentas/${cuenta.id}/pagos`, { id: pagoId, metodo, monto: Number(monto), referencia: referencia || undefined });
      setPagoId(crypto.randomUUID()); setMonto(''); setReferencia('');
      if (r.cuenta.estado === 'cobrada') window.open(`/api/cuentas/${cuenta.id}/ticket?imprimir=1`, '_blank');
    } catch (err: any) { setError(err.message); if (!err.message.includes('supera')) setPagoId(crypto.randomUUID()); }
  };
  return (
    <div class="tarjeta" style={`display:grid;gap:10px;${cobrada ? 'background:var(--acento-suave)' : ''}`}>
      <div class="fila" style="align-items:center">
        <h3 style="margin:0">{totalCuentas > 1 ? `Cuenta ${cuenta.numero} de ${totalCuentas}` : 'Cuenta'}</h3>
        <span class={`pill ${cobrada ? 'ok' : ''}`}>{cobrada ? 'Cobrada' : `Saldo ${dinero(t.saldo, simbolo)}`}</span>
        {cobrada && <a href={`/api/cuentas/${cuenta.id}/ticket?imprimir=1`} target="_blank" style="margin-left:auto">Ver ticket</a>}
      </div>
      <table style="font-size:14px"><tbody>
        {cuenta.items.map((i: any) => <tr key={i.id} style={i.anulado ? 'text-decoration:line-through;color:var(--gris)' : ''}><td>{i.cantidad} × {i.nombre_producto}{i.nota ? ` (${i.nota})` : ''}</td><td style="text-align:right">{dinero(Number(i.precio_unitario) * i.cantidad, simbolo)}</td></tr>)}
        <tr><td>Subtotal</td><td style="text-align:right">{dinero(t.subtotal, simbolo)}</td></tr>
        {t.descuento > 0 && <tr><td>Descuento</td><td style="text-align:right">-{dinero(t.descuento, simbolo)}</td></tr>}
        {Number(cuenta.propina) > 0 && <tr><td>Propina</td><td style="text-align:right">{dinero(cuenta.propina, simbolo)}</td></tr>}
        <tr><td><b>Total</b></td><td style="text-align:right"><b>{dinero(t.total, simbolo)}</b></td></tr>
        {cuenta.pagos.map((p: any) => <tr key={p.id} style="color:var(--acento)"><td>Pagado · {METODOS.find(([k]) => k === p.metodo)?.[1]}{p.referencia ? ` ${p.referencia}` : ''}</td><td style="text-align:right">{dinero(p.monto, simbolo)}</td></tr>)}
      </tbody></table>
      {!cobrada && (<>
        <ClienteSelector clienteId={cuenta.cliente_id} onElegir={async (id) => { try { await api.patch(`/api/cuentas/${cuenta.id}`, { cliente_id: id }); } catch (e: any) { setError(e.message); } }} setError={setError} />
        <div class="fila">
          <label>Descuento<select value={descTipo} onChange={(e) => setDescTipo((e.target as HTMLSelectElement).value)}><option value="ninguno">Sin descuento</option><option value="monto">Monto</option><option value="porcentaje">Porcentaje</option></select></label>
          {descTipo !== 'ninguno' && <label>{descTipo === 'monto' ? 'Monto' : '%'}<input type="number" step="0.01" min="0" value={descValor} onInput={(e) => setDescValor((e.target as HTMLInputElement).value)} /></label>}
          <label>Propina<input type="number" step="0.01" min="0" value={propina} onInput={(e) => setPropina((e.target as HTMLInputElement).value)} /></label>
          {Number(config.propina_sugerida_pct) > 0 && <button type="button" onClick={propinaSugerida} style="flex:0 0 auto">Sugerida {config.propina_sugerida_pct}%</button>}
          <button type="button" onClick={guardarAjustes} style="flex:0 0 auto">Aplicar</button>
        </div>
        <form onSubmit={pagar} class="fila">
          <label>Método<select value={metodo} onChange={(e) => setMetodo((e.target as HTMLSelectElement).value as any)}>{METODOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Monto<input type="number" step="0.01" min="0" value={monto} onInput={(e) => setMonto((e.target as HTMLInputElement).value)} required /></label>
          <label>Referencia<input value={referencia} onInput={(e) => setReferencia((e.target as HTMLInputElement).value)} placeholder="opcional" /></label>
          <button type="button" onClick={() => setMonto(t.saldo.toFixed(2))} style="flex:0 0 auto">Cobrar exacto</button>
          <button class="primario" type="submit" style="flex:0 0 auto">Registrar pago</button>
        </form>
      </>)}
    </div>
  );
}
```

- [ ] **Step 4: Escribir PedidoCaja.tsx**

`src/web/caja/PedidoCaja.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { dinero } from '../comun/dinero';
import { Catalogo, ListaBorrador, borradorAItems, type ItemBorrador } from '../comun/Catalogo';
import { CuentaCaja } from './CuentaCaja';
import { Dividir } from './Dividir';

export function PedidoCaja({ pedidoId, config, onVolver, setError }: { pedidoId: string; config: any; onVolver: () => void; setError: (m: string | null) => void }) {
  const [pedido, setPedido] = useState<any>(null);
  const [agregando, setAgregando] = useState(false);
  const [borrador, setBorrador] = useState<ItemBorrador[]>([]);
  const [rondaId, setRondaId] = useState(() => crypto.randomUUID());
  const [dividiendo, setDividiendo] = useState(false);
  const simbolo = config.simbolo_moneda;
  const cargar = () => api.get(`/api/pedidos/${pedidoId}`).then(setPedido).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [pedidoId]);
  useEventos(['mesa'], (_n, d) => { if (!d?.pedido_id || d.pedido_id === pedidoId) cargar(); });

  const enviar = async (aCocina: boolean) => {
    setError(null);
    try {
      await api.post(`/api/pedidos/${pedidoId}/rondas`, { id: rondaId, origen: 'caja', enviada_a_cocina: aCocina, items: borradorAItems(borrador) });
      setBorrador([]); setRondaId(crypto.randomUUID()); setAgregando(false);
    } catch (e: any) { setError(e.message); setRondaId(crypto.randomUUID()); }
  };
  const anularItem = async (i: any) => {
    const motivo = prompt(`Motivo para anular "${i.nombre_producto}"`); if (!motivo?.trim()) return;
    try { await api.post(`/api/pedidos/${pedidoId}/items/${i.id}/anular`, { motivo }); } catch (e: any) { setError(e.message); }
  };
  const anularPedido = async () => {
    const motivo = prompt('Motivo para anular todo el pedido'); if (!motivo?.trim()) return;
    try { await api.post(`/api/pedidos/${pedidoId}/anular`, { motivo }); onVolver(); } catch (e: any) { setError(e.message); }
  };
  const descartarAviso = async (r: any) => { try { await api.post(`/api/rondas/${r.id}/aviso-visto`, { pantalla: 'caja' }); } catch {} };
  if (!pedido) return <p>Cargando…</p>;
  const abierto = pedido.estado === 'abierto';
  return (
    <div style="display:grid;gap:16px">
      <div class="fila" style="align-items:center">
        <button onClick={onVolver} style="flex:0 0 auto">← Mesas</button>
        <h2 style="margin:0">{pedido.numero_mesa > 0 ? `Mesa ${pedido.numero_mesa}` : pedido.origen === 'encargo' ? 'Encargo' : 'Para llevar'} · Pedido #{pedido.numero}{pedido.mesero_nombre ? ` · ${pedido.mesero_nombre}` : ''}</h2>
        <b style="margin-left:auto">{dinero(pedido.total_pedido, simbolo)}</b>
      </div>
      {!abierto && <div class="aviso ok">Pedido {pedido.estado}.</div>}
      <div class="tarjeta" style="font-size:14px">
        <b>Rondas</b>
        {pedido.rondas.map((r: any) => (
          <div key={r.id} style="margin-top:6px">
            <span style="color:var(--gris)">Ronda {r.numero} · {new Date(r.creado_en).toLocaleTimeString('es-EC', { timeStyle: 'short' })} · {r.origen}{r.enviada_a_cocina ? '' : ' · ya servido'}</span>
            {config.cocina_activa && r.estado === 'lista' && !r.aviso_visto_caja && <button onClick={() => descartarAviso(r)} style="margin-left:8px;min-height:28px;padding:0 8px">Listo ✓</button>}
            <ul style="margin:4px 0">{r.items.map((i: any) => <li key={i.id} style={i.anulado ? 'text-decoration:line-through;color:var(--gris)' : ''}>{i.cantidad} × {i.nombre_producto}{i.nota ? ` (${i.nota})` : ''}
              {abierto && !i.anulado && <button onClick={() => anularItem(i)} style="margin-left:8px;min-height:28px;padding:0 8px">Anular</button>}</li>)}</ul>
          </div>))}
      </div>
      {abierto && (
        <div class="fila">
          <button onClick={() => setAgregando(!agregando)} style="flex:0 0 auto">{agregando ? 'Cancelar' : '+ Agregar ítems'}</button>
          <button onClick={() => setDividiendo(!dividiendo)} style="flex:0 0 auto">{dividiendo ? 'Cerrar división' : 'Dividir cuenta'}</button>
          <button class="peligro" onClick={anularPedido} style="flex:0 0 auto;margin-left:auto">Anular pedido</button>
        </div>)}
      {abierto && agregando && (
        <div class="tarjeta" style="display:grid;gap:12px">
          <Catalogo borrador={borrador} onCambiar={setBorrador} permitirLibres={config.permitir_items_libres} umbral={config.umbral_stock_bajo} simbolo={simbolo} />
          <ListaBorrador borrador={borrador} onCambiar={setBorrador} simbolo={simbolo} />
          <div class="fila">
            {config.cocina_activa && <button class="primario" disabled={!borrador.length} onClick={() => enviar(true)}>Enviar a cocina</button>}
            <button class={config.cocina_activa ? '' : 'primario'} disabled={!borrador.length} onClick={() => enviar(false)}>{config.cocina_activa ? 'Ya servido' : 'Agregar'}</button>
          </div>
        </div>)}
      {abierto && dividiendo && <Dividir pedido={pedido} simbolo={simbolo} setError={setError} onCerrar={() => setDividiendo(false)} />}
      {pedido.cuentas.map((c: any) => <CuentaCaja key={c.id + c.estado + c.pagos.length + c.items.length} cuenta={c} totalCuentas={pedido.cuentas.length} config={config} setError={setError} />)}
    </div>
  );
}
```

- [ ] **Step 5: Escribir AppCaja.tsx**

`src/web/caja/AppCaja.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEstado, useEventos } from '../eventos';
import { Aviso } from '../componentes/Aviso';
import { dinero } from '../comun/dinero';
import { AbrirCaja } from './AbrirCaja';
import { CerrarCaja } from './CerrarCaja';
import { PedidoCaja } from './PedidoCaja';

export function AppCaja() {
  const { estado, conectado, recargar } = useEstado();
  const [vista, setVista] = useState<'mesas' | 'cerrar'>('mesas');
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [mesas, setMesas] = useState<{ mesas: any[]; para_llevar: any[] } | null>(null);
  const [resumen, setResumen] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const cargarMesas = () => api.get('/api/mesas').then(setMesas).catch(() => {});
  const cargarResumen = () => api.get('/api/jornadas/actual/resumen').then(setResumen).catch(() => setResumen(null));
  useEffect(() => { cargarMesas(); cargarResumen(); }, [estado?.jornada?.id]);
  useEventos(['mesa', 'jornada', 'config'], () => { cargarMesas(); cargarResumen(); });
  if (!estado) return <div class="contenido">Cargando…</div>;
  const cfg = estado.configuracion; const simbolo = cfg.simbolo_moneda;
  const ocupadas = mesas?.mesas.filter((m) => m.estado === 'ocupada') ?? [];
  return (
    <div>
      {!conectado && <div class="sin-conexion">Sin conexión. Reintentando…</div>}
      <div class="barra"><h1>Caja · {cfg.nombre_local}</h1>
        {estado.jornada ? <>
          <span class="pill ok">Caja abierta {new Date(estado.jornada.abierta_en).toLocaleTimeString('es-EC', { timeStyle: 'short' })}</span>
          {resumen && <span>Ventas {dinero(resumen.total_ventas, simbolo)} · Efectivo esperado {dinero(resumen.efectivo_esperado, simbolo)}</span>}
          <button onClick={() => { setPedidoId(null); setVista('cerrar'); }} style="margin-left:auto">Cerrar caja</button>
        </> : <span class="pill" style="margin-left:auto">Caja cerrada</span>}
      </div>
      <div class="contenido">
        <Aviso tipo="error" texto={error} />
        {!estado.jornada ? <AbrirCaja onListo={() => { setVista('mesas'); recargar(); }} />
          : vista === 'cerrar' ? <CerrarCaja simbolo={simbolo} onCerrada={() => { setVista('mesas'); recargar(); }} onCancelar={() => setVista('mesas')} />
          : pedidoId ? <PedidoCaja pedidoId={pedidoId} config={cfg} onVolver={() => { setPedidoId(null); cargarMesas(); }} setError={setError} />
          : (
            <div style="display:grid;gap:16px">
              <h2 style="margin:0">Mesas ocupadas</h2>
              {ocupadas.length === 0 && mesas?.para_llevar.length === 0 && <p style="color:var(--gris)">No hay pedidos abiertos.</p>}
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
                {ocupadas.map((m) => <button key={m.numero} onClick={() => setPedidoId(m.pedido_id)} style={`min-height:96px;display:grid;align-content:space-between;text-align:left;${cfg.cocina_activa && m.ronda_lista ? 'border:3px solid var(--acento)' : ''}`}>
                  <span style="font-size:22px;font-weight:700">Mesa {m.numero}</span><small>{dinero(m.total, simbolo)} · {m.mesero ?? ''}</small></button>)}
                {mesas?.para_llevar.map((p) => <button key={p.pedido_id} onClick={() => setPedidoId(p.pedido_id)} style="min-height:96px;display:grid;align-content:space-between;text-align:left;border-style:dashed">
                  <span style="font-size:22px;font-weight:700">Llevar #{p.numero}</span><small>{dinero(p.total, simbolo)} · {p.mesero ?? ''}</small></button>)}
              </div>
            </div>)}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verificar** → `npm run typecheck && npm run build && npm test` sin errores.

- [ ] **Step 7: Verificación manual del día completo**

1. `npm run dev`. Abrir `/caja`. Si hay jornada abierta de la Task 7, saltar al paso 3.
2. "Abrir caja" con fondo 20 y stock del día. La barra muestra "Caja abierta".
3. En `/mesero` (celular), tomar pedido en mesa 2 con 2 capuchinos y 1 sándwich. En `/caja` la mesa 2 aparece sin recargar.
4. Entrar a la mesa 2. "+ Agregar ítems": agregar 1 bolón y "Ya servido" (o "Enviar a cocina" si cocina activa). Anular el bolón con motivo: el stock vuelve, visible en mesero.
5. "Dividir cuenta": "+ Cuenta", tocar un capuchino, elegir 1 unidad, "Mover aquí" en cuenta 2. Cuenta 1 queda con 1 capuchino + sándwich, cuenta 2 con 1 capuchino.
6. En cuenta 2: cliente "+ Nuevo" con solo nombre "Ana". Pago efectivo "Cobrar exacto". Se abre el ticket con "Cuenta 2 de 2" y sin palabra "impuesto".
7. En cuenta 1: descuento 10%, propina sugerida, pago 3 en efectivo y el resto por transferencia con referencia. La mesa desaparece de ocupadas y en mesero pasa a libre.
8. "Cerrar caja": el resumen muestra ventas, efectivo y transferencia correctos; escribir el efectivo contado; diferencia 0 si coincide. Confirmar. Mesero muestra "Caja cerrada".

- [ ] **Step 8: Commit y push**

```bash
git add -A && git commit -m "Pantalla de caja: jornada, pedidos, división de cuentas, pagos y ticket" && git push origin main
```

---

## Cierre del plan 2

**Modelo:** `claude-sonnet-5`. **Motivo:** son comandos y actualizaciones de documentos ya definidos. **Skill:** `superpowers:verification-before-completion`. **Revisor:** `claude-fable-5-1` confirma que ESTADO.md y BITACORA.md reflejan la salida real.


- [ ] `npm run typecheck && npm run build && npm test` una última vez; pegar la salida resumida en `docs/BITACORA.md`.
- [ ] Reflejar en la spec (sección 4.2 cuenta) el ajuste: "se puede eliminar cualquier cuenta vacía siempre que quede al menos una". Reflejar el mismo texto en `docs/propuesta-nucleo-pos.html` (fila de la tabla `cuenta`).
- [ ] Actualizar `docs/ESTADO.md`: "Plan 2 terminado"; siguiente paso: ejecutar plan 3 (modelo `claude-fable-5-1`, skill `superpowers:subagent-driven-development`).
- [ ] `git add -A && git commit -m "Cierre del plan 2: operación completa" && git push origin main`.

## Self-review (hecho al escribir el plan)

- **Cobertura de spec:** reglas 1 a 15 → Tasks 2 a 5; 4.2 y 4.3 → Tasks 3, 4, 5; 4.5 → Task 1; 6 (rutas de pedidos, cuentas, clientes, ticket, jornadas) → Tasks 2 a 6; 7.1 mesero → Task 7; 7.3 caja salvo egresos y encargos → Task 8; 7.5 ticket → Task 6. Quedan para plan 3: cocina y `POST /rondas/:id/lista`, egresos, encargos y abonos, reportes, datos de ejemplo, exportar CSV, historial de jornadas en admin. Plan 4: respaldos, logs, lanzador, empaquetado, E2E.
- **Consistencia de nombres:** `requerirJornadaAbierta`, `calcularTotales`, `validarDescuento`, `redondear`, `enviarRonda` devuelve `{ ronda, repetida, stockCambiado }`, `registrarPago` devuelve `{ pago, cuenta, pedido, totales, repetido }`, `Catalogo`/`ListaBorrador`/`borradorAItems`/`ItemBorrador`, `dinero`, `api.del` (definido en plan 1 Task 6) usados con la misma firma en servidor y web.
- **Sin placeholders.**
