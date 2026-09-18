import { render } from 'preact';
import { Acceso } from './acceso/Acceso';
import { ROLES_POR_PANTALLA } from '../compartido/roles';
import { AppAdmin } from './admin/AppAdmin';
import { AppMesero } from './mesero/AppMesero';
import { AppCaja } from './caja/AppCaja';
import { AppCocina } from './cocina/AppCocina';

function Indice() {
  return (
    <div class="contenido">
      <h1>Cafetería</h1>
      <p>Elige tu puesto:</p>
      <p><a href="/mesero">Mesero</a> · <a href="/caja">Caja</a> · <a href="/cocina">Cocina</a> · <a href="/admin">Admin</a></p>
    </div>
  );
}

const ruta = location.pathname.replace(/\/+$/, '') || '/';

// Cada pantalla va dentro de <Acceso>, que resuelve instalación, aparato,
// PIN y rol antes de mostrarla. Cocina no lleva sesión (rolesPermitidos null).
function Raiz() {
  if (ruta === '/admin') return <Acceso rolesPermitidos={ROLES_POR_PANTALLA['/admin']}><AppAdmin /></Acceso>;
  if (ruta === '/caja') return <Acceso rolesPermitidos={ROLES_POR_PANTALLA['/caja']}><AppCaja /></Acceso>;
  if (ruta === '/mesero') return <Acceso rolesPermitidos={ROLES_POR_PANTALLA['/mesero']}><AppMesero /></Acceso>;
  if (ruta === '/cocina') return <Acceso rolesPermitidos={null}><AppCocina /></Acceso>;
  return <Indice />;
}

render(<Raiz />, document.getElementById('app')!);
