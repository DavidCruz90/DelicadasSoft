import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { Aviso } from '../componentes/Aviso';

const CAMPOS = [
  ['nombre_local', 'Nombre del local', 'text'],
  ['simbolo_moneda', 'Símbolo de moneda', 'text'],
  ['cantidad_mesas', 'Cantidad de mesas', 'number'],
  ['propina_sugerida_pct', 'Propina sugerida (%)', 'number'],
  ['umbral_stock_bajo', 'Umbral de stock bajo', 'number'],
] as const;
const INTERRUPTORES = [
  ['cocina_activa', 'Usar pantalla de cocina'],
  ['sonido_cocina', 'Sonido en cocina al recibir ronda'],
  ['permitir_items_libres', 'Permitir ítems libres (texto y valor)'],
] as const;

// Cada campo numerico admite enteros (cantidad de mesas, umbral de stock) o
// decimales (propina); un texto vacio o con el formato equivocado no se
// convierte con Number() en silencio (Number('') es 0), se rechaza aqui con
// un mensaje en espanol antes de llamar al servidor.
const VALIDACION_NUMERICA: Record<string, { patron: RegExp; mensaje: string }> = {
  cantidad_mesas: { patron: /^\d+$/, mensaje: 'Escribe la cantidad de mesas, un número entero' },
  propina_sugerida_pct: { patron: /^\d+(\.\d+)?$/, mensaje: 'Escribe la propina sugerida, un número' },
  umbral_stock_bajo: { patron: /^\d+$/, mensaje: 'Escribe el umbral de stock bajo, un número entero' },
};

export function Configuracion() {
  const [datos, setDatos] = useState<any>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  useEffect(() => { api.get('/api/admin/configuracion').then(setDatos); }, []);
  if (!datos) return <p>Cargando…</p>;
  const guardar = async (e: Event) => {
    e.preventDefault();
    const cuerpo: any = {};
    for (const [k, , tipo] of CAMPOS) {
      if (tipo !== 'number') { cuerpo[k] = datos[k]; continue; }
      const { patron, mensaje } = VALIDACION_NUMERICA[k];
      const limpio = String(datos[k]).trim();
      if (!patron.test(limpio)) { setAviso({ tipo: 'error', texto: mensaje }); return; }
      cuerpo[k] = Number(limpio);
    }
    for (const [k] of INTERRUPTORES) cuerpo[k] = Boolean(datos[k]);
    try {
      setDatos(await api.patch('/api/admin/configuracion', cuerpo));
      setAviso({ tipo: 'ok', texto: 'Configuración guardada' });
    } catch (err: any) { setAviso({ tipo: 'error', texto: err.message }); }
  };
  return (
    <form onSubmit={guardar} style="display:grid;gap:12px;max-width:520px">
      {CAMPOS.map(([k, etiqueta, tipo]) => (
        <label key={k}>{etiqueta}
          <input type={tipo} step={k === 'propina_sugerida_pct' ? '0.01' : undefined} value={datos[k]} onInput={(e) => setDatos({ ...datos, [k]: (e.target as HTMLInputElement).value })} /></label>
      ))}
      {INTERRUPTORES.map(([k, etiqueta]) => (
        <label key={k} style="display:flex;gap:8px;align-items:center;color:inherit">
          <input type="checkbox" style="width:auto;min-height:0" checked={Boolean(datos[k])} onChange={(e) => setDatos({ ...datos, [k]: (e.target as HTMLInputElement).checked })} />{etiqueta}</label>
      ))}
      <Aviso tipo={aviso?.tipo ?? 'ok'} texto={aviso?.texto ?? null} />
      <button class="primario" type="submit">Guardar</button>
    </form>
  );
}
