import { useEstado } from '../eventos';
export function AppMesero() {
  const { estado } = useEstado();
  if (!estado) return <div class="contenido">Cargando…</div>;
  if (!estado.jornada) return <div class="contenido"><h1>Caja cerrada</h1><p>No se pueden tomar pedidos hasta que caja abra la jornada.</p></div>;
  return <div class="contenido"><h1>Mesero</h1><p>Pantalla en construcción (plan 2).</p></div>;
}
