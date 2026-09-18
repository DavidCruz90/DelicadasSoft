import { test, expect, beforeAll, afterAll } from 'vitest';
import { crearAppDePrueba } from './ayuda/app';
import { IP_REMOTA, abrirSesionDePrueba, autorizarDispositivoDePrueba, crearUsuarioDePrueba } from './ayuda/acceso';
import { eq } from 'drizzle-orm';
import { usuario } from '../src/servidor/db/schema';
import { cerrarSesionesDeRol, reiniciarBloqueoLocal } from '../src/servidor/modulos/sesiones';
import { huellaToken } from '../src/servidor/seguridad/tokens';
import { cifrarPin } from '../src/servidor/seguridad/pin';

// Ni el hash ni un campo "pin" en ninguna respuesta (regla 24). tiene_pin y
// propina_sugerida_pct contienen "pin" y son legítimos: se mira la forma.
function sinDatosDelPin(cuerpo: string, contexto = '') {
  expect(cuerpo, contexto).not.toContain('pin_hash');
  expect(cuerpo, contexto).not.toMatch(/"pin"\s*:/);
}

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
  // Un inactivo CON PIN y un activo SIN PIN: son los dos que la lista para
  // entrar tiene que excluir (cobertura que se perdió en la Task 1 al borrar
  // la prueba "un mesero inactivo no aparece").
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
  expect(linea).toContain('Path=/; HttpOnly; SameSite=Strict');
  expect(linea).not.toContain('Secure');
  const cookie = linea!.split(';')[0];
  expect(cookie.slice('sesion='.length)).toMatch(/^[0-9a-f]{64}$/);
  return cookie;
}
const conSesion = (cookieSesion: string) => ({ remoteAddress: IP_REMOTA, headers: { cookie: `${aparato.cookie}; ${cookieSesion}` } });

test('la lista para entrar trae solo activos con PIN, sin nada del PIN, y exige dispositivo pero no sesión', async () => {
  // Los dos excluidos existen de verdad con el estado que se quiere excluir.
  const [inactivo] = await ctx.sql`SELECT activo, pin_hash FROM usuario WHERE nombre = 'Inactivo'`;
  expect(inactivo).toMatchObject({ activo: false });
  expect(inactivo.pin_hash).not.toBeNull();
  const [sinPin] = await ctx.sql`SELECT activo, pin_hash FROM usuario WHERE nombre = 'Sin PIN'`;
  expect(sinPin).toEqual({ activo: true, pin_hash: null });

  const r = await ctx.app.inject({ method: 'GET', url: '/api/sesion/usuarios', ...desdeAparato() });
  expect(r.statusCode).toBe(200);
  const nombres = r.json().map((u: { nombre: string }) => u.nombre);
  expect(nombres).toEqual(['Admin de prueba', 'Ana', 'Beto', 'Dueño']);
  expect(nombres).not.toContain('Inactivo');
  expect(nombres).not.toContain('Sin PIN');
  for (const u of r.json()) expect(Object.keys(u).sort()).toEqual(['id', 'nombre', 'rol']);
  sinDatosDelPin(r.body);
  const sinAparato = await ctx.app.inject({ method: 'GET', url: '/api/sesion/usuarios', remoteAddress: IP_REMOTA, headers: { cookie: '' } });
  expect(sinAparato.statusCode).toBe(403);
});

