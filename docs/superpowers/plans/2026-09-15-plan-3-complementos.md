# Plan 3 de 4 — Complementos del Núcleo POS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar lo que la operación diaria necesita además de vender: pantalla de cocina opcional, egresos, encargos con abonos y caja de encargos, reportes por jornada con exportación CSV, clientes en admin y menú de ejemplo.

**Architecture:** Mismos patrones de los planes 1 y 2: un módulo por dominio en `src/servidor/modulos/` con sus rutas, pruebas de integración con `app.inject()`, y componentes Preact por pantalla. Los encargos reutilizan `enviarRonda` y `registrarPago` al entregar, de modo que el cobro, la división y el ticket funcionan sin código nuevo.

**Tech Stack:** el de los planes 1 y 2. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-12-nucleo-pos-design.md` secciones 4.4 (encargos), 5 reglas 6, 12, 13, 15 a 19, 6 (rutas de cocina, egresos, encargos, reportes, datos de ejemplo), 7.2, 7.3 (egresos y encargos), 7.4 (clientes, reportes, datos de ejemplo), 7.5 (constancia). **Requiere planes 1 y 2 terminados.**

**Modelos y skills:** no hay modelo por defecto. Cada tarea indica abajo su modelo ejecutor, su skill, su revisor y su motivo. Resumen de este plan:

| Tarea | Modelo ejecutor | Skill principal | Revisor |
|---|---|---|---|
| Task 1 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 2 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 3 | `claude-fable-5-1` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 4 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 5 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |
| Task 6 | `claude-sonnet-5` | `superpowers:test-driven-development` | `claude-fable-5-1` |

**Revisión de cada tarea:** el revisor usa `superpowers:requesting-code-review` con modelo `claude-fable-5-1`: primero revisa contra la spec (¿hace lo que el plan pide, ni más ni menos?), luego calidad del código. Si hay observaciones, el ejecutor las atiende con `superpowers:receiving-code-review` y se vuelve a revisar. La tarea solo se marca terminada cuando el revisor aprueba y `superpowers:verification-before-completion` confirma la salida del comando de verificación.

## Global Constraints

- Las de los planes 1 y 2.
- Encargos: solo con jornada abierta para crear, abonar, entregar y cancelar. Nunca tocan stock. Los abonos nunca cuentan como venta el día que se reciben.
- Todo texto visible en español. Cada tarea termina con `npm run typecheck && npm test`, commit y `git push origin main`.

## File Structure

```
src/servidor/modulos/cocina.ts        listarRondasCocina, marcarRondaLista, rutasCocina
src/servidor/modulos/egresos.ts       listarEgresos, crearEgreso, rutasEgresos
src/servidor/modulos/encargos.ts      crear, editar, abonar, entregar, cancelar, comprobante, rutasEncargos
src/servidor/modulos/reportes.ts      reporteJornada, aCsv, rutasReportes
src/servidor/modulos/ejemplo.ts       cargarDatosEjemplo, borrarDatosEjemplo, rutasEjemplo
src/web/cocina/AppCocina.tsx          rondas pendientes, botón Listo, barra de stock, sonido
src/web/caja/Egresos.tsx              lista y formulario
src/web/caja/Encargos.tsx             lista, nuevo, detalle con abonar/entregar/cancelar
src/web/caja/AppCaja.tsx              botones Egresos y Encargos
src/web/admin/Clientes.tsx            listado, búsqueda, edición
src/web/admin/Reportes.tsx            jornada actual e historial, exportar CSV
src/web/admin/AppAdmin.tsx            pestañas Clientes, Reportes, Datos de ejemplo
tests/cocina.test.ts, egresos.test.ts, encargos.test.ts, reportes.test.ts, ejemplo.test.ts
```

---

### Task 1: Cocina
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/modulos/cocina.ts`, `tests/cocina.test.ts`
- Modify: `src/servidor/app.ts`, `src/web/cocina/AppCocina.tsx`

**Interfaces:**
- Produces:
  - `listarRondasCocina(db)`: rondas `pendiente` con `enviada_a_cocina = true` de pedidos `abierto`, ordenadas por `creado_en`, cada una con `{ id, numero, creado_en, pedido: { id, numero, numero_mesa, origen }, mesero, items: [{ cantidad, nombre_producto, nota, anulado }] }` (ítems anulados excluidos).
  - `marcarRondaLista(db, rondaId)` → 409 `La ronda ya está lista`; fija `estado = lista`, `lista_en`.
  - Rutas: `GET /api/cocina/rondas`, `POST /api/rondas/:id/lista` (emite `mesa` con `{ pedido_id }`).
  - Pantalla `/cocina`: si `cocina_activa` es falso muestra aviso; si no, tarjetas con minutos de espera, botón "Listo", barra lateral con productos que controlan stock (resalta bajo y agotado), sonido corto al entrar una ronda nueva si `sonido_cocina`, botón "Silenciar".

- [ ] **Step 1: Escribir la prueba**

`tests/cocina.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { crearAppDePrueba } from './ayuda/app';
import { abrirCajaDePrueba, crearMenuDePrueba, crearMeseroDePrueba } from './ayuda/datos';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('cocina ve solo rondas pendientes enviadas a cocina y puede marcarlas listas', async () => {
  const menu = await crearMenuDePrueba(ctx.app);
  const meseroId = await crearMeseroDePrueba(ctx.app);
  await abrirCajaDePrueba(ctx.app);
  const p = (await ctx.app.inject({ method: 'POST', url: '/api/pedidos', payload: { numero_mesa: 3, mesero_id: meseroId } })).json();
  const r1 = randomUUID(), r2 = randomUUID();
  await ctx.app.inject({ method: 'POST', url: `/api/pedidos/${p.id}/rondas`, payload: { id: r1, origen: 'mesero', items: [{ producto_id: menu.capuchinoId, cantidad: 1, nota: 'caliente' }] } });
  await ctx.app.inject({ method: 'POST', url: `/api/pedidos/${p.id}/rondas`, payload: { id: r2, origen: 'caja', enviada_a_cocina: false, items: [{ producto_id: menu.capuchinoId, cantidad: 1 }] } });
  const lista = await ctx.app.inject({ method: 'GET', url: '/api/cocina/rondas' });
  expect(lista.statusCode).toBe(200);
  expect(lista.json()).toHaveLength(1);
  expect(lista.json()[0]).toMatchObject({ id: r1, numero: 1, mesero: 'Carlos', pedido: { numero_mesa: 3 } });
  expect(lista.json()[0].items[0]).toMatchObject({ cantidad: 1, nombre_producto: 'Capuchino', nota: 'caliente' });
  const eventos: any[] = [];
  ctx.app.bus.suscribir((e) => eventos.push(e));
  const ok = await ctx.app.inject({ method: 'POST', url: `/api/rondas/${r1}/lista` });
  expect(ok.statusCode).toBe(200);
  expect(ok.json().estado).toBe('lista');
  expect(eventos.some((e) => e.nombre === 'mesa' && e.datos.pedido_id === p.id)).toBe(true);
  const otra = await ctx.app.inject({ method: 'POST', url: `/api/rondas/${r1}/lista` });
  expect(otra.statusCode).toBe(409);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/cocina/rondas' })).json()).toHaveLength(0);
  const mesas = (await ctx.app.inject({ method: 'GET', url: '/api/mesas' })).json();
  expect(mesas.mesas.find((m: any) => m.numero === 3).ronda_lista).toBe(true);
  await ctx.app.inject({ method: 'POST', url: `/api/rondas/${r1}/aviso-visto`, payload: { pantalla: 'mesero' } });
  const mesas2 = (await ctx.app.inject({ method: 'GET', url: '/api/mesas' })).json();
  expect(mesas2.mesas.find((m: any) => m.numero === 3).ronda_lista).toBe(false);
});
```

- [ ] **Step 2: Ejecutar** → FAIL (404).

- [ ] **Step 3: Escribir cocina.ts**

`src/servidor/modulos/cocina.ts`:
```ts
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { ronda, pedido, pedidoItem, mesero } from '../db/schema';
import { ErrorNegocio, NoEncontrado } from '../errores';

export async function listarRondasCocina(db: Db) {
  const filas = await db.select({ r: ronda, p: pedido, mesero_nombre: mesero.nombre }).from(ronda)
    .innerJoin(pedido, eq(pedido.id, ronda.pedido_id)).leftJoin(mesero, eq(mesero.id, pedido.mesero_id))
    .where(and(eq(ronda.estado, 'pendiente'), eq(ronda.enviada_a_cocina, true), eq(pedido.estado, 'abierto'))).orderBy(asc(ronda.creado_en));
  const ids = filas.map((f) => f.r.id);
  const items = ids.length ? await db.select().from(pedidoItem).where(and(inArray(pedidoItem.ronda_id, ids), eq(pedidoItem.anulado, false))).orderBy(asc(pedidoItem.creado_en)) : [];
  return filas.map((f) => ({
    id: f.r.id, numero: f.r.numero, creado_en: f.r.creado_en,
    pedido: { id: f.p.id, numero: f.p.numero, numero_mesa: f.p.numero_mesa, origen: f.p.origen },
    mesero: f.mesero_nombre ?? null,
    items: items.filter((i) => i.ronda_id === f.r.id).map((i) => ({ id: i.id, cantidad: i.cantidad, nombre_producto: i.nombre_producto, nota: i.nota, anulado: i.anulado })),
  }));
}

export async function marcarRondaLista(db: Db, rondaId: string) {
  const [r] = await db.select().from(ronda).where(eq(ronda.id, rondaId));
  if (!r) throw new NoEncontrado('La ronda no existe');
  if (r.estado === 'lista') throw new ErrorNegocio('La ronda ya está lista');
  const [actualizada] = await db.update(ronda).set({ estado: 'lista', lista_en: new Date(), actualizado_en: new Date() }).where(eq(ronda.id, rondaId)).returning();
  return actualizada;
}

export function rutasCocina(app: FastifyInstance) {
  app.get('/api/cocina/rondas', async () => listarRondasCocina(app.db));
  app.post<{ Params: { id: string } }>('/api/rondas/:id/lista', async (req) => {
    const r = await marcarRondaLista(app.db, req.params.id);
    app.bus.emitir('mesa', { pedido_id: r.pedido_id });
    return r;
  });
}
```

Registrar en `app.ts`: `import { rutasCocina } from './modulos/cocina';` y `rutasCocina(app);`.

- [ ] **Step 4: Ejecutar** → `npm test` → todo pasa.

- [ ] **Step 5: Escribir AppCocina.tsx**

