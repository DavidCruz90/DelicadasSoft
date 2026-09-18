import { test, expect, beforeAll, afterAll, vi, type Mock } from 'vitest';
import { randomInt } from 'node:crypto';
import { crearAppDePrueba } from './ayuda/app';
import { IP_REMOTA, autorizarDispositivoDePrueba } from './ayuda/acceso';
import { dispositivo, sesion, usuario } from '../src/servidor/db/schema';
import { registrarFalloDeDispositivo, reiniciarFallosDeDispositivo, resumirNavegador } from '../src/servidor/modulos/dispositivos';
import { generarToken, huellaToken } from '../src/servidor/seguridad/tokens';

// randomInt queda envuelto en un espía que por omisión delega en el real: solo
// la prueba del choque de códigos le fija un valor una vez. randomBytes,
// scrypt y el resto de node:crypto siguen siendo los reales.
vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:crypto')>();
  return { ...real, randomInt: vi.fn(real.randomInt) };
});

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
  expect(linea).toContain('Path=/');
  expect(linea).not.toContain('Secure');
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

test('si el código de 4 dígitos choca con una solicitud pendiente, solicitar reintenta con otro (el 23505 llega envuelto por Drizzle)', async () => {
  await ctx.db.insert(dispositivo).values({ codigo: '0042', token_hash: huellaToken(generarToken()), descripcion: 'ocupa el 0042' });
  const espia = randomInt as unknown as Mock;
  const llamadasAntes = espia.mock.calls.length;
  espia.mockReturnValueOnce(42);
  const r = await ctx.app.inject({ method: 'POST', url: '/api/dispositivos/solicitar', remoteAddress: IP_REMOTA });
  expect(r.statusCode).toBe(201);
  expect(r.json().codigo).toMatch(/^\d{4}$/);
  expect(r.json().codigo).not.toBe('0042');
  // Prueba de que el choque ocurrió de verdad: el primer código generado fue
  // el 0042 (ya ocupado) y hubo al menos un segundo intento.
  expect(espia.mock.results[llamadasAntes].value).toBe(42);
  expect(espia.mock.calls.length).toBeGreaterThanOrEqual(llamadasAntes + 2);
  const pendientes = await ctx.sql`SELECT codigo FROM dispositivo WHERE estado = 'pendiente' AND codigo IN ('0042', ${r.json().codigo})`;
  expect(pendientes).toHaveLength(2);
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
  const nombreVacio = await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${id}/autorizar`, payload: { nombre: '   ' } });
  expect(nombreVacio.statusCode).toBe(400);
  expect(nombreVacio.json().error).toBe('Ponle un nombre al dispositivo antes de autorizarlo');
  const nombreMalo = await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${id}/autorizar`, payload: { nombre: 7 } });
  expect(nombreMalo.statusCode).toBe(400);
  expect(nombreMalo.json().error).toBe('El nombre del dispositivo debe ser texto');
  const cuerpoMalo = await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${id}/autorizar`, headers: { 'content-type': 'application/json' }, payload: '"texto"' });
  expect(cuerpoMalo.statusCode).toBe(400);
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
  const localIpv4EnIpv6 = await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: '::ffff:127.0.0.1' });
  expect(localIpv4EnIpv6.statusCode).toBe(200);
  // x-forwarded-for no sirve para fingir ser local.
  const fingido = await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: IP_REMOTA, headers: { 'x-forwarded-for': '127.0.0.1' } });
  expect(fingido.statusCode).toBe(403);
  // Otra dirección de la misma máquina tampoco es "local": solo la de bucle.
  const otraLocal = await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: '127.0.0.2' });
  expect(otraLocal.statusCode).toBe(403);
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
  expect(cuerpo.pendientes.length).toBeGreaterThan(0);
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
  expect('token_hash' in r.json()).toBe(false);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/estado', remoteAddress: IP_REMOTA, headers: { cookie } })).statusCode).toBe(403);
  const [cerrada] = await ctx.sql`SELECT cerrada_en FROM sesion WHERE id = ${s.id}`;
  expect(cerrada.cerrada_en).not.toBeNull();
  // El aparato revocado ve su estado con su propia cookie (para mostrar el aviso).
  const estado = await ctx.app.inject({ method: 'GET', url: `/api/dispositivos/estado?espera_id=${d.id}`, remoteAddress: IP_REMOTA, headers: { cookie } });
  expect(estado.statusCode).toBe(200);
  expect(estado.json()).toEqual({ estado: 'revocado' });

  const otraVez = await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${d.id}/revocar` });
  expect(otraVez.statusCode).toBe(200);
  const lista = (await ctx.app.inject({ method: 'GET', url: '/api/admin/dispositivos' })).json();
  expect(lista.autorizados.some((x: { id: string }) => x.id === d.id)).toBe(false);
  const noExiste = await ctx.app.inject({ method: 'POST', url: '/api/admin/dispositivos/00000000-0000-0000-0000-000000000000/revocar' });
  expect(noExiste.statusCode).toBe(404);
  const idMalo = await ctx.app.inject({ method: 'POST', url: '/api/admin/dispositivos/no-es-uuid/revocar' });
  expect(idMalo.statusCode).toBe(400);
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

test('una solicitud caducada que nadie ha limpiado todavía tampoco se puede autorizar', async () => {
  // Se inserta directo (sin pasar por solicitar, que limpia) para que la fila
  // caducada siga en la tabla cuando llega el intento de autorizar.
  const [d] = await ctx.db.insert(dispositivo).values({
    codigo: '9998', token_hash: huellaToken(generarToken()), descripcion: 'vieja', solicitado_en: new Date(Date.now() - 11 * 60000),
  }).returning();
  const r = await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${d.id}/autorizar`, payload: { nombre: 'Tarde' } });
  expect(r.statusCode).toBe(409);
  const [fila] = await ctx.sql`SELECT estado FROM dispositivo WHERE id = ${d.id}`;
  expect(fila.estado).toBe('pendiente');
  await ctx.sql`DELETE FROM dispositivo WHERE id = ${d.id}`;
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
