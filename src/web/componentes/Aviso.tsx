export function Aviso({ tipo, texto }: { tipo: 'ok' | 'error'; texto: string | null }) {
  if (!texto) return null;
  return <div class={`aviso ${tipo}`}>{texto}</div>;
}