`src/web/cocina/AppCocina.tsx`:
```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api';
import { useEstado, useEventos } from '../eventos';

function pitido() {
  try { const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.2; o.start(); o.stop(ctx.currentTime + 0.25); } catch {}
}

export function AppCocina() {
  const { estado, conectado } = useEstado();
  const [rondas, setRondas] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [silencio, setSilencio] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  const conocidas = useRef<Set<string>>(new Set());
  const cargar = async () => {
    const r = await api.get('/api/cocina/rondas');
    const nuevas = r.filter((x: any) => !conocidas.current.has(x.id));
    if (nuevas.length && conocidas.current.size && !silencio && estado?.configuracion?.sonido_cocina) pitido();
    conocidas.current = new Set(r.map((x: any) => x.id));
    setRondas(r);
    const cat = await api.get('/api/catalogo');
    setProductos(cat.categorias.flatMap((c: any) => c.productos).filter((p: any) => p.controla_stock));
  };
  useEffect(() => { if (estado) cargar(); }, [estado?.jornada?.id, estado?.configuracion?.cocina_activa]);
  useEventos(['mesa', 'stock', 'catalogo', 'jornada'], () => { if (estado) cargar(); });
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(t); }, []);
  if (!estado) return <div class="contenido">Cargando…</div>;
  const cfg = estado.configuracion;
  if (!cfg.cocina_activa) return <div class="contenido"><h1>Pantalla de cocina desactivada</h1><p>Actívala en Admin, Configuración, "Usar pantalla de cocina".</p></div>;
  if (!estado.jornada) return <div class="contenido"><h1>Caja cerrada</h1><p>No hay pedidos hasta que caja abra la jornada.</p></div>;
  const marcar = async (r: any) => { try { await api.post(`/api/rondas/${r.id}/lista`); } catch (e: any) { alert(e.message); } };
  return (
    <div>
      {!conectado && <div class="sin-conexion">Sin conexión. Reintentando…</div>}
      <div class="barra"><h1>Cocina</h1><span class="pill">{rondas.length} pendientes</span>
        <button onClick={() => setSilencio(!silencio)} style="margin-left:auto">{silencio ? 'Activar sonido' : 'Silenciar'}</button></div>
      <div class="contenido" style="display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:16px">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;align-content:start">
          {rondas.length === 0 && <p style="color:var(--gris)">Sin rondas pendientes.</p>}
          {rondas.map((r) => {
            const min = Math.floor((ahora - new Date(r.creado_en).getTime()) / 60000);
            return (
              <div key={r.id} class="tarjeta" style={`display:grid;gap:8px;${min >= 15 ? 'border-color:var(--error)' : ''}`}>
                <div style="display:flex;justify-content:space-between"><b style="font-size:20px">{r.pedido.numero_mesa > 0 ? `Mesa ${r.pedido.numero_mesa}` : r.pedido.origen === 'encargo' ? 'Encargo' : 'Llevar'} · #{r.pedido.numero}</b><span class={`pill ${min >= 15 ? 'error' : min >= 8 ? 'alerta' : ''}`}>{min} min</span></div>
                <small style="color:var(--gris)">Ronda {r.numero} · {r.mesero ?? 'caja'}</small>
                <ul style="margin:0;padding-left:18px;font-size:18px">{r.items.map((i: any) => <li key={i.id}><b>{i.cantidad} ×</b> {i.nombre_producto}{i.nota ? <small style="display:block;color:var(--alerta)">{i.nota}</small> : null}</li>)}</ul>
                <button class="primario" onClick={() => marcar(r)} style="min-height:52px;font-size:18px">Listo</button>
              </div>);
          })}
        </div>
        <aside class="tarjeta" style="align-self:start"><b>Stock</b>
          <table style="font-size:14px"><tbody>{productos.map((p) => {
            const agotado = (p.stock_actual ?? 0) <= 0, bajo = !agotado && p.stock_actual <= cfg.umbral_stock_bajo;
            return <tr key={p.id}><td>{p.nombre}</td><td style="text-align:right"><span class={`pill ${agotado ? 'error' : bajo ? 'alerta' : 'ok'}`}>{agotado ? 'Agotado' : bajo ? `Se agota: ${p.stock_actual}` : p.stock_actual}</span></td></tr>;
          })}</tbody></table>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verificar** → `npm run typecheck && npm run build && npm test`. Manual: admin activa cocina; mesero envía ronda; `/cocina` la muestra al instante y suena; "Listo" hace que la mesa parpadee en mesero y caja.

- [ ] **Step 7: Commit y push**

```bash
git add -A && git commit -m "Cocina: rondas pendientes, marcar lista y pantalla con stock y sonido" && git push origin main
```

---

### Task 2: Egresos
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/modulos/egresos.ts`, `tests/egresos.test.ts`, `src/web/caja/Egresos.tsx`
- Modify: `src/servidor/app.ts`, `src/web/caja/AppCaja.tsx`

**Interfaces:**
- Produces: `listarEgresos(db, jornadaId)`, `crearEgreso(db, { tipo, monto, motivo, pedido_id? })` → exige jornada abierta, `tipo` en `compra_ingredientes | devolucion_cliente | otro`, monto > 0, motivo no vacío, `pedido_id` debe existir si se envía. Rutas: `GET /api/egresos` (de la jornada abierta), `POST /api/egresos` (201, emite `jornada` para refrescar el resumen de caja).
- UI: botón "Egresos" en la barra de caja; vista con formulario (tipo, monto, motivo, pedido opcional elegido de los pedidos de la jornada) y tabla del día con total.

- [ ] **Step 1: Escribir la prueba**

`tests/egresos.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';
import { abrirCajaDePrueba } from './ayuda/datos';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('egresos exigen caja abierta, validan y afectan el efectivo esperado', async () => {
  const sin = await ctx.app.inject({ method: 'POST', url: '/api/egresos', payload: { tipo: 'otro', monto: 5, motivo: 'x' } });
  expect(sin.statusCode).toBe(409);
  await abrirCajaDePrueba(ctx.app, 50);
  const mal = await ctx.app.inject({ method: 'POST', url: '/api/egresos', payload: { tipo: 'raro', monto: 5, motivo: 'x' } });
  expect(mal.statusCode).toBe(400);
  const cero = await ctx.app.inject({ method: 'POST', url: '/api/egresos', payload: { tipo: 'otro', monto: 0, motivo: 'x' } });
  expect(cero.statusCode).toBe(400);
  const ok = await ctx.app.inject({ method: 'POST', url: '/api/egresos', payload: { tipo: 'compra_ingredientes', monto: 12.5, motivo: 'Faltó queso' } });
  expect(ok.statusCode).toBe(201);
  expect(ok.json().monto).toBe('12.50');
  const lista = await ctx.app.inject({ method: 'GET', url: '/api/egresos' });
  expect(lista.json()).toHaveLength(1);
  const resumen = await ctx.app.inject({ method: 'GET', url: '/api/jornadas/actual/resumen' });
  expect(resumen.json().total_egresos).toBe(12.5);
  expect(resumen.json().efectivo_esperado).toBe(37.5);
});
```

- [ ] **Step 2: Ejecutar** → FAIL.

- [ ] **Step 3: Escribir egresos.ts**

`src/servidor/modulos/egresos.ts`:
```ts
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { egreso, pedido } from '../db/schema';
import { ErrorValidacion, NoEncontrado } from '../errores';
import { requerirJornadaAbierta } from './jornada';
import { redondear } from './totales';

const TIPOS = ['compra_ingredientes', 'devolucion_cliente', 'otro'] as const;

export async function listarEgresos(db: Db, jornadaId: string) {
  return db.select().from(egreso).where(eq(egreso.jornada_id, jornadaId)).orderBy(asc(egreso.creado_en));
}

export async function crearEgreso(db: Db, datos: { tipo: string; monto: number | string; motivo: string; pedido_id?: string | null }) {
  const j = await requerirJornadaAbierta(db);
  if (!TIPOS.includes(datos?.tipo as any)) throw new ErrorValidacion('Tipo de egreso inválido');
  const monto = redondear(Number(datos.monto));
  if (Number.isNaN(monto) || monto <= 0) throw new ErrorValidacion('El monto debe ser mayor a 0');
  const motivo = String(datos.motivo ?? '').trim();
  if (!motivo) throw new ErrorValidacion('El egreso necesita un motivo');
  let pedidoId: string | null = null;
  if (datos.pedido_id) {
    const [p] = await db.select({ id: pedido.id }).from(pedido).where(eq(pedido.id, String(datos.pedido_id)));
    if (!p) throw new NoEncontrado('El pedido no existe');
    pedidoId = p.id;
  }
  const [e] = await db.insert(egreso).values({ jornada_id: j.id, tipo: datos.tipo as any, monto: monto.toFixed(2), motivo, pedido_id: pedidoId }).returning();
  return e;
}

export function rutasEgresos(app: FastifyInstance) {
  app.get('/api/egresos', async () => { const j = await requerirJornadaAbierta(app.db); return listarEgresos(app.db, j.id); });
  app.post('/api/egresos', async (req, reply) => { const e = await crearEgreso(app.db, req.body as any); app.bus.emitir('jornada'); return reply.status(201).send(e); });
}
```

Registrar en `app.ts`: `rutasEgresos(app);`.

- [ ] **Step 4: Ejecutar** → `npm test` → pasa.

- [ ] **Step 5: Escribir Egresos.tsx y enlazar en AppCaja**

`src/web/caja/Egresos.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { Aviso } from '../componentes/Aviso';
import { dinero } from '../comun/dinero';

const TIPOS = [['compra_ingredientes', 'Compra de ingredientes'], ['devolucion_cliente', 'Devolución a cliente'], ['otro', 'Otro']] as const;

export function Egresos({ simbolo, onVolver }: { simbolo: string; onVolver: () => void }) {
  const [lista, setLista] = useState<any[]>([]);
  const [tipo, setTipo] = useState('compra_ingredientes');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [pedidoNumero, setPedidoNumero] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cargar = () => api.get('/api/egresos').then(setLista).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);
  useEventos(['jornada'], () => cargar());
  const crear = async (e: Event) => {
    e.preventDefault(); setError(null);
    try {
      let pedido_id: string | undefined;
      if (pedidoNumero.trim()) {
        const mesas = await api.get('/api/mesas');
        const p = [...mesas.mesas, ...mesas.para_llevar].find((m: any) => String(m.numero) === pedidoNumero.trim() && m.pedido_id);
        if (!p) throw new Error('No hay un pedido abierto con ese número; deja el campo vacío si es un pedido ya cobrado');
        pedido_id = p.pedido_id;
      }
      await api.post('/api/egresos', { tipo, monto: Number(monto), motivo, pedido_id });
      setMonto(''); setMotivo(''); setPedidoNumero('');
    } catch (err: any) { setError(err.message); }
  };
  const total = lista.reduce((s, e) => s + Number(e.monto), 0);
  return (
    <div style="display:grid;gap:16px">
      <div class="fila" style="align-items:center"><button onClick={onVolver} style="flex:0 0 auto">← Mesas</button><h2 style="margin:0">Egresos de hoy</h2><b style="margin-left:auto">{dinero(total, simbolo)}</b></div>
      <form onSubmit={crear} class="tarjeta fila">
        <label>Tipo<select value={tipo} onChange={(e) => setTipo((e.target as HTMLSelectElement).value)}>{TIPOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Monto<input type="number" step="0.01" min="0.01" value={monto} onInput={(e) => setMonto((e.target as HTMLInputElement).value)} required /></label>
        <label>Motivo<input value={motivo} onInput={(e) => setMotivo((e.target as HTMLInputElement).value)} required /></label>
        <label>Mesa (opcional)<input value={pedidoNumero} onInput={(e) => setPedidoNumero((e.target as HTMLInputElement).value)} placeholder="Nº de mesa abierta" /></label>
        <button class="primario" type="submit" style="flex:0 0 auto">Registrar</button>
      </form>
      <Aviso tipo="error" texto={error} />
      <table><thead><tr><th>Hora</th><th>Tipo</th><th>Motivo</th><th style="text-align:right">Monto</th></tr></thead>
        <tbody>{lista.map((e) => <tr key={e.id}><td>{new Date(e.creado_en).toLocaleTimeString('es-EC', { timeStyle: 'short' })}</td><td>{TIPOS.find(([k]) => k === e.tipo)?.[1]}</td><td>{e.motivo}</td><td style="text-align:right">{dinero(e.monto, simbolo)}</td></tr>)}</tbody></table>
    </div>
  );
}
```

En `src/web/caja/AppCaja.tsx`: ampliar el estado `vista` a `'mesas' | 'cerrar' | 'egresos' | 'encargos'`; en la barra, junto a "Cerrar caja", agregar `<button onClick={() => { setPedidoId(null); setVista('egresos'); }}>Egresos</button>`; en el render, antes de `pedidoId ? ...`, agregar `vista === 'egresos' ? <Egresos simbolo={simbolo} onVolver={() => setVista('mesas')} /> :`. Importar `Egresos`.