test('entrar con PIN correcto abre sesión con expiración según el rol; el token va solo en la cookie y en la base queda su huella', async () => {
  const m = await entrar(mesero.id, '1111');
  expect(m.statusCode).toBe(201);
  expect(Object.keys(m.json()).sort()).toEqual(['expira_en', 'usuario']);
  expect(m.json().usuario).toMatchObject({ id: mesero.id, nombre: 'Ana', rol: 'mesero' });
  sinDatosDelPin(m.body);
  expect(m.json().expira_en).toBeNull();
  const cookie = cookieSesionDe(m);
  // El token no se guarda en claro: en la base está su sha256.
  const token = cookie.slice('sesion='.length);
  const filas = await ctx.sql`SELECT token_hash, dispositivo_id, expira_en FROM sesion WHERE token_hash = ${huellaToken(token)}`;
  expect(filas).toHaveLength(1);
  expect(filas[0].dispositivo_id).toBe(aparato.dispositivo.id);
  expect(filas[0].expira_en).toBeNull();
  expect(await ctx.sql`SELECT id FROM sesion WHERE token_hash = ${token}`).toHaveLength(0);

  const c = await entrar(caja.id, '2222');
  expect(c.statusCode).toBe(201);
  const expiraCaja = new Date(c.json().expira_en).getTime() - Date.now();
  expect(expiraCaja).toBeGreaterThan(29 * 60000);
  expect(expiraCaja).toBeLessThanOrEqual(30 * 60000);

  const a = await entrar(adminRemoto.id, '3333');
  expect(a.statusCode).toBe(201);
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
  // Los cuatro cuentan como intento fallido del aparato (el inexistente sin usuario).
  const [d] = await ctx.sql`SELECT intentos_fallidos FROM dispositivo WHERE id = ${aparato.dispositivo.id}`;
  expect(d.intentos_fallidos).toBe(4);
  const intentos = await ctx.sql`SELECT usuario_id FROM intento_fallido WHERE dispositivo_id = ${aparato.dispositivo.id}`;
  expect(intentos).toHaveLength(4);
  expect(intentos.filter((i) => i.usuario_id === null)).toHaveLength(1);
  await ctx.sql`UPDATE dispositivo SET intentos_fallidos = 0 WHERE id = ${aparato.dispositivo.id}`;
});

test('validación de tipos: usuario_id mal formado, pin como número, cuerpo que no es objeto y sin cuerpo dan 400', async () => {
  expect((await entrar('no-es-uuid', '1111')).statusCode).toBe(400);
  expect((await entrar(mesero.id, 1111)).statusCode).toBe(400);
  expect((await entrar(mesero.id, '111')).statusCode).toBe(400);
  expect((await entrar(undefined, undefined)).statusCode).toBe(400);
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
  sinDatosDelPin(yo.body);
  expect(yo.json().expira_en).not.toBeNull();

  const sin = await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...desdeAparato() });
  expect(sin.statusCode).toBe(401);
  expect(sin.json()).toEqual({ error: 'Tu sesión no está iniciada o venció; escribe tu PIN', codigo: 'sin_sesion' });

  // Una cookie de sesión inventada tampoco vale.
  const inventada = await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(`sesion=${'f'.repeat(64)}`) });
  expect(inventada.statusCode).toBe(401);

  // La misma cookie de sesión desde otro aparato autorizado: no vale.
  const otro = await autorizarDispositivoDePrueba(ctx.db, 'Otro celular');
  const robada = await ctx.app.inject({ method: 'GET', url: '/api/sesion', remoteAddress: IP_REMOTA, headers: { cookie: `${otro.cookie}; ${cookie}` } });
  expect(robada.statusCode).toBe(401);
  expect(robada.json().codigo).toBe('sin_sesion');
  // Ni desde la PC de caja.
  const desdePc = await ctx.app.inject({ method: 'GET', url: '/api/sesion', headers: { cookie } });
  expect(desdePc.statusCode).toBe(401);
  // Y una sesión abierta en la PC de caja no vale desde un celular, ni
  // siquiera con la cookie del aparato en el que se abrió otra cosa.
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
  // Una petición rechazada por vencida no la revive.
  const [sigueVencida] = await ctx.sql`SELECT expira_en < now() AS vencida FROM sesion WHERE token_hash = ${huellaDe(cookieCaja)}`;
  expect(sigueVencida.vencida).toBe(true);

  const a = await entrar(adminRemoto.id, '3333');
  const cookieAdmin = cookieSesionDe(a);
  await ctx.sql`UPDATE sesion SET expira_en = now() + interval '1 minute', ultimo_uso_en = now() - interval '14 minutes' WHERE token_hash = ${huellaDe(cookieAdmin)}`;
  const renovada = await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookieAdmin) });
  expect(renovada.statusCode).toBe(200);
  const restante = new Date(renovada.json().expira_en).getTime() - Date.now();
  expect(restante).toBeGreaterThan(14 * 60000);
  expect(restante).toBeLessThanOrEqual(15 * 60000);
  const [fila] = await ctx.sql`SELECT ultimo_uso_en > now() - interval '5 seconds' AS reciente FROM sesion WHERE token_hash = ${huellaDe(cookieAdmin)}`;
  expect(fila.reciente).toBe(true);

  const m = await entrar(mesero.id, '1111');
  const cookieMesero = cookieSesionDe(m);
  await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookieMesero) });
  const [filaMesero] = await ctx.sql`SELECT expira_en FROM sesion WHERE token_hash = ${huellaDe(cookieMesero)}`;
  expect(filaMesero.expira_en).toBeNull();
});

