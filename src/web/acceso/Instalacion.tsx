import { useState } from 'preact/hooks';
import { api, ErrorApi } from '../api';

// Primer arranque (spec 5.1): solo la PC de caja llega aquí. Crea el primer
// administrador y entra a /admin con la sesión ya iniciada (la cookie la
// pone el servidor; la pantalla nunca ve el token).
export function Instalacion() {
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [yaConfigurado, setYaConfigurado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: Event) => {
    e.preventDefault();
    setError(null);
    if (pin !== confirmacion) { setError('Los PIN no coinciden'); return; }
    setEnviando(true);
    try {
      await api.post('/api/instalacion', { nombre, pin });
      location.href = '/admin';
    } catch (err) {
      const e2 = err as ErrorApi;
      // 409: alguien terminó la instalación antes (otra pestaña). No lleva
      // código; se distingue por el estado. Lo que toca es ir a entrar.
      setYaConfigurado(e2.estado === 409);
      setError(e2.message);
      setEnviando(false);
    }
  };

  return (
    <div class="contenido">
      <h1>Configuración inicial</h1>
      <p>Crea el primer usuario administrador. Este paso se hace una sola vez, en la PC de caja.</p>
      <form onSubmit={enviar} style="display:grid;gap:12px;max-width:360px">
        <label>Nombre del administrador<input value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} /></label>
        <label>PIN (4 dígitos)<input type="password" inputMode="numeric" maxLength={4} value={pin} onInput={(e) => setPin((e.target as HTMLInputElement).value)} /></label>
        <label>Repite el PIN<input type="password" inputMode="numeric" maxLength={4} value={confirmacion} onInput={(e) => setConfirmacion((e.target as HTMLInputElement).value)} /></label>
        {error && <div class="aviso error">{error}</div>}
        {yaConfigurado
          ? <button class="primario" type="button" onClick={() => { location.href = '/admin'; }}>Ir a entrar con PIN</button>
          : <button class="primario" type="submit" disabled={enviando}>Crear administrador y entrar</button>}
      </form>
    </div>
  );
}
