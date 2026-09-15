import { test, expect } from 'vitest';
import postgres from 'postgres';

test('la base de pruebas responde', async () => {
  const sql = postgres(process.env.DATABASE_URL_TEST ?? 'postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria_test');
  const [fila] = await sql`SELECT 1 AS uno`;
  await sql.end();
  expect(fila.uno).toBe(1);
});