test('desactivar a un usuario cierra sus sesiones al instante y reactivarlo no las revive; las de otro usuario siguen vivas', async () => {
  const u = await crearUsuarioDePrueba(ctx.db, 'Temporal', 'mesero', '5555');
  const otro = await crearUsuarioDePrueba(ctx.db, 'Otro temporal', 'mesero', '6666');
  const cookie = cookieSesionDe(await entrar(u.id, '5555'));
  const cookieOtro = cookieSesionDe(await entrar(otro.id, '6666'));
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookie) })).statusCode).toBe(200);
  // Renombrar no cierra la sesión: solo pasar de activo a inactivo.
  expect((await ctx.app.inject({ method: 'PATCH', url: `/api/admin/usuarios/${u.id}`, payload: { nombre: 'Temporal R.' } })).statusCode).toBe(200);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookie) })).statusCode).toBe(200);
  const off = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/usuarios/${u.id}`, payload: { activo: false } });
  expect(off.statusCode).toBe(200);
  const negada = await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookie) });
  expect(negada.statusCode).toBe(401);
  expect(negada.json().codigo).toBe('sin_sesion');
  // La sesión queda cerrada en la base, no solo negada por el usuario inactivo:
  // una sesión de mesero no vence nunca y quedaría latente hasta la reactivación.
  const [fila] = await ctx.sql`SELECT cerrada_en FROM sesion WHERE token_hash = ${huellaDe(cookie)}`;
  expect(fila.cerrada_en).not.toBeNull();
  // Reactivar al usuario no revive la cookie vieja: hay que volver a escribir el PIN.
  const on = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/usuarios/${u.id}`, payload: { activo: true } });
  expect(on.statusCode).toBe(200);
  const revivida = await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookie) });
  expect(revivida.statusCode).toBe(401);
  expect(revivida.json().codigo).toBe('sin_sesion');
  expect((await entrar(u.id, '5555')).statusCode).toBe(201);
  // Las sesiones de otro usuario no se tocan.
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookieOtro) })).statusCode).toBe(200);
  const [filaOtro] = await ctx.sql`SELECT cerrada_en FROM sesion WHERE token_hash = ${huellaDe(cookieOtro)}`;
  expect(filaOtro.cerrada_en).toBeNull();
});

test('cambiar el rol de un usuario cierra sus sesiones (hay que volver a entrar con el plazo del rol nuevo); mandar el mismo rol no cierra nada', async () => {
  const u = await crearUsuarioDePrueba(ctx.db, 'Ascendido', 'mesero', '5656');
  const cookie = cookieSesionDe(await entrar(u.id, '5656'));
  // El mismo rol que ya tenía no es un cambio: la sesión sigue.
  expect((await ctx.app.inject({ method: 'PATCH', url: `/api/admin/usuarios/${u.id}`, payload: { rol: 'mesero' } })).statusCode).toBe(200);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookie) })).statusCode).toBe(200);
  // De mesero a caja: la sesión de mesero no vencía nunca, y la capa 3 leería
  // el rol nuevo pero expira_en seguiría con el plazo del rol viejo hasta la
  // siguiente petición manual. Cambiar de rol = volver a entrar.
  const ascenso = await ctx.app.inject({ method: 'PATCH', url: `/api/admin/usuarios/${u.id}`, payload: { rol: 'caja' } });
  expect(ascenso.statusCode).toBe(200);
  const negada = await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookie) });
  expect(negada.statusCode).toBe(401);
  expect(negada.json().codigo).toBe('sin_sesion');
  const [fila] = await ctx.sql`SELECT cerrada_en FROM sesion WHERE token_hash = ${huellaDe(cookie)}`;
  expect(fila.cerrada_en).not.toBeNull();
  // Al volver a entrar, la sesión nueva ya lleva el plazo de caja.
  const otraVez = await entrar(u.id, '5656');
  expect(otraVez.statusCode).toBe(201);
  expect(otraVez.json().expira_en).not.toBeNull();
});

