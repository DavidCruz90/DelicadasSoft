import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from './api';

export type NombreEvento = 'jornada' | 'mesa' | 'stock' | 'catalogo' | 'config';

export function useEventos(nombres: NombreEvento[], callback: (nombre: NombreEvento, datos: any) => void) {
  const [conectado, setConectado] = useState(false);
  const cb = useRef(callback); cb.current = callback;
  useEffect(() => {
    let es: EventSource | null = null; let timer: any = null; let vivo = true;
    const abrir = () => {
      es = new EventSource('/api/eventos');
      es.onopen = () => setConectado(true);
      for (const n of nombres) es.addEventListener(n, (e: MessageEvent) => cb.current(n, e.data ? JSON.parse(e.data) : {}));
      es.onerror = () => { setConectado(false); es?.close(); if (vivo) timer = setTimeout(abrir, 2000); };
    };
    abrir();
    return () => { vivo = false; clearTimeout(timer); es?.close(); };
  }, [nombres.join(',')]);
  return conectado;
}

export type Estado = { configuracion: any; jornada: any | null; meseros: { id: string; nombre: string }[] };

export function useEstado() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const cargar = () => api.get('/api/estado').then(setEstado).catch(() => {});
  useEffect(() => { cargar(); }, []);
  const conectado = useEventos(['jornada', 'config'], () => cargar());
  return { estado, conectado, recargar: cargar };
}
