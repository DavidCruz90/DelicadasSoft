import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { Aviso } from '../componentes/Aviso';
import { ROLES, type Rol } from '../../compartido/roles';

const NOMBRE_ROL: Record<Rol, string> = { mesero: 'Mesero', caja: 'Caja', admin: 'Administrador' };
const VACIO = { nombre: '', rol: 'mesero' as Rol, pin: '' };

export function Usuarios() {
  const [lista, setLista] = useState<any[]>([]);
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState<string | null>(null);
  const cargar = () => api.get('/api/admin/usuarios').then(setLista).catch((e: any) => setError(e.message));
  useEffect(() => { cargar(); }, []);
  useEventos(['config'], () => cargar());

  const crear = async (e: Event) => {
    e.preventDefault(); setError(null);
    // El PIN viaja como texto: "0123" conserva el cero. El servidor exige 4 dígitos.
    try { await api.post('/api/admin/usuarios', { nombre: form.nombre, rol: form.rol, pin: form.pin }); setForm(VACIO); await cargar(); }
    catch (err: any) { setError(err.message); }
  };
  const alternar = async (u: any) => {
    setError(null);
    try { await api.patch(`/api/admin/usuarios/${u.id}`, { activo: !u.activo }); await cargar(); }
    catch (err: any) { setError(err.message); }
  };
  const cambiarRol = async (u: any, rol: string) => {
    setError(null);
    try { await api.patch(`/api/admin/usuarios/${u.id}`, { rol }); await cargar(); }
    catch (err: any) { setError(err.message); await cargar(); }
  };
  const cambiarPin = async (u: any) => {
    setError(null);
    const pin = prompt(`Nuevo PIN de ${u.nombre} (4 dígitos)`); if (pin === null) return;
    try { await api.post(`/api/admin/usuarios/${u.id}/pin`, { pin: pin.trim() }); await cargar(); }
    catch (err: any) { setError(err.message); }
  };

  return (
    <div>
      <form onSubmit={crear} class="fila">
        <label>Nombre<input value={form.nombre} onInput={(e) => setForm({ ...form, nombre: (e.target as HTMLInputElement).value })} /></label>
        <label>Rol<select value={form.rol} onChange={(e) => setForm({ ...form, rol: (e.target as HTMLSelectElement).value as Rol })}>
          {ROLES.map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}</select></label>
        <label>PIN (4 dígitos)<input type="password" inputMode="numeric" maxLength={4} value={form.pin} onInput={(e) => setForm({ ...form, pin: (e.target as HTMLInputElement).value })} /></label>
        <button class="primario" type="submit" style="flex:0 0 auto">Agregar</button>
      </form>
      <Aviso tipo="error" texto={error} />
      <table><thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>PIN</th><th></th></tr></thead>
        <tbody>{lista.map((u) => (
          <tr key={u.id}>
            <td>{u.nombre}</td>
            <td><select value={u.rol} onChange={(e) => cambiarRol(u, (e.target as HTMLSelectElement).value)}>
              {ROLES.map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}</select></td>
            <td><span class={`pill ${u.activo ? 'ok' : ''}`}>{u.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td>{u.tiene_pin ? <span class="pill ok">Con PIN</span> : <span class="pill alerta">Sin PIN</span>} <button onClick={() => cambiarPin(u)}>Cambiar PIN</button></td>
            <td><button onClick={() => alternar(u)}>{u.activo ? 'Desactivar' : 'Activar'}</button></td>
          </tr>
        ))}</tbody></table>
    </div>
  );
}
