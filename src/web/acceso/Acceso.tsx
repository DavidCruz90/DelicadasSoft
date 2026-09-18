import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { api, ErrorApi, registrarGanchosDeAcceso } from '../api';
import type { Rol } from '../../compartido/roles';
import { TecladoPin } from './TecladoPin';
import { DispositivoNoAutorizado } from './DispositivoNoAutorizado';
import { Instalacion } from './Instalacion';

export type UsuarioSesion = { id: string; nombre: string; rol: Rol };
type Sesion = { usuario: UsuarioSesion | null; salir: () => Promise<void> };
const ContextoSesion = createContext<Sesion>({ usuario: null, salir: async () => {} });
export const useSesion = () => useContext(ContextoSesion);

type Fase = 'cargando' | 'instalacion' | 'dispositivo' | 'pin' | 'listo' | 'sin-permiso';
const SONDEO_MS = 3000;
const REINTENTO_MS = 2000;
const NOMBRE_ROL: Record<Rol, string> = { mesero: 'mesero', caja: 'caja', admin: 'administrador' };

// Envuelve cada pantalla. Resuelve, en orden: instalación (solo la PC de
// caja la ve), autorización del aparato (código de 4 dígitos), PIN (salvo
// cocina) y rol. Cuando la sesión vence estando dentro, pone el teclado de
// PIN ENCIMA de la pantalla sin desmontarla: lo que había en memoria sigue
// ahí y, al desbloquear, api.ts reintenta la petición que falló.
// rolesPermitidos: null = pantalla sin sesión (cocina), solo exige aparato.
// GET /api/sesion se consulta solo al cargar la pantalla (y al volver de la
// pantalla de código); nunca en un intervalo.
export function Acceso({ rolesPermitidos, children }: { rolesPermitidos: Rol[] | null; children: any }) {
  const [fase, setFase] = useState<Fase>('cargando');
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [codigo, setCodigo] = useState('');
  const [bloqueado, setBloqueado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const pendientes = useRef<(() => void)[]>([]);
  const sondeo = useRef<any>(null);
  const pidiendo = useRef(false);
  const vivo = useRef(true);

  const admitir = (u: UsuarioSesion | null) => {
    if (rolesPermitidos === null) { setFase('listo'); return; }
    if (!u) { setFase('pin'); return; }
    setUsuario(u);
    setFase(rolesPermitidos.includes(u.rol) ? 'listo' : 'sin-permiso');
  };

  const comprobarSesion = async () => {
    if (!vivo.current) return;
    try {
      const s = await api.get('/api/sesion');
      setAviso(null);
      admitir(s.usuario);
    } catch (e) {
      const err = e as ErrorApi;
      if (err.codigo === 'dispositivo_no_autorizado') { pedirAutorizacion(); return; }
      if (err.codigo === 'sin_sesion') { setAviso(null); admitir(null); return; }
      // Sin conexión u otro error: reintentar, sin dejar la pantalla colgada.
      setAviso(err.message);
      setTimeout(comprobarSesion, REINTENTO_MS);
    }
  };

  // Una sola solicitud en vuelo: varias peticiones rechazadas a la vez (las
  // de una pantalla entera al ser revocada) no piden varios códigos.
  const pedirAutorizacion = async () => {
    if (!vivo.current || pidiendo.current) return;
    pidiendo.current = true;
    clearInterval(sondeo.current);
    try {
      const { codigo: nuevo, espera_id } = await api.post('/api/dispositivos/solicitar');
      pidiendo.current = false;
      setAviso(null);
      setCodigo(nuevo);
      setFase('dispositivo');
      // El sondeo no lo inicia la persona: va marcado como automático.
      sondeo.current = setInterval(async () => {
        try {
          const r = await api.get(`/api/dispositivos/estado?espera_id=${espera_id}`, { automatica: true });
          if (r.estado === 'autorizado') { clearInterval(sondeo.current); setCodigo(''); comprobarSesion(); }
          else if (r.estado === 'revocado') { clearInterval(sondeo.current); pedirAutorizacion(); }
        } catch (e) {
          if ((e as ErrorApi).codigo === 'solicitud_caducada') { clearInterval(sondeo.current); pedirAutorizacion(); }
        }
      }, SONDEO_MS);
    } catch (e) {
      pidiendo.current = false;
      setAviso((e as ErrorApi).message);
      setTimeout(pedirAutorizacion, REINTENTO_MS);
    }
  };

  const arrancar = async () => {
    try {
      const i = await api.get('/api/instalacion');
      if (i.instalado === false) { setFase('instalacion'); return; }
    } catch {
      // 403: no es la PC de caja. Sin conexión: comprobarSesion reintenta.
    }
    await comprobarSesion();
  };

  useEffect(() => {
    vivo.current = true;
    arrancar();
    return () => { vivo.current = false; clearInterval(sondeo.current); };
  }, []);

  // Ganchos de api.ts. El de bloqueo (401) solo cuando la pantalla ya está
  // dentro. El de aparato revocado (403) también en el teclado de PIN y en
  // "sin permiso": desde ahí "Salir" o entrar con PIN deben llevar a la
  // pantalla de código. Mientras se carga o se muestra el código, ninguno:
  // comprobarSesion y el sondeo ya atienden esos casos por su cuenta.
  useEffect(() => {
    const dentro = fase === 'listo';
    const conAparato = dentro || fase === 'pin' || fase === 'sin-permiso';
    registrarGanchosDeAcceso({
      esperarDesbloqueo: dentro && rolesPermitidos !== null ? () => new Promise<void>((resolve) => {
        pendientes.current.push(resolve);
        setBloqueado(true);
      }) : null,
      dispositivoNoAutorizado: conAparato ? () => { setBloqueado(false); pendientes.current = []; setFase('cargando'); pedirAutorizacion(); } : null,
    });
    return () => registrarGanchosDeAcceso({ esperarDesbloqueo: null, dispositivoNoAutorizado: null });
  }, [fase]);

  const alEntrar = (u: UsuarioSesion) => {
    if (!bloqueado) { admitir(u); return; }
    // Desbloqueo: se quita la capa y se sueltan las peticiones que esperaban.
    setBloqueado(false);
    setUsuario(u);
    if (rolesPermitidos && !rolesPermitidos.includes(u.rol)) { pendientes.current = []; setFase('sin-permiso'); return; }
    const lista = pendientes.current;
    pendientes.current = [];
    for (const soltar of lista) soltar();
  };

  const salir = async () => {
    try { await api.del('/api/sesion'); } catch { /* si ya no había sesión, da igual */ }
    setUsuario(null);
    setBloqueado(false);
    pendientes.current = [];
    setFase(rolesPermitidos === null ? 'listo' : 'pin');
  };

  if (fase === 'cargando') return <div class="contenido">{aviso ? <div class="aviso error">{aviso}</div> : 'Cargando…'}</div>;
  if (fase === 'instalacion') return <Instalacion />;
  if (fase === 'dispositivo') return <DispositivoNoAutorizado codigo={codigo} />;
  if (fase === 'pin') return <TecladoPin capa={false} alEntrar={alEntrar} />;
  if (fase === 'sin-permiso') {
    return (
      <div class="contenido sin-permiso">
        <h1>No tienes permiso para esta pantalla</h1>
        <p>{usuario?.nombre} entró como {usuario ? NOMBRE_ROL[usuario.rol] : ''}.</p>
        <button class="primario" onClick={salir}>Salir</button>
      </div>
    );
  }
  return (
    <ContextoSesion.Provider value={{ usuario, salir }}>
      {children}
      {bloqueado && <TecladoPin capa={true} alEntrar={alEntrar} />}
    </ContextoSesion.Provider>
  );
}
