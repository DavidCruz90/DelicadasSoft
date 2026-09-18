import { useEstado } from '../eventos';
import { BarraSesion } from '../acceso/BarraSesion';

export function AppMesero() {
  const { estado } = useEstado();
  return (
    <div>
      <div class="barra"><h1>Mesero</h1><BarraSesion /></div>
      {!estado && <div class="contenido">Cargando…</div>}
      {estado && !estado.jornada && <div class="contenido"><h1>Caja cerrada</h1><p>No se pueden tomar pedidos hasta que caja abra la jornada.</p></div>}
      {estado && estado.jornada && <div class="contenido"><p>Pantalla en construcción (plan 2).</p></div>}
    </div>
  );
}