- [ ] **Step 6: Verificar** → `npm run typecheck && npm run build && npm test`. Manual: registrar un egreso y ver que "Efectivo esperado" de la barra baja.

- [ ] **Step 7: Commit y push**

```bash
git add -A && git commit -m "Egresos por tipo con efecto en el arqueo" && git push origin main
```

---

### Task 3: Encargos con abonos (servidor)
**Modelo ejecutor:** `claude-fable-5-1`. **Motivo:** la tarea exige criterio propio (concurrencia, dinero, depuración o selectores que el plan no puede anticipar del todo).
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/modulos/encargos.ts`, `tests/encargos.test.ts`
- Modify: `src/servidor/app.ts`

**Interfaces:**
- Consumes: `requerirJornadaAbierta`, `obtenerConfiguracion`, `obtenerCliente`, `calcularTotales`, `redondear`, tablas `encargo`, `encargoItem`, `abono`, `pedido`, `cuenta`, `ronda`, `pedidoItem`, `pago`.
- Produces:
  - `type ItemEncargo = { producto_id?: string | null; es_libre?: boolean; nombre?: string; precio?: number | string; cantidad: number; nota?: string }`
  - `listarEncargos(db, { estado?: 'pendiente' | 'entregado' | 'cancelado' })` → `{ encargos: [{ ...encargo, cliente_nombre, total, abonado, saldo, items }], saldo_caja_encargos }`. Por defecto solo pendientes, ordenados por `fecha_entrega`.
  - `obtenerEncargo(db, id)` → encargo con `cliente`, `items`, `abonos`, `total`, `abonado`, `saldo`.
  - `crearEncargo(db, { cliente_id, fecha_entrega: 'AAAA-MM-DD', notas?, items: ItemEncargo[] })` → 201. Valida cliente existente, fecha válida, al menos un ítem, ítems libres solo si config lo permite. Los ítems de producto copian nombre y precio; no tocan stock.
  - `editarEncargo(db, id, { fecha_entrega?, notas?, items? })` → solo `pendiente`; si vienen `items`, reemplaza todos; el nuevo total no puede ser menor que lo abonado (409 `El total no puede ser menor que lo ya abonado`).
  - `abonar(db, id, { id: uuid, metodo, monto, referencia? })` → idempotente por `id`; 409 `El abono supera el saldo del encargo`; monto > 0.
  - `entregar(db, id)` → según spec 4.4: crea pedido `origen = encargo` con cuenta 1 (cliente del encargo), ronda 1 `origen = caja`, `enviada_a_cocina = false`, ítems con `afecta_stock = false`; convierte abonos pendientes en pagos (`referencia = "Abono DD/MM"`), marca abonos `aplicado`, encargo `entregado`, `pedido_id`. Si los abonos cubren todo el total, la cuenta y el pedido quedan cobrados de inmediato. Devuelve `{ encargo, pedido_id }`.
  - `cancelar(db, id, { motivo, abonos: 'devolver' | 'retener' })` → `devolver`: abonos pendientes → `devuelto`; `retener`: crea pedido `origen = encargo` con un ítem libre "Encargo #N cancelado" por el total abonado, cuenta 1 con el cliente, abonos aplicados como pagos, pedido cobrado; `abono_retenido = true`. Sin abonos: solo estado.
  - `comprobanteHtml(db, id)` → HTML imprimible con número, cliente, fecha de entrega, ítems, total, abonos, saldo.
  - Rutas: `GET /api/encargos?estado=`, `GET /api/encargos/:id`, `POST /api/encargos`, `PATCH /api/encargos/:id`, `POST /api/encargos/:id/abonos` (201 / 200 repetido), `POST /api/encargos/:id/entregar`, `POST /api/encargos/:id/cancelar`, `GET /api/encargos/:id/comprobante`. Emiten `jornada` (para el resumen) y `mesa` (al entregar o retener).

- [ ] **Step 1: Escribir la prueba**

`tests/encargos.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { crearAppDePrueba } from './ayuda/app';
import { abrirCajaDePrueba, crearMenuDePrueba } from './ayuda/datos';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
let menu: Awaited<ReturnType<typeof crearMenuDePrueba>>;
let clienteId: string;
beforeAll(async () => {
  ctx = await crearAppDePrueba();
  menu = await crearMenuDePrueba(ctx.app);
  clienteId = (await ctx.app.inject({ method: 'POST', url: '/api/clientes', payload: { nombre: 'Rosa', telefono: '0999' } })).json().id;
});
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });
const post = (url: string, payload: any) => ctx.app.inject({ method: 'POST', url, payload });
const get = (url: string) => ctx.app.inject({ method: 'GET', url });

test('crear encargo exige caja abierta, no toca stock y calcula totales', async () => {
  const sin = await post('/api/encargos', { cliente_id: clienteId, fecha_entrega: '2026-09-18', items: [{ producto_id: menu.bolonId, cantidad: 30 }] });
  expect(sin.statusCode).toBe(409);
  await abrirCajaDePrueba(ctx.app, 20);
  const r = await post('/api/encargos', { cliente_id: clienteId, fecha_entrega: '2026-09-18', notas: 'Para cumpleaños', items: [{ producto_id: menu.bolonId, cantidad: 30 }, { es_libre: true, nombre: 'Torta', precio: 15, cantidad: 1 }] });
  expect(r.statusCode).toBe(201);
  expect(r.json().numero).toBe(1);
  expect(r.json().total).toBe(105);
  expect(r.json().saldo).toBe(105);
  const stock = await ctx.sql`SELECT stock_actual FROM producto WHERE id = ${menu.bolonId}`;
  expect(stock[0].stock_actual).toBe(2);
  const sinItems = await post('/api/encargos', { cliente_id: clienteId, fecha_entrega: '2026-09-18', items: [] });
  expect(sinItems.statusCode).toBe(400);
  const malaFecha = await post('/api/encargos', { cliente_id: clienteId, fecha_entrega: 'ayer', items: [{ producto_id: menu.bolonId, cantidad: 1 }] });
  expect(malaFecha.statusCode).toBe(400);
});

test('abonos: idempotentes, no superan el saldo, no son venta, van a caja de encargos', async () => {
  const e = (await post('/api/encargos', { cliente_id: clienteId, fecha_entrega: '2026-09-19', items: [{ producto_id: menu.capuchinoId, cantidad: 10 }] })).json(); // total 25
  const id = randomUUID();
  const a1 = await post(`/api/encargos/${e.id}/abonos`, { id, metodo: 'efectivo', monto: 10 });
  expect(a1.statusCode).toBe(201);
  const rep = await post(`/api/encargos/${e.id}/abonos`, { id, metodo: 'efectivo', monto: 10 });
  expect(rep.statusCode).toBe(200);
  const demas = await post(`/api/encargos/${e.id}/abonos`, { id: randomUUID(), metodo: 'transferencia', monto: 20 });
  expect(demas.statusCode).toBe(409);
  expect(demas.json().error).toBe('El abono supera el saldo del encargo');
  await post(`/api/encargos/${e.id}/abonos`, { id: randomUUID(), metodo: 'transferencia', monto: 5, referencia: 'TRX-9' });
  const det = (await get(`/api/encargos/${e.id}`)).json();
  expect(det.abonado).toBe(15);
  expect(det.saldo).toBe(10);
  expect(det.abonos).toHaveLength(2);
  const resumen = (await get('/api/jornadas/actual/resumen')).json();
  expect(resumen.total_ventas).toBe(0);
  expect(resumen.total_abonos_recibidos).toBe(15);
  expect(resumen.saldo_caja_encargos).toBe(10);
  expect(resumen.efectivo_esperado).toBe(20);
  const lista = (await get('/api/encargos')).json();
  expect(lista.saldo_caja_encargos).toBe(10);
  expect(lista.encargos.map((x: any) => x.numero)).toEqual([1, 2]);
});

test('editar encargo pendiente sin bajar de lo abonado', async () => {
  const e = (await get('/api/encargos')).json().encargos.find((x: any) => x.numero === 2);
  const menos = await ctx.app.inject({ method: 'PATCH', url: `/api/encargos/${e.id}`, payload: { items: [{ producto_id: menu.capuchinoId, cantidad: 4 }] } });
  expect(menos.statusCode).toBe(409);
  const ok = await ctx.app.inject({ method: 'PATCH', url: `/api/encargos/${e.id}`, payload: { fecha_entrega: '2026-09-20', items: [{ producto_id: menu.capuchinoId, cantidad: 12 }] } });
  expect(ok.statusCode).toBe(200);
  expect(ok.json().total).toBe(30);
  expect(ok.json().saldo).toBe(15);
});

test('entregar convierte en pedido con abonos aplicados; cobrar el saldo registra la venta', async () => {
  const e = (await get('/api/encargos')).json().encargos.find((x: any) => x.numero === 2);
  const r = await post(`/api/encargos/${e.id}/entregar`, {});
  expect(r.statusCode).toBe(200);
  const pedidoId = r.json().pedido_id;
  const p = (await get(`/api/pedidos/${pedidoId}`)).json();
  expect(p.origen).toBe('encargo');
  expect(p.estado).toBe('abierto');
  expect(p.cuentas[0].cliente_id).toBe(clienteId);
  expect(p.cuentas[0].totales).toMatchObject({ total: 30, pagado: 15, saldo: 15 });
  expect(p.cuentas[0].pagos.map((x: any) => x.referencia)).toEqual(expect.arrayContaining([expect.stringMatching(/^Abono \d\d\/\d\d$/)]));
  expect(p.cuentas[0].items[0].afecta_stock).toBe(false);
  expect(p.rondas[0].enviada_a_cocina).toBe(false);
  const abonos = (await get(`/api/encargos/${e.id}`)).json().abonos;
  expect(abonos.every((a: any) => a.estado === 'aplicado')).toBe(true);
  const otraVez = await post(`/api/encargos/${e.id}/entregar`, {});
  expect(otraVez.statusCode).toBe(409);
  const cobro = await post(`/api/cuentas/${p.cuentas[0].id}/pagos`, { id: randomUUID(), metodo: 'efectivo', monto: 15 });
  expect(cobro.json().pedido.estado).toBe('cobrado');
  const resumen = (await get('/api/jornadas/actual/resumen')).json();
  expect(resumen.total_ventas).toBe(30);
  expect(resumen.total_efectivo).toBe(25);
  expect(resumen.total_transferencia).toBe(5);
  expect(resumen.efectivo_esperado).toBe(45);
  expect(resumen.saldo_caja_encargos).toBe(0);
  const ticket = await get(`/api/cuentas/${p.cuentas[0].id}/ticket`);
  expect(ticket.body).toContain('Encargo');
});

test('cancelar con devolver y con retener', async () => {
  const a = (await post('/api/encargos', { cliente_id: clienteId, fecha_entrega: '2026-09-21', items: [{ producto_id: menu.capuchinoId, cantidad: 4 }] })).json();
  await post(`/api/encargos/${a.id}/abonos`, { id: randomUUID(), metodo: 'efectivo', monto: 4 });
  const dev = await post(`/api/encargos/${a.id}/cancelar`, { motivo: 'Cliente desistió', abonos: 'devolver' });
  expect(dev.statusCode).toBe(200);
  expect(dev.json().encargo.estado).toBe('cancelado');
  expect((await get(`/api/encargos/${a.id}`)).json().abonos[0].estado).toBe('devuelto');
  const b = (await post('/api/encargos', { cliente_id: clienteId, fecha_entrega: '2026-09-22', items: [{ producto_id: menu.capuchinoId, cantidad: 4 }] })).json();
  await post(`/api/encargos/${b.id}/abonos`, { id: randomUUID(), metodo: 'efectivo', monto: 6 });
  const antes = (await get('/api/jornadas/actual/resumen')).json();
  const ret = await post(`/api/encargos/${b.id}/cancelar`, { motivo: 'No vino', abonos: 'retener' });
  expect(ret.statusCode).toBe(200);
  expect(ret.json().encargo.abono_retenido).toBe(true);
  const p = (await get(`/api/pedidos/${ret.json().pedido_id}`)).json();
  expect(p.estado).toBe('cobrado');
  expect(p.cuentas[0].items[0].nombre_producto).toBe(`Encargo #${b.numero} cancelado`);
  const despues = (await get('/api/jornadas/actual/resumen')).json();
  expect(despues.total_ventas).toBe(antes.total_ventas + 6);
  expect(despues.total_abonos_devueltos).toBe(4);
  const sinMotivo = await post(`/api/encargos/${a.id}/cancelar`, { motivo: '', abonos: 'devolver' });
  expect(sinMotivo.statusCode).toBe(400);
});

