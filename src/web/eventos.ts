import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from './api';
import type { NombreEvento } from '../compartido/eventos';

export type { NombreEvento };

// Si pasan 60 s sin recibir nada (ni un evento de negocio ni el latido que
// el servidor manda cada 25 s), la conexion se considera muerta aunque el
// navegador no haya disparado onerror todavia (pasa con cortes de WiFi que
// no cierran el socket). En ese caso se marca desconectado, se cierra y se
// reintenta como si hubiera fallado.
const VENTANA_SIN_SENAL_MS = 60000;
const REINTENTO_MS = 2000;

export function useEventos(nombres: NombreEvento[], callback: (nombre: NombreEvento, datos: any) => void) {
  const [conectado, setConectado] = useState(false);
  const cb = useRef(callback); cb.current = callback;
  useEffect(() => {
    let es: EventSource | null = null;
    let reintento: any = null;
    let vigilante: any = null;
    let vivo = true;

    const reiniciarVigilante = () => {
      clearTimeout(vigilante);
      vigilante = setTimeout(() => {
        setConectado(false);
        es?.close();
        if (vivo) reintento = setTimeout(abrir, REINTENTO_MS);
      }, VENTANA_SIN_SENAL_MS);
    };

    const abrir = () => {
      es = new EventSource('/api/eventos');
      es.onopen = () => { setConectado(true); reiniciarVigilante(); };
      es.addEventListener('latido', () => reiniciarVigilante());
      for (const n of nombres) {
        es.addEventListener(n, (e: MessageEvent) => {
          reiniciarVigilante();
          cb.current(n, e.data ? JSON.parse(e.data) : {});
        });
      }
      es.onerror = () => {
        setConectado(false);
        clearTimeout(vigilante);
        es?.close();
        if (vivo) reintento = setTimeout(abrir, REINTENTO_MS);
      };
    };
    abrir();
    return () => { vivo = false; clearTimeout(reintento); clearTimeout(vigilante); es?.close(); };
  }, [nombres.join(',')]);
  return conectado;
}

export type Estado = { configuracion: any; jornada: any | null };

export function useEstado() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const vivo = useRef(true);
  const reintento = useRef<any>(null);

  const cargar = () => {
    if (reintento.current) { clearTimeout(reintento.current); reintento.current = null; }
    api.get('/api/estado').then((datos) => {
      if (vivo.current) setEstado(datos);
    }).catch(() => {
      // Sin conexion en la primera carga, o el servidor volvio a caerse
      // justo al reconectar: reintentar hasta que entre, no dejar la
      // pantalla colgada en "Cargando...".
      if (vivo.current) reintento.current = setTimeout(cargar, REINTENTO_MS);
    });
  };

  useEffect(() => {
    vivo.current = true;
    cargar();
    return () => { vivo.current = false; if (reintento.current) clearTimeout(reintento.current); };
  }, []);

  const conectado = useEventos(['jornada', 'config'], () => cargar());
  // Al reconectar (o conectar por primera vez) puede haber pasado cualquier
  // cosa mientras no habia conexion: recargar siempre, no solo esperar a
  // que llegue un evento de jornada o config.
  useEffect(() => { if (conectado) cargar(); }, [conectado]);

  return { estado, conectado, recargar: cargar };
}
