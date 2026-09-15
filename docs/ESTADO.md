# ESTADO DEL PROYECTO

Actualizado: 2026-09-14 (noche)

## Dónde estamos
- Módulo 1, Núcleo POS: diseño terminado y aprobado por Dave, incluyendo los 4 casos del 2026-09-14: encargos con abono, ítem libre, cliente con solo nombre, ticket sin leyenda de impuestos. Spec: `docs/superpowers/specs/2026-09-12-nucleo-pos-design.md`.
- Propuesta para el propietario: `docs/propuesta-nucleo-pos.html`. Pendiente de su aprobación.
- No hay código todavía.

## Pendientes de decisión (preguntar a Dave o al propietario)
1. Aprobación del propietario sobre la propuesta.
2. Referencia opcional por pago: mantener o quitar.
3. Exportar reportes a CSV: mantener o quitar.
4. Nombre del local, cantidad de mesas, umbral de stock bajo (propuesto 5), propina sugerida.

## Siguiente paso exacto
- Condición: propietario aprueba la propuesta.
- Modelo: `claude-fable-5-1`.
- Skill: `superpowers:writing-plans`.
- Entrada: `CLAUDE.md`, `docs/superpowers/specs/2026-09-12-nucleo-pos-design.md`.
- Salida: `docs/superpowers/plans/AAAA-MM-DD-nucleo-pos-plan.md`.
- Terminado cuando: el plan existe, cada tarea tiene archivos, código, comando de verificación y commit, y está subido a `origin/main`.

## Paso posterior
- Modelo: `claude-fable-5-1`. Skill: `superpowers:subagent-driven-development` con `superpowers:test-driven-development` por tarea. Entrada: el plan. Terminado cuando `npm test` pasa y el ejecutable arranca en Windows.