test('comprobante de encargo', async () => {
  const e = (await post('/api/encargos', { cliente_id: clienteId, fecha_entrega: '2026-09-25', items: [{ es_libre: true, nombre: 'Quimbolitos', precio: 0.5, cantidad: 30 }] })).json();
  await post(`/api/encargos/${e.id}/abonos`, { id: randomUUID(), metodo: 'efectivo', monto: 5 });
  const c = await get(`/api/encargos/${e.id}/comprobante`);
  expect(c.statusCode).toBe(200);
  expect(c.body).toContain(`Encargo #${e.numero}`);
  expect(c.body).toContain('Rosa');
  expect(c.body).toContain('Quimbolitos');
  expect(c.body).toContain('15.00');
  expect(c.body).toContain('5.00');
  expect(c.body).toContain('10.00');
  expect(c.body.toLowerCase()).not.toContain('impuesto');
});
```

- [ ] **Step 2: Ejecutar** → FAIL (404).

- [ ] **Step 3: Escribir encargos.ts**

`src/servidor/modulos/encargos.ts`:
```ts
import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { encargo, encargoItem, abono, cliente, producto, pedido, cuenta, ronda, pedidoItem, pago } from '../db/schema';
import { ErrorNegocio, ErrorValidacion, NoEncontrado } from '../errores';
import { requerirJornadaAbierta } from './jornada';
import { obtenerConfiguracion } from './configuracion';
import { redondear } from './totales';

export type ItemEncargo = { producto_id?: string | null; es_libre?: boolean; nombre?: string; precio?: number | string; cantidad: number; nota?: string };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const METODOS: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };

async function normalizarItems(db: Db, items: ItemEncargo[]) {
  if (!Array.isArray(items) || !items.length) throw new ErrorValidacion('El encargo necesita al menos un ítem');
  const cfg = await obtenerConfiguracion(db);
  const salida: (typeof encargoItem.$inferInsert)[] = [];
  for (const it of items) {
    const cantidad = Number(it.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1) throw new ErrorValidacion('La cantidad debe ser un entero mayor a 0');
    const nota = it.nota ? String(it.nota).trim() || null : null;
    if (it.es_libre) {
      if (!cfg.permitir_items_libres) throw new ErrorNegocio('Los ítems libres están desactivados');
      const nombre = String(it.nombre ?? '').trim(); if (!nombre) throw new ErrorValidacion('El ítem libre necesita un nombre');
      const precio = Number(it.precio); if (Number.isNaN(precio) || precio < 0) throw new ErrorValidacion('El precio del ítem libre debe ser mayor o igual a 0');
      salida.push({ encargo_id: '', producto_id: null, es_libre: true, nombre_producto: nombre, precio_unitario: redondear(precio).toFixed(2), cantidad, nota });
    } else {
      const [p] = await db.select().from(producto).where(eq(producto.id, String(it.producto_id)));
      if (!p || !p.activo) throw new ErrorValidacion('El producto no existe o está inactivo');
      salida.push({ encargo_id: '', producto_id: p.id, es_libre: false, nombre_producto: p.nombre, precio_unitario: p.precio, cantidad, nota });
    }
  }
  return salida;
}
const totalItems = (items: { precio_unitario: string | number; cantidad: number }[]) => redondear(items.reduce((s, i) => s + redondear(Number(i.precio_unitario) * i.cantidad), 0));
function fechaValida(v: unknown): string {
  const t = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(t))) throw new ErrorValidacion('La fecha de entrega debe tener el formato AAAA-MM-DD');
  return t;
}

async function saldoCajaEncargos(db: Db) {
  const pend = await db.select().from(abono).where(and(eq(abono.estado, 'pendiente'), eq(abono.metodo, 'efectivo')));
  return redondear(pend.reduce((s, a) => s + Number(a.monto), 0));
}

export async function obtenerEncargo(db: Db, id: string) {
  const [e] = await db.select().from(encargo).where(eq(encargo.id, id));
  if (!e) throw new NoEncontrado('El encargo no existe');
  const [cli] = await db.select().from(cliente).where(eq(cliente.id, e.cliente_id));
  const items = await db.select().from(encargoItem).where(eq(encargoItem.encargo_id, id)).orderBy(asc(encargoItem.creado_en));
  const abonos = await db.select().from(abono).where(eq(abono.encargo_id, id)).orderBy(asc(abono.creado_en));
  const total = totalItems(items);
  const abonado = redondear(abonos.filter((a) => a.estado !== 'devuelto').reduce((s, a) => s + Number(a.monto), 0));
  return { ...e, cliente: cli, items, abonos, total, abonado, saldo: redondear(total - abonado) };
}

export async function listarEncargos(db: Db, filtro: { estado?: string } = {}) {
  const estado = (filtro.estado ?? 'pendiente') as 'pendiente' | 'entregado' | 'cancelado' | 'todos';
  const filas = await db.select({ e: encargo, cliente_nombre: cliente.nombre }).from(encargo).innerJoin(cliente, eq(cliente.id, encargo.cliente_id))
    .where(estado === 'todos' ? undefined : eq(encargo.estado, estado)).orderBy(estado === 'pendiente' ? asc(encargo.fecha_entrega) : desc(encargo.creado_en)).limit(300);
  const ids = filas.map((f) => f.e.id);
  const items = ids.length ? await db.select().from(encargoItem).where(inArray(encargoItem.encargo_id, ids)) : [];
  const abonos = ids.length ? await db.select().from(abono).where(inArray(abono.encargo_id, ids)) : [];
  const encargos = filas.map((f) => {
    const its = items.filter((i) => i.encargo_id === f.e.id);
    const total = totalItems(its);
    const abonado = redondear(abonos.filter((a) => a.encargo_id === f.e.id && a.estado !== 'devuelto').reduce((s, a) => s + Number(a.monto), 0));
    return { ...f.e, cliente_nombre: f.cliente_nombre, items: its, total, abonado, saldo: redondear(total - abonado) };
  });
  return { encargos, saldo_caja_encargos: await saldoCajaEncargos(db) };
}

export async function crearEncargo(db: Db, datos: { cliente_id: string; fecha_entrega: string; notas?: string; items: ItemEncargo[] }) {
  const j = await requerirJornadaAbierta(db);
  const [cli] = await db.select({ id: cliente.id }).from(cliente).where(eq(cliente.id, String(datos.cliente_id)));
  if (!cli) throw new NoEncontrado('El cliente no existe');
  const fecha = fechaValida(datos.fecha_entrega);
  const items = await normalizarItems(db, datos.items);
  const id = await db.transaction(async (tx) => {
    const [e] = await tx.insert(encargo).values({ cliente_id: cli.id, fecha_entrega: fecha, notas: datos.notas ? String(datos.notas).trim() || null : null, jornada_creacion_id: j.id }).returning();
    await tx.insert(encargoItem).values(items.map((i) => ({ ...i, encargo_id: e.id })));
    return e.id;
  });
  return obtenerEncargo(db, id);
}

async function pendiente(db: Db, id: string) {
  const e = await obtenerEncargo(db, id);
  if (e.estado !== 'pendiente') throw new ErrorNegocio('El encargo ya fue entregado o cancelado');
  return e;
}

export async function editarEncargo(db: Db, id: string, datos: { fecha_entrega?: string; notas?: string; items?: ItemEncargo[] }) {
  await requerirJornadaAbierta(db);
  const e = await pendiente(db, id);
  const cambios: Partial<typeof encargo.$inferInsert> = { actualizado_en: new Date() };
  if (datos.fecha_entrega !== undefined) cambios.fecha_entrega = fechaValida(datos.fecha_entrega);
  if (datos.notas !== undefined) cambios.notas = String(datos.notas).trim() || null;
  const nuevos = datos.items !== undefined ? await normalizarItems(db, datos.items) : null;
  if (nuevos && totalItems(nuevos) + 0.005 < e.abonado) throw new ErrorNegocio('El total no puede ser menor que lo ya abonado');
  await db.transaction(async (tx) => {
    await tx.update(encargo).set(cambios).where(eq(encargo.id, id));
    if (nuevos) { await tx.delete(encargoItem).where(eq(encargoItem.encargo_id, id)); await tx.insert(encargoItem).values(nuevos.map((i) => ({ ...i, encargo_id: id }))); }
  });
  return obtenerEncargo(db, id);
}

export async function abonar(db: Db, id: string, datos: { id: string; metodo: string; monto: number | string; referencia?: string }) {
  const j = await requerirJornadaAbierta(db);
  if (!datos?.id) throw new ErrorValidacion('El abono necesita un id');
  const [existente] = await db.select().from(abono).where(eq(abono.id, datos.id));
  if (existente) return { abono: existente, repetido: true, encargo: await obtenerEncargo(db, existente.encargo_id) };
  const e = await pendiente(db, id);
  if (!['efectivo', 'tarjeta', 'transferencia'].includes(String(datos.metodo))) throw new ErrorValidacion('Método de pago inválido');
  const monto = redondear(Number(datos.monto));
  if (Number.isNaN(monto) || monto <= 0) throw new ErrorValidacion('El monto debe ser mayor a 0');
  if (monto > e.saldo + 0.005) throw new ErrorNegocio('El abono supera el saldo del encargo');
  const [a] = await db.insert(abono).values({ id: datos.id, encargo_id: id, jornada_id: j.id, metodo: datos.metodo as any, monto: monto.toFixed(2), referencia: datos.referencia ? String(datos.referencia).trim() || null : null }).returning();
  return { abono: a, repetido: false, encargo: await obtenerEncargo(db, id) };
}

async function crearPedidoDesdeEncargo(tx: any, j: { id: string }, e: Awaited<ReturnType<typeof obtenerEncargo>>, items: { producto_id: string | null; es_libre: boolean; nombre_producto: string; precio_unitario: string; cantidad: number; nota: string | null }[]) {
  const [{ ultimo }] = await tx.select({ ultimo: max(pedido.numero) }).from(pedido).where(eq(pedido.jornada_id, j.id));
  const [p] = await tx.insert(pedido).values({ jornada_id: j.id, numero_mesa: 0, numero: (ultimo ?? 0) + 1, mesero_id: null, origen: 'encargo', encargo_id: e.id }).returning();
  const [c] = await tx.insert(cuenta).values({ pedido_id: p.id, numero: 1, cliente_id: e.cliente_id }).returning();
  const [r] = await tx.insert(ronda).values({ pedido_id: p.id, numero: 1, origen: 'caja', enviada_a_cocina: false }).returning();
  await tx.insert(pedidoItem).values(items.map((i) => ({ ronda_id: r.id, cuenta_id: c.id, producto_id: i.producto_id, es_libre: i.es_libre, nombre_producto: i.nombre_producto, precio_unitario: i.precio_unitario, cantidad: i.cantidad, nota: i.nota, afecta_stock: false })));
  const ahora = new Date();
  const dd = String(ahora.getDate()).padStart(2, '0'), mm = String(ahora.getMonth() + 1).padStart(2, '0');
  let pagado = 0;
  for (const a of e.abonos.filter((x) => x.estado === 'pendiente')) {
    const f = new Date(a.creado_en);
    await tx.insert(pago).values({ cuenta_id: c.id, metodo: a.metodo, monto: a.monto, referencia: `Abono ${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}` });
    await tx.update(abono).set({ estado: 'aplicado', aplicado_en: ahora, actualizado_en: ahora }).where(eq(abono.id, a.id));
    pagado += Number(a.monto);
  }
  const total = totalItems(items);
  if (redondear(total - pagado) <= 0.005) {
    await tx.update(cuenta).set({ estado: 'cobrada', cobrada_en: ahora, actualizado_en: ahora }).where(eq(cuenta.id, c.id));
    await tx.update(pedido).set({ estado: 'cobrado', cobrado_en: ahora, actualizado_en: ahora }).where(eq(pedido.id, p.id));
  }
  void dd; void mm;
  return p;
}