// Carreras deterministas entre entrar con PIN y una acción que quita el
// acceso, con el mismo método que instalacion.test.ts: una transacción
// externa deja la acción sin confirmar, se lanza el POST sin esperarlo, se
// le da tiempo a llegar hasta la escritura de la sesión, y recién entonces
// se confirma. Antes del arreglo, entrar leía al usuario sin bloqueo, hacía
// scrypt y escribía la sesión fuera de toda transacción: la sesión quedaba
// viva después de que desactivar o cambiar el PIN ya habían cerrado todas.
test('carrera: desactivar mientras se verifica el PIN no deja sesión viva y no cuenta como intento', async () => {
  const u = await crearUsuarioDePrueba(ctx.db, 'Carrera off', 'mesero', '8888');
  let postPromise: Promise<{ statusCode: number; json: () => any }> | null = null;
  await ctx.sql.begin(async (tx) => {
    // Mismos bloqueos que editarUsuario: FOR UPDATE sobre la fila y luego el UPDATE.
    await tx`SELECT id FROM usuario WHERE id = ${u.id} FOR UPDATE`;
    await tx`UPDATE usuario SET activo = false WHERE id = ${u.id}`;
    postPromise = Promise.resolve(entrar(u.id, '8888'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await tx`UPDATE sesion SET cerrada_en = now() WHERE usuario_id = ${u.id} AND cerrada_en IS NULL`;
  });
  const r = await postPromise!;
  expect(r.statusCode).toBe(401);
  expect(r.json()).toEqual({ error: 'PIN incorrecto', codigo: 'pin_incorrecto' });
  expect(await ctx.sql`SELECT id FROM sesion WHERE usuario_id = ${u.id} AND cerrada_en IS NULL`).toHaveLength(0);
  // El PIN era correcto: no es un intento fallido del aparato.
  expect(await ctx.sql`SELECT id FROM intento_fallido WHERE usuario_id = ${u.id}`).toHaveLength(0);
  // Reactivarlo no revive nada: no hay sesión que revivir.
  await ctx.sql`UPDATE usuario SET activo = true WHERE id = ${u.id}`;
  expect(await ctx.sql`SELECT id FROM sesion WHERE usuario_id = ${u.id} AND cerrada_en IS NULL`).toHaveLength(0);
});

test('carrera: cambiar el PIN mientras se verifica el PIN viejo no deja sesión viva', async () => {
  const u = await crearUsuarioDePrueba(ctx.db, 'Carrera pin', 'mesero', '8888');
  const hashNuevo = await cifrarPin('9999');
  let postPromise: Promise<{ statusCode: number; json: () => any }> | null = null;
  await ctx.sql.begin(async (tx) => {
    // Mismas escrituras que cambiarPin: UPDATE normal (toma FOR NO KEY UPDATE,
    // que solo choca con FOR SHARE o más fuerte) y cierre de sesiones.
    await tx`UPDATE usuario SET pin_hash = ${hashNuevo} WHERE id = ${u.id}`;
    await tx`UPDATE sesion SET cerrada_en = now() WHERE usuario_id = ${u.id} AND cerrada_en IS NULL`;
    postPromise = Promise.resolve(entrar(u.id, '8888'));
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  const r = await postPromise!;
  expect(r.statusCode).toBe(401);
  expect(r.json()).toEqual({ error: 'PIN incorrecto', codigo: 'pin_incorrecto' });
  expect(await ctx.sql`SELECT id FROM sesion WHERE usuario_id = ${u.id} AND cerrada_en IS NULL`).toHaveLength(0);
  expect(await ctx.sql`SELECT id FROM intento_fallido WHERE usuario_id = ${u.id}`).toHaveLength(0);
  // Con el PIN nuevo, ya confirmado, entra.
  expect((await entrar(u.id, '9999')).statusCode).toBe(201);
});

test('una petición automática (X-Automatica: 1) se valida igual pero no renueva la sesión; cualquier otro valor o sin cabecera sí renueva; vencida recibe 401 igual', async () => {
  const cookieAdmin = cookieSesionDe(await entrar(adminRemoto.id, '3333'));
  const automatica = { ...conSesion(cookieAdmin), headers: { ...conSesion(cookieAdmin).headers, 'x-automatica': '1' } };
  // El cliente postgres devuelve los timestamps como texto: se comparan en milisegundos.
  const ms = (v: unknown) => new Date(v as string).getTime();
  const leerFila = async () => {
    const [f] = await ctx.sql`SELECT expira_en, ultimo_uso_en FROM sesion WHERE token_hash = ${huellaDe(cookieAdmin)}`;
    return { expira_en: ms(f.expira_en), ultimo_uso_en: ms(f.ultimo_uso_en) };
  };

  // Estado conocido: le quedan 60 s y el último uso fue hace 14 min.
  await ctx.sql`UPDATE sesion SET expira_en = now() + interval '1 minute', ultimo_uso_en = now() - interval '14 minutes' WHERE token_hash = ${huellaDe(cookieAdmin)}`;
  const antes = await leerFila();

  // Automática: responde 200 con el usuario (dispositivo, sesión y rol se
  // validaron) pero expira_en y ultimo_uso_en quedan exactamente igual.
  const auto = await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...automatica });
  expect(auto.statusCode).toBe(200);
  expect(auto.json().usuario.id).toBe(adminRemoto.id);
  const trasAuto = await leerFila();
  expect(trasAuto.expira_en).toBe(antes.expira_en);
  expect(trasAuto.ultimo_uso_en).toBe(antes.ultimo_uso_en);
  // La respuesta tampoco anuncia una expiración renovada.
  expect(ms(auto.json().expira_en)).toBe(antes.expira_en);

  // También automática sobre una ruta de admin con rol: igual, sin renovar.
  const autoAdmin = await ctx.app.inject({ method: 'GET', url: '/api/admin/dispositivos', ...automatica });
  expect(autoAdmin.statusCode).toBe(200);
  expect((await leerFila()).expira_en).toBe(antes.expira_en);

  // Otro valor de la cabecera: se trata como manual y renueva.
  const otroValor = { ...conSesion(cookieAdmin), headers: { ...conSesion(cookieAdmin).headers, 'x-automatica': 'si' } };
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...otroValor })).statusCode).toBe(200);
  const trasOtro = await leerFila();
  expect(trasOtro.expira_en - Date.now()).toBeGreaterThan(14 * 60000);
  expect(trasOtro.ultimo_uso_en).toBeGreaterThan(antes.ultimo_uso_en);

  // Sin cabecera: renueva (comportamiento de siempre).
  await ctx.sql`UPDATE sesion SET expira_en = now() + interval '1 minute', ultimo_uso_en = now() - interval '14 minutes' WHERE token_hash = ${huellaDe(cookieAdmin)}`;
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...conSesion(cookieAdmin) })).statusCode).toBe(200);
  expect((await leerFila()).expira_en - Date.now()).toBeGreaterThan(14 * 60000);

  // Vencida: la automática recibe 401 igual que cualquiera, y no la revive.
  await ctx.sql`UPDATE sesion SET expira_en = now() - interval '1 second' WHERE token_hash = ${huellaDe(cookieAdmin)}`;
  const vencida = await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...automatica });
  expect(vencida.statusCode).toBe(401);
  expect(vencida.json().codigo).toBe('sin_sesion');
  const [sigueVencida] = await ctx.sql`SELECT expira_en < now() AS vencida FROM sesion WHERE token_hash = ${huellaDe(cookieAdmin)}`;
  expect(sigueVencida.vencida).toBe(true);
  // Y una automática sin sesión, o con rol insuficiente, se rechaza como siempre.
  const sinSesion = await ctx.app.inject({ method: 'GET', url: '/api/sesion', remoteAddress: IP_REMOTA, headers: { cookie: aparato.cookie, 'x-automatica': '1' } });
  expect(sinSesion.statusCode).toBe(401);
  const cookieMesero = cookieSesionDe(await entrar(mesero.id, '1111'));
  const meseroAuto = await ctx.app.inject({ method: 'GET', url: '/api/admin/dispositivos', ...conSesion(cookieMesero), headers: { ...conSesion(cookieMesero).headers, 'x-automatica': '1' } });
  expect(meseroAuto.statusCode).toBe(403);
});

