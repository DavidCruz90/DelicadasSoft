// Sin nombre del local, sin menú, sin nada del negocio (spec 8).
export function DispositivoNoAutorizado({ codigo }: { codigo: string }) {
  return (
    <div class="contenido pantalla-codigo">
      <h1>Este dispositivo no está autorizado</h1>
      <p>Pide al administrador que lo autorice desde la PC de caja con este código:</p>
      <div class="codigo-grande">{codigo || '····'}</div>
      <p>Esta pantalla seguirá sola cuando lo autoricen.</p>
    </div>
  );
}