export async function entregar(db: Db, id: string) {
  const j = await requerirJornadaAbierta(db);
  const e = await pendiente(db, id);
  const pedidoId = await db.transaction(async (tx) => {
    const p = await crearPedidoDesdeEncargo(tx, j, e, e.items.map((i) => ({ producto_id: i.producto_id, es_libre: i.es_libre, nombre_producto: i.nombre_producto, precio_unitario: i.precio_unitario, cantidad: i.cantidad, nota: i.nota })));
    await tx.update(encargo).set({ estado: 'entregado', entregado_en: new Date(), pedido_id: p.id, actualizado_en: new Date() }).where(eq(encargo.id, id));
    return p.id;
  });
  return { encargo: await obtenerEncargo(db, id), pedido_id: pedidoId };
}

export async function cancelar(db: Db, id: string, datos: { motivo: string; abonos?: 'devolver' | 'retener' }) {
  const j = await requerirJornadaAbierta(db);
  const e = await pendiente(db, id);
  const motivo = String(datos?.motivo ?? '').trim();
  if (!motivo) throw new ErrorValidacion('La cancelación necesita un motivo');
  const pendientes = e.abonos.filter((a) => a.estado === 'pendiente');
  const modo = datos.abonos ?? 'devolver';
  if (pendientes.length && !['devolver', 'retener'].includes(modo)) throw new ErrorValidacion('Indica si los abonos se devuelven o se retienen');
  const pedidoId = await db.transaction(async (tx) => {
    let pid: string | null = null;
    if (pendientes.length && modo === 'retener') {
      const total = redondear(pendientes.reduce((s, a) => s + Number(a.monto), 0));
      const p = await crearPedidoDesdeEncargo(tx, j, e, [{ producto_id: null, es_libre: true, nombre_producto: `Encargo #${e.numero} cancelado`, precio_unitario: total.toFixed(2), cantidad: 1, nota: motivo }]);
      pid = p.id;
    } else if (pendientes.length) {
      await tx.update(abono).set({ estado: 'devuelto', devuelto_en: new Date(), actualizado_en: new Date() }).where(inArray(abono.id, pendientes.map((a) => a.id)));
    }
    await tx.update(encargo).set({ estado: 'cancelado', cancelado_en: new Date(), motivo_cancelacion: motivo, abono_retenido: pendientes.length ? modo === 'retener' : null, pedido_id: pid, actualizado_en: new Date() }).where(eq(encargo.id, id));
    return pid;
  });
  return { encargo: await obtenerEncargo(db, id), pedido_id: pedidoId };
}

export async function comprobanteHtml(db: Db, id: string) {
  const e = await obtenerEncargo(db, id);
  const cfg = await obtenerConfiguracion(db);
  const f = (n: number | string) => Number(n).toFixed(2);
  const filas = e.items.map((i) => `<tr><td>${i.cantidad}</td><td>${esc(i.nombre_producto)}${i.nota ? `<br><small>${esc(i.nota)}</small>` : ''}</td><td class="n">${f(i.precio_unitario)}</td><td class="n">${f(Number(i.precio_unitario) * i.cantidad)}</td></tr>`).join('');
  const abonos = e.abonos.filter((a) => a.estado !== 'devuelto').map((a) => `<tr><td colspan="3">Abono ${new Date(a.creado_en).toLocaleDateString('es-EC')} · ${METODOS[a.metodo]}${a.referencia ? ' ' + esc(a.referencia) : ''}</td><td class="n">${f(a.monto)}</td></tr>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Encargo ${e.numero}</title>
<style>body{font-family:"Courier New",monospace;font-size:12px;margin:0;padding:8px;color:#000;background:#fff}.t{max-width:72mm;margin:0 auto}h1{font-size:14px;text-align:center;margin:0 0 4px}.c{text-align:center}table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}.n{text-align:right;white-space:nowrap}hr{border:0;border-top:1px dashed #000;margin:6px 0}.tot td{font-weight:bold}@media print{@page{size:80mm auto;margin:4mm}body{padding:0}}</style></head>
<body><div class="t"><h1>${esc(cfg.nombre_local)}</h1><p class="c">CONSTANCIA DE ENCARGO<br>Encargo #${e.numero}<br>Entrega: ${new Date(e.fecha_entrega + 'T12:00:00').toLocaleDateString('es-EC')}<br>Cliente: ${esc(e.cliente?.nombre)}${e.cliente?.telefono ? ' · ' + esc(e.cliente.telefono) : ''}</p>
<hr><table>${filas}</table><hr><table><tr class="tot"><td colspan="3">TOTAL ${esc(cfg.simbolo_moneda)}</td><td class="n">${f(e.total)}</td></tr>${abonos}<tr class="tot"><td colspan="3">SALDO PENDIENTE</td><td class="n">${f(e.saldo)}</td></tr></table>
${e.notas ? `<hr><p>${esc(e.notas)}</p>` : ''}<p class="c">Presente esta constancia al retirar.</p></div><script>if(location.search.includes('imprimir'))window.print()</script></body></html>`;
}

export function rutasEncargos(app: FastifyInstance) {
  app.get<{ Querystring: { estado?: string } }>('/api/encargos', async (req) => listarEncargos(app.db, { estado: req.query.estado }));
  app.get<{ Params: { id: string } }>('/api/encargos/:id', async (req) => obtenerEncargo(app.db, req.params.id));
  app.post('/api/encargos', async (req, reply) => { const e = await crearEncargo(app.db, req.body as any); app.bus.emitir('jornada'); return reply.status(201).send(e); });
  app.patch<{ Params: { id: string } }>('/api/encargos/:id', async (req) => { const e = await editarEncargo(app.db, req.params.id, req.body as any); app.bus.emitir('jornada'); return e; });
  app.post<{ Params: { id: string } }>('/api/encargos/:id/abonos', async (req, reply) => {
    const r = await abonar(app.db, req.params.id, req.body as any);
    if (!r.repetido) app.bus.emitir('jornada');
    return reply.status(r.repetido ? 200 : 201).send(r);
  });
  app.post<{ Params: { id: string } }>('/api/encargos/:id/entregar', async (req) => {
    const r = await entregar(app.db, req.params.id); app.bus.emitir('mesa', { pedido_id: r.pedido_id }); app.bus.emitir('jornada'); return r;
  });
  app.post<{ Params: { id: string } }>('/api/encargos/:id/cancelar', async (req) => {
    const r = await cancelar(app.db, req.params.id, req.body as any); if (r.pedido_id) app.bus.emitir('mesa', { pedido_id: r.pedido_id }); app.bus.emitir('jornada'); return r;
  });
  app.get<{ Params: { id: string } }>('/api/encargos/:id/comprobante', async (req, reply) => { reply.type('text/html; charset=utf-8'); return comprobanteHtml(app.db, req.params.id); });
}
```

Registrar en `app.ts`: `rutasEncargos(app);`.

- [ ] **Step 4: Ejecutar** → `npm run typecheck && npm test` → todo pasa. Si `total_abonos_devueltos` no coincide, revisar que `resumenJornada` filtra `devuelto_en >= abierta_en` de la jornada abierta.

- [ ] **Step 5: Commit y push**

```bash
git add -A && git commit -m "Encargos con abonos, caja de encargos, entrega, cancelación y constancia" && git push origin main
```

---

### Task 4: Encargos en la pantalla de caja
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/web/caja/Encargos.tsx`
- Modify: `src/web/caja/AppCaja.tsx`

**Interfaces:**
- Consumes: rutas de Task 3, `ClienteSelector`, `Catalogo`, `ListaBorrador`, `borradorAItems`, `dinero`.
- Produces: vista "Encargos" con lista de pendientes (los de hoy resaltados), saldo de caja de encargos, "Nuevo encargo", detalle con "Abonar", "Imprimir constancia", "Entregar" (navega al pedido resultante) y "Cancelar".

- [ ] **Step 1: Escribir Encargos.tsx**

`src/web/caja/Encargos.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { Aviso } from '../componentes/Aviso';
import { dinero } from '../comun/dinero';
import { Catalogo, ListaBorrador, borradorAItems, type ItemBorrador } from '../comun/Catalogo';
import { ClienteSelector } from './ClienteSelector';

const hoy = () => new Date().toISOString().slice(0, 10);

export function Encargos({ config, onVolver, onAbrirPedido }: { config: any; onVolver: () => void; onAbrirPedido: (id: string) => void }) {
  const simbolo = config.simbolo_moneda;
  const [datos, setDatos] = useState<{ encargos: any[]; saldo_caja_encargos: number } | null>(null);
  const [vista, setVista] = useState<'lista' | 'nuevo' | 'detalle'>('lista');
  const [actual, setActual] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoy());
  const [notas, setNotas] = useState('');
  const [borrador, setBorrador] = useState<ItemBorrador[]>([]);
  const [abonoId, setAbonoId] = useState(() => crypto.randomUUID());
  const [metodo, setMetodo] = useState('efectivo');
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
  const cargar = () => api.get('/api/encargos').then(setDatos).catch((e) => setError(e.message));
  const cargarActual = (id: string) => api.get(`/api/encargos/${id}`).then((e) => { setActual(e); setVista('detalle'); }).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);
  useEventos(['jornada'], () => { cargar(); if (actual) cargarActual(actual.id); });

  const crear = async (e: Event) => {
    e.preventDefault(); setError(null);
    if (!clienteId) { setError('Elige o crea el cliente'); return; }
    try {
      const nuevo = await api.post('/api/encargos', { cliente_id: clienteId, fecha_entrega: fecha, notas, items: borradorAItems(borrador) });
      setBorrador([]); setNotas(''); setClienteId(null); await cargar(); await cargarActual(nuevo.id);
    } catch (err: any) { setError(err.message); }
  };
  const abonar = async (e: Event) => {
    e.preventDefault(); setError(null);
    try { await api.post(`/api/encargos/${actual.id}/abonos`, { id: abonoId, metodo, monto: Number(monto), referencia: referencia || undefined }); setAbonoId(crypto.randomUUID()); setMonto(''); setReferencia(''); await cargarActual(actual.id); await cargar(); }
    catch (err: any) { setError(err.message); if (!err.message.includes('supera')) setAbonoId(crypto.randomUUID()); }
  };
  const entregar = async () => {
    if (!confirm(`¿Entregar el encargo #${actual.numero}? Se creará el pedido para cobrar el saldo.`)) return;
    try { const r = await api.post(`/api/encargos/${actual.id}/entregar`, {}); onAbrirPedido(r.pedido_id); } catch (err: any) { setError(err.message); }
  };
  const cancelar = async () => {
    const motivo = prompt('Motivo de la cancelación'); if (!motivo?.trim()) return;
    let abonos: 'devolver' | 'retener' = 'devolver';
    if (actual.abonado > 0) abonos = confirm(`El cliente abonó ${dinero(actual.abonado, simbolo)}. Aceptar = DEVOLVER el abono. Cancelar = RETENERLO como venta.`) ? 'devolver' : 'retener';
    try { await api.post(`/api/encargos/${actual.id}/cancelar`, { motivo, abonos }); setVista('lista'); setActual(null); await cargar(); } catch (err: any) { setError(err.message); }
  };

  return (
    <div style="display:grid;gap:16px">
      <div class="fila" style="align-items:center">
        <button onClick={vista === 'lista' ? onVolver : () => { setVista('lista'); setActual(null); }} style="flex:0 0 auto">← {vista === 'lista' ? 'Mesas' : 'Encargos'}</button>
        <h2 style="margin:0">{vista === 'nuevo' ? 'Nuevo encargo' : vista === 'detalle' && actual ? `Encargo #${actual.numero}` : 'Encargos'}</h2>
        {datos && <span class="pill" style="margin-left:auto">Caja de encargos: {dinero(datos.saldo_caja_encargos, simbolo)}</span>}
        {vista === 'lista' && <button class="primario" onClick={() => setVista('nuevo')} style="flex:0 0 auto">+ Nuevo encargo</button>}
      </div>
      <Aviso tipo="error" texto={error} />
      {vista === 'lista' && datos && (
        <table><thead><tr><th>Entrega</th><th>#</th><th>Cliente</th><th>Ítems</th><th style="text-align:right">Total</th><th style="text-align:right">Abonado</th><th style="text-align:right">Saldo</th></tr></thead>
          <tbody>{datos.encargos.map((e) => (
            <tr key={e.id} onClick={() => cargarActual(e.id)} style={`cursor:pointer;${e.fecha_entrega === hoy() ? 'background:var(--acento-suave)' : e.fecha_entrega < hoy() ? 'background:var(--error-suave)' : ''}`}>
              <td>{e.fecha_entrega}</td><td>{e.numero}</td><td>{e.cliente_nombre}</td><td>{e.items.map((i: any) => `${i.cantidad} ${i.nombre_producto}`).join(', ')}</td>
              <td style="text-align:right">{dinero(e.total, simbolo)}</td><td style="text-align:right">{dinero(e.abonado, simbolo)}</td><td style="text-align:right"><b>{dinero(e.saldo, simbolo)}</b></td></tr>))}
            {datos.encargos.length === 0 && <tr><td colspan={7} style="color:var(--gris)">No hay encargos pendientes.</td></tr>}</tbody></table>)}
      {vista === 'nuevo' && (
        <form onSubmit={crear} class="tarjeta" style="display:grid;gap:12px">
          <ClienteSelector clienteId={clienteId} onElegir={setClienteId} setError={setError} />
          <div class="fila"><label>Fecha de entrega<input type="date" value={fecha} min={hoy()} onInput={(e) => setFecha((e.target as HTMLInputElement).value)} required /></label>
            <label>Notas<input value={notas} onInput={(e) => setNotas((e.target as HTMLInputElement).value)} placeholder="ej. para cumpleaños" /></label></div>
          <Catalogo borrador={borrador} onCambiar={setBorrador} permitirLibres={config.permitir_items_libres} umbral={999999} simbolo={simbolo} />
          <ListaBorrador borrador={borrador} onCambiar={setBorrador} simbolo={simbolo} />
          <button class="primario" type="submit" disabled={!borrador.length} style="min-height:52px">Guardar encargo · {dinero(borrador.reduce((s, b) => s + b.precio * b.cantidad, 0), simbolo)}</button>
        </form>)}
      {vista === 'detalle' && actual && (
        <div style="display:grid;gap:12px">
          <div class="tarjeta"><b>{actual.cliente?.nombre}</b>{actual.cliente?.telefono ? ` · ${actual.cliente.telefono}` : ''}<br />Entrega: <b>{actual.fecha_entrega}</b> · Estado: <span class={`pill ${actual.estado === 'pendiente' ? 'alerta' : 'ok'}`}>{actual.estado}</span>{actual.notas ? <p style="margin:6px 0 0">{actual.notas}</p> : null}
            <ul style="margin:8px 0 0;padding-left:18px">{actual.items.map((i: any) => <li key={i.id}>{i.cantidad} × {i.nombre_producto} · {dinero(Number(i.precio_unitario) * i.cantidad, simbolo)}</li>)}</ul>
            <p style="text-align:right;margin:8px 0 0">Total <b>{dinero(actual.total, simbolo)}</b> · Abonado {dinero(actual.abonado, simbolo)} · Saldo <b>{dinero(actual.saldo, simbolo)}</b></p></div>
          {actual.abonos.length > 0 && <table><tbody>{actual.abonos.map((a: any) => <tr key={a.id}><td>{new Date(a.creado_en).toLocaleDateString('es-EC')}</td><td>{a.metodo}{a.referencia ? ` ${a.referencia}` : ''}</td><td><span class="pill">{a.estado}</span></td><td style="text-align:right">{dinero(a.monto, simbolo)}</td></tr>)}</tbody></table>}
          {actual.estado === 'pendiente' && (<>
            <form onSubmit={abonar} class="tarjeta fila">
              <label>Método<select value={metodo} onChange={(e) => setMetodo((e.target as HTMLSelectElement).value)}><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option></select></label>
              <label>Monto<input type="number" step="0.01" min="0.01" value={monto} onInput={(e) => setMonto((e.target as HTMLInputElement).value)} required /></label>
              <label>Referencia<input value={referencia} onInput={(e) => setReferencia((e.target as HTMLInputElement).value)} placeholder="opcional" /></label>
              <button class="primario" type="submit" style="flex:0 0 auto" disabled={actual.saldo <= 0}>Abonar</button>
            </form>
            <div class="fila">
              <a href={`/api/encargos/${actual.id}/comprobante?imprimir=1`} target="_blank"><button type="button">Imprimir constancia</button></a>
              <button class="primario" onClick={entregar} style="flex:0 0 auto">Entregar y cobrar saldo</button>
              <button class="peligro" onClick={cancelar} style="flex:0 0 auto;margin-left:auto">Cancelar encargo</button>
            </div></>)}
          {actual.estado !== 'pendiente' && actual.pedido_id && <button onClick={() => onAbrirPedido(actual.pedido_id)}>Ver pedido generado</button>}
        </div>)}
    </div>
  );
}
```

- [ ] **Step 2: Enlazar en AppCaja.tsx**: botón "Encargos" en la barra (`setVista('encargos')`), y en el render `vista === 'encargos' ? <Encargos config={cfg} onVolver={() => setVista('mesas')} onAbrirPedido={(id) => { setVista('mesas'); setPedidoId(id); }} /> :`. Importar `Encargos`.

- [ ] **Step 3: Verificar** → `npm run typecheck && npm run build && npm test`. Manual: crear encargo con cliente nuevo, abonar 5 en efectivo, ver que "Efectivo esperado" de la barra no cambia y "Caja de encargos" muestra 5; imprimir constancia; entregar: se abre el pedido con saldo; cobrar; ahora sí sube el efectivo esperado.

- [ ] **Step 4: Commit y push**

```bash
git add -A && git commit -m "Encargos en caja: lista, nuevo, abonar, constancia, entregar y cancelar" && git push origin main
```

---

### Task 5: Reportes por jornada, CSV, clientes en admin
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/modulos/reportes.ts`, `tests/reportes.test.ts`, `src/web/admin/Reportes.tsx`, `src/web/admin/Clientes.tsx`
- Modify: `src/servidor/app.ts`, `src/web/admin/AppAdmin.tsx`

