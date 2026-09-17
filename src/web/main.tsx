import { render } from 'preact';
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
const App = ruta === '/admin' ? AppAdmin : ruta === '/mesero' ? AppMesero : ruta === '/caja' ? AppCaja : ruta === '/cocina' ? AppCocina : Indice;
render(<App />, document.getElementById('app')!);
