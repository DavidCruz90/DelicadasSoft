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