**Interfaces:**
- Produces:
  - `reporteJornada(db, jornadaId)` → `{ jornada, cierre: resumen (congelado si está cerrada, calculado si abierta), ventas_por_producto: [{ nombre, cantidad, total }] (ítems libres agrupados en "Ítems libres"; solo cuentas cobradas; ítems anulados excluidos), stock_restante: [{ nombre, stock_actual }] (productos con control de stock), egresos: [...], encargos: [{ numero, cliente_nombre, estado, total, abonado, entregado_en, cancelado_en }] (entregados o cancelados durante la jornada, más creados en ella) }`.
  - `aCsv(filas: Record<string, unknown>[]): string` con `;` como separador y BOM UTF-8 (para Excel en español).
  - Rutas: `GET /api/jornadas/:id/reporte`, `GET /api/jornadas/:id/reporte.csv?seccion=cierre|ventas|stock|egresos|encargos` (descarga `text/csv`).
  - Admin: pestaña "Reportes" (selector de jornada, tablas, botones "Exportar CSV"), pestaña "Clientes" (búsqueda, tabla, edición inline de nombre, identificación, correo, teléfono, dirección).

- [ ] **Step 1: Escribir la prueba**

`tests/reportes.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { crearAppDePrueba } from './ayuda/app';
import { abrirCajaDePrueba, crearMenuDePrueba, crearMeseroDePrueba } from './ayuda/datos';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('reporte de jornada con ventas por producto, items libres, stock y csv', async () => {
  const menu = await crearMenuDePrueba(ctx.app);
  const meseroId = await crearMeseroDePrueba(ctx.app);
  const j = await abrirCajaDePrueba(ctx.app, 10);
  const p = (await ctx.app.inject({ method: 'POST', url: '/api/pedidos', payload: { numero_mesa: 1, mesero_id: meseroId } })).json();
  await ctx.app.inject({ method: 'POST', url: `/api/pedidos/${p.id}/rondas`, payload: { id: randomUUID(), origen: 'mesero', items: [{ producto_id: menu.sandwichId, cantidad: 2 }, { producto_id: menu.capuchinoId, cantidad: 1 }, { es_libre: true, nombre: 'Extra queso', precio: 0.5, cantidad: 2 }] } });
  const det = (await ctx.app.inject({ method: 'GET', url: `/api/pedidos/${p.id}` })).json();
  await ctx.app.inject({ method: 'POST', url: `/api/cuentas/${det.cuentas[0].id}/pagos`, payload: { id: randomUUID(), metodo: 'efectivo', monto: det.cuentas[0].totales.total } });
  await ctx.app.inject({ method: 'POST', url: '/api/egresos', payload: { tipo: 'otro', monto: 1, motivo: 'Hielo' } });
  const r = await ctx.app.inject({ method: 'GET', url: `/api/jornadas/${j.id}/reporte` });
  expect(r.statusCode).toBe(200);
  const rep = r.json();
  expect(rep.cierre.total_ventas).toBe(12.5);
  expect(rep.ventas_por_producto).toEqual(expect.arrayContaining([
    expect.objectContaining({ nombre: 'Sándwich de pollo', cantidad: 2, total: 9 }),
    expect.objectContaining({ nombre: 'Capuchino', cantidad: 1, total: 2.5 }),
    expect.objectContaining({ nombre: 'Ítems libres', cantidad: 2, total: 1 }),
  ]));
  expect(rep.stock_restante).toEqual(expect.arrayContaining([expect.objectContaining({ nombre: 'Sándwich de pollo', stock_actual: 10 })]));
  expect(rep.egresos).toHaveLength(1);
  const csv = await ctx.app.inject({ method: 'GET', url: `/api/jornadas/${j.id}/reporte.csv?seccion=ventas` });
  expect(csv.statusCode).toBe(200);
  expect(csv.headers['content-type']).toContain('text/csv');
  expect(csv.body).toContain('nombre;cantidad;total');
  expect(csv.body).toContain('Capuchino;1;2.50');
  await ctx.app.inject({ method: 'POST', url: '/api/jornadas/cerrar', payload: { efectivo_contado: 21.5 } });
  const cerrado = (await ctx.app.inject({ method: 'GET', url: `/api/jornadas/${j.id}/reporte` })).json();
  expect(cerrado.cierre.efectivo_esperado).toBe(21.5);
  expect(cerrado.cierre.diferencia_efectivo).toBe(0);
});
```

