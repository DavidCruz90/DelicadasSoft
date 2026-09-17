import { useEstado } from '../eventos';
export function AppCocina() {
  const { estado } = useEstado();
  if (!estado) return <div class="contenido">Cargando…</div>;
  if (!estado.configuracion.cocina_activa) return <div class="contenido"><h1>Pantalla de cocina desactivada</h1><p>Actívala en Admin, Configuración.</p></div>;
  return <div class="contenido"><h1>Cocina</h1><p>Pantalla en construcción (plan 3).</p></div>;
}
