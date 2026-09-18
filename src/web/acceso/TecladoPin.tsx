import { useEffect, useRef, useState } from 'preact/hooks';
import { api, ErrorApi } from '../api';
import type { UsuarioSesion } from './Acceso';

type Entrada = { id: string; nombre: string; rol: string };
const CLAVE_ULTIMO = 'ultimo_usuario';
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'borrar', '0', 'limpiar'];

function leerUltimo(): string {
  try { return localStorage.getItem(CLAVE_ULTIMO) ?? ''; } catch { return ''; }
}

// capa=false: pantalla completa al entrar. capa=true: encima de la pantalla
// cuando la sesión venció (la pantalla de abajo sigue montada). En los dos
// casos se puede escribir con el teclado físico de la PC (dígitos, Retroceso
// y Escape) además de los botones.
export function TecladoPin({ capa, alEntrar }: { capa: boolean; alEntrar: (u: UsuarioSesion) => void }) {
  const [usuarios, setUsuarios] = useState<Entrada[]>([]);
  const [elegido, setElegido] = useState(leerUltimo);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/api/sesion/usuarios').then((lista: Entrada[]) => {
      setUsuarios(lista);
      setElegido((actual) => (lista.some((u) => u.id === actual) ? actual : (lista[0]?.id ?? '')));
    }).catch((e: ErrorApi) => setError(e.message));
    // Al aparecer, el foco pasa al teclado: si había un campo de la pantalla
    // de abajo con foco, lo que se teclee no va a parar ahí.
    (document.activeElement as HTMLElement | null)?.blur?.();
    contenedor.current?.focus();
  }, []);

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      // El PIN viaja como texto de 4 dígitos, nunca como número.
      const r = await api.post('/api/sesion', { usuario_id: elegido, pin });
      try { localStorage.setItem(CLAVE_ULTIMO, elegido); } catch { /* sin almacenamiento, no pasa nada */ }
      setPin('');
      alEntrar(r.usuario);
    } catch (e) {
      // "PIN incorrecto" o "Demasiados intentos": el mensaje viene del servidor y no dice si el usuario existe.
      setError((e as ErrorApi).message);
      setPin('');
    } finally {
      setEnviando(false);
    }
  };

  useEffect(() => {
    if (pin.length === 4 && elegido && !enviando) enviar();
  }, [pin]);

  const tecla = (t: string) => {
    setError(null);
    if (t === 'borrar') setPin((p) => p.slice(0, -1));
    else if (t === 'limpiar') setPin('');
    else setPin((p) => (p.length < 4 ? p + t : p));
  };

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (enviando || !elegido) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // Dentro del selector de nombre, las teclas son suyas.
      if ((e.target as HTMLElement | null)?.tagName === 'SELECT') return;
      if (/^\d$/.test(e.key)) tecla(e.key);
      else if (e.key === 'Backspace') tecla('borrar');
      else if (e.key === 'Escape') tecla('limpiar');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [enviando, elegido]);

  return (
    <div class={capa ? 'capa-bloqueo' : 'contenido pantalla-pin'}>
      <div class="teclado-pin" ref={contenedor} tabIndex={-1}>
        <h1>{capa ? 'La sesión venció: escribe tu PIN' : 'Entrar'}</h1>
        <label>Quién eres
          <select value={elegido} onChange={(e) => { setElegido((e.target as HTMLSelectElement).value); setPin(''); setError(null); }}>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </label>
        <div class="puntos" aria-label={`${pin.length} de 4 dígitos`}>
          {[0, 1, 2, 3].map((i) => <span key={i} class={i < pin.length ? 'punto lleno' : 'punto'} />)}
        </div>
        <div class="teclas">
          {TECLAS.map((t) => (
            <button key={t} type="button" disabled={enviando || !elegido} onClick={() => tecla(t)}>
              {t === 'borrar' ? '←' : t === 'limpiar' ? 'C' : t}
            </button>
          ))}
        </div>
        {error && <div class="aviso error">{error}</div>}
        {usuarios.length === 0 && !error && <p>No hay usuarios con PIN. Un administrador debe crearlos desde la PC de caja.</p>}
      </div>
    </div>
  );
}