- [ ] **Step 2: Ejecutar** → FAIL.

- [ ] **Step 3: Escribir reportes.ts**

`src/servidor/modulos/reportes.ts`:
```ts
import { and, asc, eq, gte, inArray, lte, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { jornada, pedido, cuenta, pedidoItem, producto, egreso, encargo, cliente } from '../db/schema';
import { NoEncontrado } from '../errores';
import { resumenJornada } from './jornada';
import { redondear } from './totales';

export async function reporteJornada(db: Db, jornadaId: string) {
  const [j] = await db.select().from(jornada).where(eq(jornada.id, jornadaId));
  if (!j) throw new NoEncontrado('La jornada no existe');
  const n = (v: string | null) => Number(v ?? 0);
  const cierre = j.cerrada_en ? {
    total_ventas: n(j.total_ventas), total_efectivo: n(j.total_efectivo), total_tarjeta: n(j.total_tarjeta), total_transferencia: n(j.total_transferencia),
    total_descuentos: n(j.total_descuentos), total_propinas: n(j.total_propinas), total_egresos: n(j.total_egresos),
    total_abonos_recibidos: n(j.total_abonos_recibidos), total_abonos_devueltos: n(j.total_abonos_devueltos),
    efectivo_esperado: n(j.efectivo_esperado), efectivo_contado: n(j.efectivo_contado), diferencia_efectivo: n(j.diferencia_efectivo), fondo_inicial: n(j.fondo_inicial),
  } : { ...(await resumenJornada(db, j)), fondo_inicial: n(j.fondo_inicial), efectivo_contado: null, diferencia_efectivo: null };

  const pedidos = await db.select({ id: pedido.id }).from(pedido).where(eq(pedido.jornada_id, j.id));
  const pids = pedidos.map((p) => p.id);
  const cuentas = pids.length ? await db.select({ id: cuenta.id }).from(cuenta).where(and(inArray(cuenta.pedido_id, pids), eq(cuenta.estado, 'cobrada'))) : [];
  const cids = cuentas.map((c) => c.id);
  const items = cids.length ? await db.select().from(pedidoItem).where(and(inArray(pedidoItem.cuenta_id, cids), eq(pedidoItem.anulado, false))) : [];
  const porProducto = new Map<string, { nombre: string; cantidad: number; total: number }>();
  for (const i of items) {
    const clave = i.es_libre ? '__libres' : i.producto_id ?? i.nombre_producto;
    const nombre = i.es_libre ? 'Ítems libres' : i.nombre_producto;
    const acc = porProducto.get(clave) ?? { nombre, cantidad: 0, total: 0 };
    acc.cantidad += i.cantidad; acc.total = redondear(acc.total + Number(i.precio_unitario) * i.cantidad);
    porProducto.set(clave, acc);
  }
  const ventas_por_producto = [...porProducto.values()].sort((a, b) => b.total - a.total);
  const stock_restante = (await db.select({ nombre: producto.nombre, stock_actual: producto.stock_actual }).from(producto).where(and(eq(producto.controla_stock, true), eq(producto.activo, true))).orderBy(asc(producto.nombre)));
  const egresos = await db.select().from(egreso).where(eq(egreso.jornada_id, j.id)).orderBy(asc(egreso.creado_en));
  const fin = j.cerrada_en ?? new Date();
  const encs = await db.select({ e: encargo, cliente_nombre: cliente.nombre }).from(encargo).innerJoin(cliente, eq(cliente.id, encargo.cliente_id))
    .where(or(eq(encargo.jornada_creacion_id, j.id), and(gte(encargo.entregado_en, j.abierta_en), lte(encargo.entregado_en, fin)), and(gte(encargo.cancelado_en, j.abierta_en), lte(encargo.cancelado_en, fin))));
  const encargos = encs.map((x) => ({ numero: x.e.numero, cliente_nombre: x.cliente_nombre, estado: x.e.estado, fecha_entrega: x.e.fecha_entrega, entregado_en: x.e.entregado_en, cancelado_en: x.e.cancelado_en, abono_retenido: x.e.abono_retenido }));
  return { jornada: j, cierre, ventas_por_producto, stock_restante, egresos, encargos };
}

export function aCsv(filas: Record<string, unknown>[]): string {
  if (!filas.length) return '﻿';
  const cols = Object.keys(filas[0]);
  const celda = (v: unknown) => { const s = v instanceof Date ? v.toISOString() : typeof v === 'number' ? v.toFixed(2) : String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [cols.join(';'), ...filas.map((f) => cols.map((c) => celda(f[c])).join(';'))].join('\r\n');
}

export function rutasReportes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/jornadas/:id/reporte', async (req) => reporteJornada(app.db, req.params.id));
  app.get<{ Params: { id: string }; Querystring: { seccion?: string } }>('/api/jornadas/:id/reporte.csv', async (req, reply) => {
    const r = await reporteJornada(app.db, req.params.id);
    const s = req.query.seccion ?? 'ventas';
    const filas: Record<string, unknown>[] = s === 'cierre' ? [r.cierre as any] : s === 'stock' ? r.stock_restante : s === 'egresos' ? r.egresos.map((e) => ({ hora: e.creado_en, tipo: e.tipo, motivo: e.motivo, monto: Number(e.monto) })) : s === 'encargos' ? r.encargos : r.ventas_por_producto.map((v) => ({ nombre: v.nombre, cantidad: v.cantidad, total: v.total }));
    const fecha = new Date(r.jornada.abierta_en).toISOString().slice(0, 10);
    reply.type('text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${s}-${fecha}.csv"`);
    return aCsv(filas.map((f) => (s === 'ventas' ? { ...f, cantidad: String(f.cantidad) } : f)));
  });
}
```

Nota sobre `cantidad` en CSV: `aCsv` formatea números con 2 decimales; por eso `cantidad` se pasa como texto para que salga `1` y no `1.00`.

Registrar en `app.ts`: `rutasReportes(app);`.

- [ ] **Step 4: Ejecutar** → `npm test` → pasa.

- [ ] **Step 5: Escribir Reportes.tsx y Clientes.tsx; enlazar pestañas**

`src/web/admin/Reportes.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { dinero } from '../comun/dinero';

const ETIQUETAS: [string, string][] = [['fondo_inicial', 'Fondo inicial'], ['total_ventas', 'Ventas'], ['total_descuentos', 'Descuentos'], ['total_propinas', 'Propinas'], ['total_efectivo', 'Cobrado en efectivo'], ['total_tarjeta', 'Cobrado con tarjeta'], ['total_transferencia', 'Cobrado por transferencia'], ['total_egresos', 'Egresos'], ['total_abonos_recibidos', 'Abonos recibidos (caja de encargos)'], ['total_abonos_devueltos', 'Abonos devueltos'], ['efectivo_esperado', 'Efectivo esperado'], ['efectivo_contado', 'Efectivo contado'], ['diferencia_efectivo', 'Diferencia']];

