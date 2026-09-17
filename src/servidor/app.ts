import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { isNull } from 'drizzle-orm';
import type { Db } from './db/conexion';
import { config } from './config';
import { crearBusEventos, rutaEventos, type BusEventos } from './eventos';
import { obtenerConfiguracion, rutasConfiguracion } from './modulos/configuracion';
import { rutasMeseros } from './modulos/meseros';
import { rutasCatalogo } from './modulos/catalogo';
import { jornada, mesero } from './db/schema';

declare module 'fastify' {
  interface FastifyInstance { db: Db; bus: BusEventos; }
}

type ErrorConEstado = FastifyError & { estado?: number };

// Mensajes en espanol para errores que genera el propio Fastify (statusCode
// 4xx) antes de que nuestro codigo intervenga: cuerpo malformado, tipo de
// contenido no soportado, etc. El resto de esos 4xx lleva un mensaje generico.
const MENSAJES_ERROR_FASTIFY: Record<number, string> = {
  400: 'Cuerpo inválido',
  406: 'Se esperaba un archivo',
  413: 'La foto supera el tamaño máximo de 5 MB',
  415: 'Tipo de contenido no soportado',
};

export async function crearApp({ db }: { db: Db }) {
  // forceCloseConnections: true hace que Fastify destruya las conexiones
  // keep-alive (incluida cualquier pantalla conectada a /api/eventos) antes
  // de cerrar el servidor HTTP en app.close(). Sin esto, Fastify 5 solo
  // cierra conexiones ociosas y una conexion SSE nunca lo esta: app.close()
  // se queda colgado para siempre con una sola pantalla de cocina abierta.
  const app = Fastify({ logger: false, forceCloseConnections: true });
  app.decorate('db', db);
  app.decorate('bus', crearBusEventos((err) => app.log.error(err)));

  await app.register(multipart);
  mkdirSync(config.carpetaFotos, { recursive: true });
  await app.register(fastifyStatic, { root: resolve(config.carpetaFotos), prefix: '/fotos/', decorateReply: false });

  app.setErrorHandler((err: ErrorConEstado, _req, reply) => {
    // 1. Nuestros propios errores (ErrorNegocio, ErrorValidacion, NoEncontrado).
    if (typeof err.estado === 'number') {
      reply.status(err.estado).send({ error: err.message });
      return;
    }
    // 2. Errores de validacion de esquema (ajv). No se traduce el mensaje.
    if (err.validation) {
      reply.status(400).send({ error: err.message });
      return;
    }
    // 3. Errores que el propio Fastify genera con su statusCode 4xx (cuerpo
    // JSON malformado, content-type no soportado, etc.).
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
      reply.status(err.statusCode).send({ error: MENSAJES_ERROR_FASTIFY[err.statusCode] ?? 'Solicitud inválida' });
      return;
    }
    // 4. Cualquier otra cosa: 500, sin filtrar el error interno al cliente.
    app.log.error(err);
    reply.status(500).send({ error: 'Error inesperado del servidor' });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'No existe' }));

  app.get('/api/estado', async () => {
    const [abierta] = await db.select().from(jornada).where(isNull(jornada.cerrada_en)).limit(1);
    const meseros = await db.select().from(mesero).orderBy(mesero.nombre);
    return {
      configuracion: await obtenerConfiguracion(db),
      jornada: abierta ?? null,
      meseros: meseros.filter((m) => m.activo),
    };
  });
  rutaEventos(app);
  rutasConfiguracion(app);
  rutasMeseros(app);
  rutasCatalogo(app);

  return app;
}