test('salir cierra la sesión, borra la cookie y la siguiente petición responde 401', async () => {
  const cookie = cookieSesionDe(await entrar(caja.id, '2222'));
  const salir = await ctx.app.inject({ method: 'DELETE', url: '/api/sesion', ...conSesion(cookie) });
  expect(salir.statusCode).toBe(204);
  const set = salir.headers['set-cookie'];
  expect(String(Array.isArray(set) ? set[0] : set)).toContain('sesion=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  const [fila] = await ctx.sql`SELECT cerrada_en FROM sesion WHERE token_hash = ${huellaDe(cookie)}`;
  expect(fila.cerrada_en).not.toBeNull();
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
  expect(sexto.headers['set-cookie']).toBeUndefined();
  const intentos = await ctx.sql`SELECT usuario_id FROM intento_fallido WHERE dispositivo_id = ${otro.dispositivo.id}`;
  expect(intentos).toHaveLength(5);
  expect(intentos.every((i) => i.usuario_id === mesero.id)).toBe(true);
  // El bloqueo aparece en la lista de admin.
  const lista = (await ctx.app.inject({ method: 'GET', url: '/api/admin/dispositivos' })).json();
  expect(lista.intentos_fallidos.filter((i: { dispositivo: string }) => i.dispositivo === 'Celular con fallos')).toHaveLength(5);
  expect(lista.intentos_fallidos[0]).toMatchObject({ dispositivo: 'Celular con fallos', usuario: 'Ana' });
  // Bloqueado, el aparato sigue viendo la lista de nombres y el estado: solo entrar está cerrado.
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion/usuarios', ...desdeOtro })).statusCode).toBe(200);

  await ctx.sql`UPDATE dispositivo SET bloqueado_hasta = now() - interval '1 second' WHERE id = ${otro.dispositivo.id}`;
  const entra = await entrar(mesero.id, '1111', desdeOtro);
  expect(entra.statusCode).toBe(201);
  const [d] = await ctx.sql`SELECT intentos_fallidos, bloqueado_hasta FROM dispositivo WHERE id = ${otro.dispositivo.id}`;
  expect(d).toEqual({ intentos_fallidos: 0, bloqueado_hasta: null });
});

test('cinco fallos simultáneos desde el mismo aparato bloquean igual: el contador no se pisa', async () => {
  const otro = await autorizarDispositivoDePrueba(ctx.db, 'Celular en ráfaga');
  const desdeOtro = { remoteAddress: IP_REMOTA, headers: { cookie: otro.cookie } };
  const respuestas = await Promise.all(Array.from({ length: 5 }, () => entrar(mesero.id, '0000', desdeOtro)));
  expect(respuestas.map((r) => r.statusCode)).toEqual([401, 401, 401, 401, 401]);
  const [d] = await ctx.sql`SELECT bloqueado_hasta > now() AS bloqueado FROM dispositivo WHERE id = ${otro.dispositivo.id}`;
  expect(d.bloqueado).toBe(true);
  expect((await entrar(mesero.id, '1111', desdeOtro)).statusCode).toBe(429);
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
  expect(sexto.json().codigo).toBe('dispositivo_bloqueado');
  const locales = await ctx.sql`SELECT id FROM intento_fallido WHERE dispositivo_id IS NULL AND usuario_id = ${caja.id}`;
  expect(locales).toHaveLength(5);
  const lista = (await ctx.app.inject({ method: 'GET', url: '/api/admin/dispositivos' })).json();
  expect(lista.intentos_fallidos.some((i: { dispositivo: string; usuario: string }) => i.dispositivo === 'PC de caja' && i.usuario === 'Beto')).toBe(true);
  // El bloqueo de la PC de caja no afecta a los celulares.
  expect((await entrar(caja.id, '2222')).statusCode).toBe(201);
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

test('revocar el aparato cierra su sesión: la cookie de sesión no vale ni aunque el aparato se vuelva a autorizar', async () => {
  const otro = await autorizarDispositivoDePrueba(ctx.db, 'Celular que se pierde');
  const cookie = cookieSesionDe(await entrar(caja.id, '2222', { remoteAddress: IP_REMOTA, headers: { cookie: otro.cookie } }));
  const con = { remoteAddress: IP_REMOTA, headers: { cookie: `${otro.cookie}; ${cookie}` } };
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...con })).statusCode).toBe(200);
  expect((await ctx.app.inject({ method: 'POST', url: `/api/admin/dispositivos/${otro.dispositivo.id}/revocar` })).statusCode).toBe(200);
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...con })).statusCode).toBe(403);
  await ctx.sql`UPDATE dispositivo SET estado = 'autorizado' WHERE id = ${otro.dispositivo.id}`;
  expect((await ctx.app.inject({ method: 'GET', url: '/api/sesion', ...con })).statusCode).toBe(401);
});

test('las rutas de admin exigen sesión: sin cookie responden 401 desde la PC de caja', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/admin/usuarios', headers: { cookie: '' } });
  expect(r.statusCode).toBe(401);
  expect(r.json().codigo).toBe('sin_sesion');
});
