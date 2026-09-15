import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export type NombreEvento = 'jornada' | 'mesa' | 'stock' | 'catalogo' | 'config';
export type Evento = { nombre: NombreEvento; datos?: unknown };
type Suscriptor = (e: Evento) => void;

export function crearBusEventos() {
  const suscriptores = new Set<Suscriptor>();
  return {
    emitir(nombre: NombreEvento, datos?: unknown) {
      for (const s of suscriptores) s({ nombre, datos });
    },
    suscribir(fn: Suscriptor) {
      suscriptores.add(fn);
      return () => { suscriptores.delete(fn); };
    },
  };
}
export type BusEventos = ReturnType<typeof crearBusEventos>;

export function rutaEventos(app: FastifyInstance) {
  app.get('/api/eventos', (req: FastifyRequest, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    reply.raw.write(': conectado\n\n');
    const cancelar = app.bus.suscribir((e) => {
      reply.raw.write(`event: ${e.nombre}\ndata: ${JSON.stringify(e.datos ?? {})}\n\n`);
    });
    const latido = setInterval(() => reply.raw.write(': latido\n\n'), 25000);
    req.raw.on('close', () => { clearInterval(latido); cancelar(); });
  });
}
