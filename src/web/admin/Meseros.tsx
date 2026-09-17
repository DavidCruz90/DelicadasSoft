import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { Aviso } from '../componentes/Aviso';

export function Meseros() {
  const [lista, setLista] = useState<any[]>([]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cargar = () => api.get('/api/admin/meseros').then(setLista);
  useEffect(() => { cargar(); }, []);
  useEventos(['config'], () => cargar());
  const crear = async (e: Event) => {
    e.preventDefault(); setError(null);
    try { await api.post('/api/admin/meseros', { nombre }); setNombre(''); await cargar(); }
    catch (err: any) { setError(err.message); }
  };
  const alternar = async (m: any) => {
    setError(null);
    try { await api.patch(`/api/admin/meseros/${m.id}`, { activo: !m.activo }); await cargar(); }
    catch (err: any) { setError(err.message); }
  };
  return (
    <div>
      <form onSubmit={crear} class="fila">
        <label>Nombre del mesero<input value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} /></label>
        <button class="primario" type="submit" style="flex:0 0 auto">Agregar</button>
      </form>
      <Aviso tipo="error" texto={error} />
      <table><thead><tr><th>Nombre</th><th>Estado</th><th></th></tr></thead>
        <tbody>{lista.map((m) => (
          <tr key={m.id}><td>{m.nombre}</td><td><span class={`pill ${m.activo ? 'ok' : ''}`}>{m.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td><button onClick={() => alternar(m)}>{m.activo ? 'Desactivar' : 'Activar'}</button></td></tr>
        ))}</tbody></table>
    </div>
  );
}
