import { afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Corre antes de cada archivo de pruebas (setupFiles en vitest.config.ts),
// antes de que src/servidor/config.ts lea el entorno: las fotos que suben
// las pruebas van a una carpeta temporal propia y se borran al terminar,
// nunca a fotos/ del repositorio (la carpeta real de producción).
const carpeta = mkdtempSync(join(tmpdir(), 'cafeteria-fotos-prueba-'));
process.env.CARPETA_FOTOS = carpeta;

afterAll(() => {
  rmSync(carpeta, { recursive: true, force: true });
});
