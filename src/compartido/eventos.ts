// Nombres de los eventos que el servidor emite por /api/eventos (SSE) y que
// las pantallas escuchan. Es el único lugar donde se declaran: el servidor
// (src/servidor/eventos.ts) y la web (src/web/eventos.ts) importan de aquí,
// así un evento nuevo del plan 2 se añade una sola vez. Solo tipos: este
// archivo no puede importar nada de Node ni del navegador.
export type NombreEvento = 'jornada' | 'mesa' | 'stock' | 'catalogo' | 'config' | 'dispositivos';
