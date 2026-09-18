import { useState } from 'preact/hooks';
import { useEstado } from '../eventos';
import { BarraSesion } from '../acceso/BarraSesion';
import { Configuracion } from './Configuracion';
import { Usuarios } from './Usuarios';
import { Dispositivos } from './Dispositivos';
import { Menu } from './Menu';

const PESTANAS = [['config', 'Configuración'], ['usuarios', 'Usuarios'], ['dispositivos', 'Dispositivos'], ['menu', 'Menú']] as const;
type Pestana = (typeof PESTANAS)[number][0];

export function AppAdmin() {
  const { estado, conectado } = useEstado();
  const [pestana, setPestana] = useState<Pestana>('menu');
  return (
    <div>
      {!conectado && <div class="sin-conexion">Sin conexión con el servidor. Reintentando…</div>}
      <div class="barra"><h1>Admin · {estado?.configuracion?.nombre_local ?? ''}</h1>
        <span class="pill">{estado?.jornada ? 'Caja abierta' : 'Caja cerrada'}</span>
        <BarraSesion /></div>
      <div class="contenido">
        <div class="pestanas">
          {PESTANAS.map(([k, t]) => <button key={k} class={pestana === k ? 'activa' : ''} onClick={() => setPestana(k)}>{t}</button>)}
        </div>
        {pestana === 'config' && <Configuracion />}
        {pestana === 'usuarios' && <Usuarios />}
        {pestana === 'dispositivos' && <Dispositivos />}
        {pestana === 'menu' && <Menu />}
      </div>
    </div>
  );
}
