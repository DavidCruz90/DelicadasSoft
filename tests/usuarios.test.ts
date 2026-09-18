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
  // Se manda el cuerpo directo (no con el ayudante `crear`): un parámetro con
  // valor por defecto lo aplica también cuando se pasa `undefined`, así que el
  // ayudante nunca podría probar el caso "sin pin". JSON.stringify omite la
  // clave cuando el valor es undefined: el cuerpo llega de verdad sin `pin`.
  for (const malo of [undefined, 1234, '123', '12345', 'abcd', null]) {
    const r = await ctx.app.inject({ method: 'POST', url: RUTA, payload: { nombre: 'Pin malo', rol: 'mesero', pin: malo } });
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
