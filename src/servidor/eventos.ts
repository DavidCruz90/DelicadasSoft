import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { NombreEvento } from '../compartido/eventos';

export type { NombreEvento };
export type Evento = { nombre: NombreEvento; datos?: unknown };
type Suscriptor = (e: Evento) => void;

// alFallar recibe cada error que lance un suscriptor. emitir nunca lanza:
// un suscriptor roto no debe tumbar la peticion que disparo el evento ni
// impedir que los demas suscriptores se enteren.
export function crearBusEventos(alFallar?: (err: unknown) => void) {
  const suscriptores = new Set<Suscriptor>();
  return {
    emitir(nombre: NombreEvento, datos?: unknown) {
      const evento: Evento = { nombre, datos };
      for (const s of suscriptores) {
        try {
          s(evento);
        } catch (err) {
          alFallar?.(err);
        }
      }
    },
    suscribir(fn: Suscriptor) {
      suscriptores.add(fn);
      return () => { suscriptores.delete(fn); };
    },
  };
}
export type BusEventos = ReturnType<typeof crearBusEventos>;

export function rutaEventos(app: FastifyInstance) {
  // El cierre de las conexiones abiertas a /api/eventos cuando el servidor
  // se apaga se resuelve con forceCloseConnections: true en Fastify({...}),
  // no aqui (ver app.ts para el motivo).
  app.get('/api/eventos', (req: FastifyRequest, reply: FastifyReply) => {
    // Tomamos el control manual de la respuesta: a partir de aqui Fastify
    // no debe tocar reply.raw por su cuenta.
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    reply.raw.write(': conectado\n\n');

    const cancelar = app.bus.suscribir((e) => {
      reply.raw.write(`event: ${e.nombre}\ndata: ${JSON.stringify(e.datos ?? {})}\n\n`);
    });
    // Evento con nombre (no un comentario ':') para que el cliente pueda
    // escucharlo con addEventListener y usarlo como senal de "la conexion
    // sigue viva", ademas de reiniciar su propio vigilante de 60 s con el.
    // No forma parte de NombreEvento: nadie lo emite por el bus, solo esta
    // ruta lo escribe directamente en la respuesta.
    const latido = setInterval(() => reply.raw.write('event: latido\ndata: {}\n\n'), 25000);
    req.raw.on('close', () => {
      clearInterval(latido);
      cancelar();
    });
  });
}
