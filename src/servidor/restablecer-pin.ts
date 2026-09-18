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
// Toda salida con error termina con código 1 y un mensaje en español, nunca
// con una traza: quien lo corre es el dueño, no un programador.

function terminar(mensaje: string): never {
  console.error(mensaje);
  process.exit(1);
}

let nombre: string | undefined;
let pin: string | undefined;
try {
  ({ values: { nombre, pin } } = parseArgs({ options: { nombre: { type: 'string' }, pin: { type: 'string' } }, strict: true }));
} catch {
  terminar('Uso: npm run restablecer-pin -- --nombre "Nombre del administrador" --pin 1234\n(o sin argumentos, para que pregunte)');
}

if (nombre === undefined || pin === undefined) {
  // Las respuestas se leen con el iterador de líneas, no con rl.question:
  // question solo atiende la línea que llega mientras espera, y si la entrada
  // viene toda de golpe (una tubería o el lanzador de Windows), las líneas
  // siguientes se pierden y el comando se queda colgado. El iterador las
  // guarda en orden. Si la entrada se acaba antes de responder, es un error
  // claro, no un cuelgue.
  const rl = createInterface({ input: stdin, output: stdout });
  const lineas = rl[Symbol.asyncIterator]();
  const preguntar = async (texto: string): Promise<string> => {
    stdout.write(texto);
    const { value, done } = await lineas.next();
    if (done) terminar('\nNo se recibió respuesta. No se cambió nada.');
    return value.trim();
  };
  if (nombre === undefined) nombre = await preguntar('Nombre del administrador: ');
  if (pin === undefined) {
    pin = await preguntar('PIN nuevo (4 dígitos): ');
    const confirmacion = await preguntar('Repite el PIN: ');
    if (confirmacion !== pin) terminar('Los PIN no coinciden. No se cambió nada.');
  }
  rl.close();
}

const { db, sql } = crearDb(config.databaseUrl);
try {
  // restablecerPinAdmin valida nombre y PIN, busca al admin activo y pasa por
  // cambiarPin, que cierra sus sesiones abiertas en la misma transacción.
  const u = await restablecerPinAdmin(db, nombre, pin);
  console.log(`PIN restablecido para ${u.nombre}. Sus sesiones abiertas quedaron cerradas.`);
} catch (err) {
  // Los errores propios (validación, "no hay un administrador...") traen
  // estado y un mensaje pensado para el dueño. Cualquier otro es, en la
  // práctica, que la base no responde: no se imprime el error crudo.
  const e = err as { estado?: unknown; message?: string };
  console.error(typeof e.estado === 'number' ? e.message : 'No se pudo conectar con la base de datos (¿está encendida?)');
  process.exitCode = 1;
} finally {
  await sql.end();
}
