import { useSesion } from './Acceso';

// Nombre de quien está dentro y botón Salir, para la barra superior de toda
// pantalla con sesión (spec 8). Salir cierra la sesión en el servidor y borra
// su cookie; el aparato sigue autorizado.
export function BarraSesion() {
  const { usuario, salir } = useSesion();
  if (!usuario) return null;
  return (
    <span class="sesion">
      <span class="pill ok">{usuario.nombre}</span>
      <button onClick={salir}>Salir</button>
    </span>
  );
}
