import Fastify from 'fastify';
import { isNull } from 'drizzle-orm';
import type { Db } from './db/conexion';
import { crearBusEventos, rutaEventos, type BusEventos } from './eventos';
import { obtenerConfiguracion } from './modulos/configuracion';
import { jornada, mesero } from './db/schema';

declare module 'fastify' {
  interface FastifyInstance { db: Db; bus: BusEventos; }
}

export async function crearApp({ db }: { db: Db }) {
  const app = Fastify({ logger: false });
  app.decorate('db', db);
  app.decorate('bus', crearBusEventos());

  app.setErrorHandler((err: any, _req, reply) => {
    const estado = typeof err.estado === 'number' ? err.estado : err.validation ? 400 : 500;
    if (estado === 500) app.log.error(err);
    reply.status(estado).send({ error: estado === 500 ? 'Error inesperado del servidor' : err.message });
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

  return app;
}
