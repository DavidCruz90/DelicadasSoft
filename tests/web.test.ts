import { test, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { crearAppDePrueba } from './ayuda/app';

let ctx: Awaited<ReturnType<typeof crearAppDePrueba>>;
beforeAll(async () => { ctx = await crearAppDePrueba(); });
afterAll(async () => { await ctx.app.close(); await ctx.sql.end(); });

test('dist/web/index.html existe (ejecutar npm run build antes)', () => {
  expect(existsSync('dist/web/index.html')).toBe(true);
});

for (const ruta of ['/', '/admin', '/admin/', '/mesero', '/caja', '/cocina']) {
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
