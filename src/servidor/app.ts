import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isNull } from 'drizzle-orm';
import type { Db } from './db/conexion';
import { config } from './config';
import { crearBusEventos, rutaEventos, type BusEventos } from './eventos';
import { obtenerConfiguracion, rutasConfiguracion } from './modulos/configuracion';
import { rutasUsuarios } from './modulos/usuarios';
import { rutasCatalogo } from './modulos/catalogo';
import { jornada } from './db/schema';

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
  413: 'El contenido supera el tamaño máximo permitido',
  415: 'Tipo de contenido no soportado',
};

export async function crearApp({ db }: { db: Db }) {
  // forceCloseConnections: true hace que Fastify destruya las conexiones
  // keep-alive (incluida cualquier pantalla conectada a /api/eventos) antes
  // de cerrar el servidor HTTP en app.close(). Sin esto, Fastify 5 solo
  // cierra conexiones ociosas y una conexion SSE nunca lo esta: app.close()
  // se queda colgado para siempre con una sola pantalla de cocina abierta.
  // ignoreTrailingSlash hace que /admin y /admin/ respondan igual: sin esto,
  // una pantalla que alguien abre escribiendo la barra final a mano (o un
  // enlace guardado con ella) se topa con el 404 JSON en vez de la pagina.
  // Va en routerOptions: la opcion de nivel superior existe pero Fastify 5
  // la marca obsoleta en tiempo de ejecucion (aviso FSTDEP022) y se quita
  // en Fastify 6.
  const app = Fastify({ logger: false, forceCloseConnections: true, routerOptions: { ignoreTrailingSlash: true } });
  app.decorate('db', db);
  app.decorate('bus', crearBusEventos((err) => app.log.error(err)));

  await app.register(multipart);
  mkdirSync(config.carpetaFotos, { recursive: true });
  await app.register(fastifyStatic, { root: resolve(config.carpetaFotos), prefix: '/fotos/', decorateReply: false });

  const carpetaWeb = resolve('dist/web');
  if (existsSync(join(carpetaWeb, 'index.html'))) {
    await app.register(fastifyStatic, { root: carpetaWeb, prefix: '/', decorateReply: true, index: false, wildcard: false });
    for (const ruta of ['/', '/admin', '/mesero', '/caja', '/cocina']) {
      app.get(ruta, (_req, reply) => reply.sendFile('index.html'));
    }
  }

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
    return {
      configuracion: await obtenerConfiguracion(db),
      jornada: abierta ?? null,
    };
  });
  rutaEventos(app);
  rutasConfiguracion(app);
  rutasUsuarios(app);
  rutasCatalogo(app);

  return app;
}
