# ESTADO DEL PROYECTO

Actualizado: 2026-09-15 (tarde)

## Dónde estamos
- Módulo 1, Núcleo POS: diseño terminado y aprobado por Dave, incluyendo los 4 casos del 2026-09-14: encargos con abono, ítem libre, cliente con solo nombre, ticket sin leyenda de impuestos. Spec: `docs/superpowers/specs/2026-09-12-nucleo-pos-design.md`.
- Propuesta para el propietario: `docs/propuesta-nucleo-pos.html`. Pendiente de su aprobación.
- Dave dio luz verde el 2026-09-15 ("listo, sigue"). Plan de implementación en 4 partes: 1 Cimientos, 2 Operación, 3 Complementos, 4 Entrega.
- Los 4 planes están escritos y subidos, en `docs/superpowers/plans/`:
  1. `2026-09-15-plan-1-cimientos.md` (7 tareas): proyecto, esquema, servidor, catálogo, admin.
  2. `2026-09-15-plan-2-operacion.md` (8 tareas): jornada, pedidos, rondas, cuentas, pagos, clientes, ticket, mesero, caja.
  3. `2026-09-15-plan-3-complementos.md` (6 tareas): cocina, egresos, encargos, reportes, clientes admin, datos de ejemplo.
  4. `2026-09-15-plan-4-entrega.md` (5 tareas): logs, respaldos, lanzador Windows y empaquetado, E2E, manual.
- Dave pidió terminar los 4 planes antes de escribir código. Hecho.
- No hay código todavía.

## Pendientes de decisión (preguntar a Dave o al propietario)
1. Aprobación del propietario sobre la propuesta.
2. Referencia opcional por pago: mantener o quitar.
3. Exportar reportes a CSV: mantener o quitar.
4. Nombre del local, cantidad de mesas, umbral de stock bajo (propuesto 5), propina sugerida.

## Siguiente paso exacto
- Ejecutar el plan 1, tarea por tarea y en orden.
- Modelo: `claude-fable-5-1`.
- Skill: `superpowers:subagent-driven-development` (o `superpowers:executing-plans` en sesión nueva sin subagentes), con `superpowers:test-driven-development` en cada tarea y `superpowers:verification-before-completion` al cerrar cada una.
- Entrada: `CLAUDE.md`, `docs/superpowers/plans/2026-09-15-plan-1-cimientos.md`, `docs/superpowers/specs/2026-09-12-nucleo-pos-design.md`.
- Prerrequisito de entorno: Docker en marcha (`docker ps` responde). Node 22+.
- Salida: código en `src/` y `tests/`, un commit por tarea en `origin/main`.
- Terminado cuando: `npm run typecheck && npm run build && npm test` pasa y la verificación manual de la Task 7 del plan 1 se cumplió, y `docs/ESTADO.md` dice "Plan 1 terminado".

## Pasos posteriores, en orden
1. Ejecutar plan 2 (mismo modelo y skills). Terminado cuando el día completo de la Task 8 se verificó a mano.
2. Ejecutar plan 3. 3. Ejecutar plan 4; su Task 3 exige probar en la PC Windows de caja.
4. Al entregar el Núcleo: `superpowers:brainstorming` para el módulo 2, Menú digital.