export function Reportes({ simbolo }: { simbolo: string }) {
  const [jornadas, setJornadas] = useState<any[]>([]);
  const [id, setId] = useState<string>('');
  const [rep, setRep] = useState<any>(null);
  useEffect(() => { api.get('/api/jornadas').then((js) => { setJornadas(js); if (js[0]) setId(js[0].id); }); }, []);
  useEffect(() => { if (id) api.get(`/api/jornadas/${id}/reporte`).then(setRep); }, [id]);
  useEventos(['jornada', 'mesa'], () => { if (id) api.get(`/api/jornadas/${id}/reporte`).then(setRep); });
  const f = (d: string) => new Date(d).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' });
  const csv = (s: string) => <a href={`/api/jornadas/${id}/reporte.csv?seccion=${s}`} download><button style="min-height:32px;padding:2px 10px">CSV</button></a>;
  return (
    <div style="display:grid;gap:16px">
      <label>Jornada<select value={id} onChange={(e) => setId((e.target as HTMLSelectElement).value)}>{jornadas.map((j) => <option key={j.id} value={j.id}>{f(j.abierta_en)}{j.cerrada_en ? ` → ${f(j.cerrada_en)}` : ' (abierta)'}</option>)}</select></label>
      {rep && (<>
        <section class="tarjeta"><div class="fila" style="align-items:center"><h3 style="margin:0">Cierre de caja</h3>{csv('cierre')}</div>
          <table><tbody>{ETIQUETAS.map(([k, t]) => rep.cierre[k] !== null && rep.cierre[k] !== undefined && <tr key={k}><td>{t}</td><td style="text-align:right">{dinero(rep.cierre[k], simbolo)}</td></tr>)}</tbody></table></section>
        <section class="tarjeta"><div class="fila" style="align-items:center"><h3 style="margin:0">Ventas por producto</h3>{csv('ventas')}</div>
          <table><thead><tr><th>Producto</th><th style="text-align:right">Cantidad</th><th style="text-align:right">Total</th></tr></thead><tbody>{rep.ventas_por_producto.map((v: any) => <tr key={v.nombre}><td>{v.nombre}</td><td style="text-align:right">{v.cantidad}</td><td style="text-align:right">{dinero(v.total, simbolo)}</td></tr>)}</tbody></table></section>
        <section class="tarjeta"><div class="fila" style="align-items:center"><h3 style="margin:0">Stock restante</h3>{csv('stock')}</div>
          <table><tbody>{rep.stock_restante.map((s: any) => <tr key={s.nombre}><td>{s.nombre}</td><td style="text-align:right">{s.stock_actual}</td></tr>)}</tbody></table></section>
        <section class="tarjeta"><div class="fila" style="align-items:center"><h3 style="margin:0">Egresos</h3>{csv('egresos')}</div>
          <table><tbody>{rep.egresos.map((e: any) => <tr key={e.id}><td>{f(e.creado_en)}</td><td>{e.tipo}</td><td>{e.motivo}</td><td style="text-align:right">{dinero(e.monto, simbolo)}</td></tr>)}</tbody></table></section>
        <section class="tarjeta"><div class="fila" style="align-items:center"><h3 style="margin:0">Encargos</h3>{csv('encargos')}</div>
          <table><tbody>{rep.encargos.map((e: any) => <tr key={e.numero}><td>#{e.numero}</td><td>{e.cliente_nombre}</td><td>{e.fecha_entrega}</td><td><span class="pill">{e.estado}{e.abono_retenido ? ' (abono retenido)' : ''}</span></td></tr>)}</tbody></table></section>
      </>)}
    </div>
  );
}
```

`src/web/admin/Clientes.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { Aviso } from '../componentes/Aviso';

const CAMPOS = [['nombre', 'Nombre'], ['identificacion', 'Cédula / RUC'], ['correo', 'Correo'], ['telefono', 'Teléfono'], ['direccion', 'Dirección']] as const;

export function Clientes() {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const buscar = () => api.get(`/api/clientes?q=${encodeURIComponent(q)}`).then(setLista);
  useEffect(() => { buscar(); }, [q]);
  const guardar = async (e: Event) => {
    e.preventDefault(); setError(null);
    const cuerpo: any = { ...edit };
    if (cuerpo.identificacion && !cuerpo.tipo_identificacion) cuerpo.tipo_identificacion = cuerpo.identificacion.length === 13 ? 'ruc' : 'cedula';
    try { if (edit.id) await api.patch(`/api/clientes/${edit.id}`, cuerpo); else await api.post('/api/clientes', cuerpo); setEdit(null); buscar(); } catch (err: any) { setError(err.message); }
  };
  return (
    <div style="display:grid;gap:12px">
      <div class="fila"><input placeholder="Buscar por nombre o identificación" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} /><button class="primario" onClick={() => setEdit({ nombre: '', identificacion: '', tipo_identificacion: '', correo: '', telefono: '', direccion: '' })} style="flex:0 0 auto">+ Nuevo</button></div>
      {edit && <form onSubmit={guardar} class="tarjeta" style="display:grid;gap:8px">
        {CAMPOS.map(([k, t]) => <label key={k}>{t}<input value={edit[k] ?? ''} onInput={(e) => setEdit({ ...edit, [k]: (e.target as HTMLInputElement).value })} /></label>)}
        <label>Tipo de identificación<select value={edit.tipo_identificacion ?? ''} onChange={(e) => setEdit({ ...edit, tipo_identificacion: (e.target as HTMLSelectElement).value })}><option value="">Automático</option><option value="cedula">Cédula</option><option value="ruc">RUC</option><option value="pasaporte">Pasaporte</option><option value="consumidor_final">Consumidor final</option></select></label>
        <Aviso tipo="error" texto={error} />
        <div class="fila"><button class="primario" type="submit" style="flex:0 0 auto">Guardar</button><button type="button" onClick={() => setEdit(null)} style="flex:0 0 auto">Cancelar</button></div></form>}
      <table><thead><tr><th>Nombre</th><th>Identificación</th><th>Correo</th><th>Teléfono</th><th></th></tr></thead>
        <tbody>{lista.map((c) => <tr key={c.id}><td>{c.nombre}</td><td>{c.identificacion ?? ''}</td><td>{c.correo ?? ''}</td><td>{c.telefono ?? ''}</td><td><button onClick={() => setEdit(c)}>Editar</button></td></tr>)}</tbody></table>
    </div>
  );
}
```

En `src/web/admin/AppAdmin.tsx`: agregar a `PESTANAS` `['clientes', 'Clientes']` y `['reportes', 'Reportes']`, ampliar el tipo del estado, e insertar `{pestana === 'clientes' && <Clientes />}` y `{pestana === 'reportes' && <Reportes simbolo={estado?.configuracion?.simbolo_moneda ?? '$'} />}`.

- [ ] **Step 6: Verificar** → `npm run typecheck && npm run build && npm test`. Manual: admin, Reportes: elegir la jornada abierta, ver ventas; descargar CSV y abrirlo en Excel o Numbers (separador `;`).

- [ ] **Step 7: Commit y push**

```bash
git add -A && git commit -m "Reportes por jornada con CSV y gestión de clientes en admin" && git push origin main
```

---

### Task 6: Datos de ejemplo
**Modelo ejecutor:** `claude-sonnet-5`. **Motivo:** el plan trae el código, las pruebas y el comando de verificación completos; la tarea es ejecutarlos fielmente.
**Skill del ejecutor:** `superpowers:test-driven-development`. **Al terminar:** `superpowers:verification-before-completion`.
**Revisor:** `claude-fable-5-1` con `superpowers:requesting-code-review`.


**Files:**
- Create: `src/servidor/modulos/ejemplo.ts`, `tests/ejemplo.test.ts`
- Modify: `src/servidor/app.ts`, `src/web/admin/AppAdmin.tsx` (pestaña "Datos de ejemplo")

**Interfaces:**
- Produces: `cargarDatosEjemplo(db)` → crea 3 categorías (Cafés, Sandwiches, Postres), 8 productos con nombre que empieza por `[Ejemplo] `, 2 meseros `[Ejemplo] Carlos` y `[Ejemplo] Ana`; idempotente (si ya existen, no duplica). `borrarDatosEjemplo(db)` → 409 `Hay caja abierta; cierra la caja antes de borrar los datos de ejemplo` si hay jornada abierta; desactiva (no borra) productos, categorías y meseros `[Ejemplo]` que tengan pedidos asociados, y borra los que no. Rutas: `POST /api/admin/datos-ejemplo`, `POST /api/admin/datos-ejemplo/borrar`. Emiten `catalogo` y `config`.

- [ ] **Step 1: Escribir la prueba**

`tests/ejemplo.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('cargar es idempotente y borrar limpia', async () => {
  const a = await ctx.app.inject({ method: 'POST', url: '/api/admin/datos-ejemplo' });
  expect(a.statusCode).toBe(200);
  const b = await ctx.app.inject({ method: 'POST', url: '/api/admin/datos-ejemplo' });
  expect(b.statusCode).toBe(200);
  const cat = (await ctx.app.inject({ method: 'GET', url: '/api/catalogo' })).json();
  expect(cat.categorias).toHaveLength(3);
  expect(cat.categorias.flatMap((c: any) => c.productos)).toHaveLength(8);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/estado' })).json().meseros).toHaveLength(2);
  await ctx.app.inject({ method: 'POST', url: '/api/jornadas/abrir', payload: { fondo_inicial: 0 } });
  const conCaja = await ctx.app.inject({ method: 'POST', url: '/api/admin/datos-ejemplo/borrar' });
  expect(conCaja.statusCode).toBe(409);
  await ctx.app.inject({ method: 'POST', url: '/api/jornadas/cerrar', payload: { efectivo_contado: 0 } });
  const borrar = await ctx.app.inject({ method: 'POST', url: '/api/admin/datos-ejemplo/borrar' });
  expect(borrar.statusCode).toBe(200);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/catalogo' })).json().categorias).toHaveLength(0);
});
```

- [ ] **Step 2: Ejecutar** → FAIL.

- [ ] **Step 3: Escribir ejemplo.ts**

`src/servidor/modulos/ejemplo.ts`:
```ts
import { eq, inArray, like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/conexion';
import { categoria, producto, mesero, pedidoItem, pedido, encargoItem } from '../db/schema';
import { ErrorNegocio } from '../errores';
import { obtenerJornadaAbierta } from './jornada';

const P = '[Ejemplo] ';
const CATEGORIAS: [string, [string, number, number | null][]][] = [
  ['Cafés', [['Capuchino', 2.5, null], ['Americano', 1.75, null], ['Mocaccino', 3, null]]],
  ['Sandwiches', [['Sándwich de pollo', 4.5, 12], ['Choripán', 2, 15], ['Bolón mixto', 3, 8]]],
  ['Postres', [['Tres leches', 2.75, 6], ['Brownie', 2, 10]]],
];

export async function cargarDatosEjemplo(db: Db) {
  const existentes = await db.select().from(categoria).where(like(categoria.nombre, `${P}%`));
  let orden = 1;
  for (const [nombreCat, productos] of CATEGORIAS) {
    let cat = existentes.find((c) => c.nombre === P + nombreCat);
    if (!cat) [cat] = await db.insert(categoria).values({ nombre: P + nombreCat, orden: orden }).returning();
    orden++;
    const ya = await db.select({ nombre: producto.nombre }).from(producto).where(eq(producto.categoria_id, cat.id));
    for (const [nombre, precio, stock] of productos) {
      if (ya.some((p) => p.nombre === P + nombre)) continue;
      await db.insert(producto).values({ categoria_id: cat.id, nombre: P + nombre, precio: precio.toFixed(2), controla_stock: stock !== null, stock_actual: stock });
    }
  }
  const meseros = await db.select().from(mesero).where(like(mesero.nombre, `${P}%`));
  for (const n of ['Carlos', 'Ana']) if (!meseros.some((m) => m.nombre === P + n)) await db.insert(mesero).values({ nombre: P + n });
  return { cargado: true };
}

export async function borrarDatosEjemplo(db: Db) {
  if (await obtenerJornadaAbierta(db)) throw new ErrorNegocio('Hay caja abierta; cierra la caja antes de borrar los datos de ejemplo');
  const prods = await db.select().from(producto).where(like(producto.nombre, `${P}%`));
  for (const p of prods) {
    const [usado] = await db.select({ id: pedidoItem.id }).from(pedidoItem).where(eq(pedidoItem.producto_id, p.id)).limit(1);
    const [enEncargo] = await db.select({ id: encargoItem.id }).from(encargoItem).where(eq(encargoItem.producto_id, p.id)).limit(1);
    if (usado || enEncargo) await db.update(producto).set({ activo: false, actualizado_en: new Date() }).where(eq(producto.id, p.id));
    else await db.delete(producto).where(eq(producto.id, p.id));
  }
  const cats = await db.select().from(categoria).where(like(categoria.nombre, `${P}%`));
  for (const c of cats) {
    const [queda] = await db.select({ id: producto.id }).from(producto).where(eq(producto.categoria_id, c.id)).limit(1);
    if (queda) await db.update(categoria).set({ activa: false, actualizado_en: new Date() }).where(eq(categoria.id, c.id));
    else await db.delete(categoria).where(eq(categoria.id, c.id));
  }
  const meseros = await db.select().from(mesero).where(like(mesero.nombre, `${P}%`));
  for (const m of meseros) {
    const [usado] = await db.select({ id: pedido.id }).from(pedido).where(eq(pedido.mesero_id, m.id)).limit(1);
    if (usado) await db.update(mesero).set({ activo: false, actualizado_en: new Date() }).where(eq(mesero.id, m.id));
    else await db.delete(mesero).where(eq(mesero.id, m.id));
  }
  return { borrado: true };
}

export function rutasEjemplo(app: FastifyInstance) {
  app.post('/api/admin/datos-ejemplo', async () => { const r = await cargarDatosEjemplo(app.db); app.bus.emitir('catalogo'); app.bus.emitir('config'); return r; });
  app.post('/api/admin/datos-ejemplo/borrar', async () => { const r = await borrarDatosEjemplo(app.db); app.bus.emitir('catalogo'); app.bus.emitir('config'); return r; });
}
```

Registrar en `app.ts`: `rutasEjemplo(app);`.

- [ ] **Step 4: Pestaña en admin**: en `AppAdmin.tsx` agregar pestaña `['ejemplo', 'Datos de ejemplo']` que muestra dos botones: "Cargar menú de ejemplo" (`api.post('/api/admin/datos-ejemplo')`) y "Borrar datos de ejemplo" (con `confirm`), mostrando el error del servidor si lo hay con `Aviso`.

- [ ] **Step 5: Ejecutar** → `npm run typecheck && npm run build && npm test` → todo pasa.

- [ ] **Step 6: Commit y push**

```bash
git add -A && git commit -m "Datos de ejemplo cargables y borrables desde admin" && git push origin main
```

---

## Cierre del plan 3

**Modelo:** `claude-sonnet-5`. **Motivo:** son comandos y actualizaciones de documentos ya definidos. **Skill:** `superpowers:verification-before-completion`. **Revisor:** `claude-fable-5-1` confirma que ESTADO.md y BITACORA.md reflejan la salida real.


- [ ] `npm run typecheck && npm run build && npm test`; pegar salida resumida en `docs/BITACORA.md`.
- [ ] Actualizar `docs/ESTADO.md`: "Plan 3 terminado"; siguiente paso: ejecutar plan 4.
- [ ] `git add -A && git commit -m "Cierre del plan 3: complementos listos" && git push origin main`.

## Self-review

- **Cobertura:** 4.4 encargos → Task 3 y 4; reglas 6 y 13 → Task 1; regla 12 (abonos en cierre) ya en plan 2 Task 2 y verificada en Task 3; reglas 16 a 19 → Task 3; 7.2 → Task 1; 7.3 egresos y encargos → Tasks 2 y 4; 7.4 clientes, reportes, datos de ejemplo → Tasks 5 y 6; 7.5 constancia → Task 3. Quedan para plan 4: respaldos, restaurar, descargar log, lanzador, empaquetado, E2E.
- **Consistencia:** `listarEncargos` devuelve `{ encargos, saldo_caja_encargos }`; `abonar` devuelve `{ abono, repetido, encargo }`; `entregar`/`cancelar` devuelven `{ encargo, pedido_id }`; `resumenJornada` expone `saldo_caja_encargos` (definido en plan 2 Task 2) usado en cierre y reportes.
- **Sin placeholders.**
