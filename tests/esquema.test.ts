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
