import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { useEventos } from '../eventos';
import { Aviso } from '../componentes/Aviso';

type Datos = { pendientes: any[]; autorizados: any[]; intentos_fallidos: any[] };
const VACIO: Datos = { pendientes: [], autorizados: [], intentos_fallidos: [] };
const RECARGA_MS = 30000;

const haceCuanto = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? 'hace un momento' : min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`;
};
const fechaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-EC') : '—');

export function Dispositivos() {
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // automatica: la recarga no la inició la persona (intervalo o aviso en
  // vivo) y no renueva la sesión; la carga inicial y las que siguen a un
  // clic sí cuentan como uso.
  const cargar = (automatica = false) => api.get('/api/admin/dispositivos', { automatica }).then(setDatos).catch((e: any) => setError(e.message));
  // El evento 'dispositivos' avisa de solicitudes nuevas y cambios; el
  // intervalo cubre la caducidad de pendientes, que no emite evento.
  useEffect(() => { cargar(); const t = setInterval(() => cargar(true), RECARGA_MS); return () => clearInterval(t); }, []);
  useEventos(['dispositivos'], () => cargar(true));

  const autorizar = async (d: any) => {
    setError(null);
    try { await api.post(`/api/admin/dispositivos/${d.id}/autorizar`, { nombre: nombres[d.id] ?? '' }); await cargar(); }
    catch (e: any) { setError(e.message); }
  };
  const revocar = async (d: any) => {
    if (!confirm(`¿Quitar el acceso a "${d.nombre}"? Sus sesiones se cerrarán.`)) return;
    setError(null);
    try { await api.post(`/api/admin/dispositivos/${d.id}/revocar`); await cargar(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div style="display:grid;gap:24px">
      <Aviso tipo="error" texto={error} />
      <section class="tarjeta">
        <h2>Esperando autorización</h2>
        {datos.pendientes.length === 0 ? <p>Ningún aparato está pidiendo acceso.</p> : (
          <table><thead><tr><th>Código</th><th>Navegador</th><th>Desde</th><th>Nombre</th><th></th></tr></thead>
            <tbody>{datos.pendientes.map((d) => (
              <tr key={d.id}>
                <td class="codigo-celda">{d.codigo}</td><td>{d.descripcion}</td><td>{haceCuanto(d.solicitado_en)}</td>
                <td><input placeholder="Celular de Ana" value={nombres[d.id] ?? ''} onInput={(e) => setNombres({ ...nombres, [d.id]: (e.target as HTMLInputElement).value })} /></td>
                <td><button class="primario" onClick={() => autorizar(d)}>Autorizar</button></td>
              </tr>
            ))}</tbody></table>
        )}
      </section>
      <section class="tarjeta">
        <h2>Autorizados</h2>
        {datos.autorizados.length === 0 ? <p>Ninguno todavía. La PC de caja no necesita autorización.</p> : (
          <table><thead><tr><th>Nombre</th><th>Navegador</th><th>Último uso</th><th></th></tr></thead>
            <tbody>{datos.autorizados.map((d) => (
              <tr key={d.id}><td>{d.nombre}</td><td>{d.descripcion}</td><td>{fechaHora(d.ultimo_uso_en)}</td>
                <td><button class="peligro" onClick={() => revocar(d)}>Quitar acceso</button></td></tr>
            ))}</tbody></table>
        )}
      </section>
      <section class="tarjeta">
        <h2>Últimos intentos fallidos</h2>
        {datos.intentos_fallidos.length === 0 ? <p>Ninguno.</p> : (
          <table><thead><tr><th>Aparato</th><th>Usuario</th><th>Hora</th></tr></thead>
            <tbody>{datos.intentos_fallidos.map((i) => (
              <tr key={i.id}><td>{i.dispositivo}</td><td>{i.usuario}</td><td>{fechaHora(i.ocurrido_en)}</td></tr>
            ))}</tbody></table>
        )}
      </section>
    </div>
  );
}
