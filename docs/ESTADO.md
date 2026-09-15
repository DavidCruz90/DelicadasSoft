# ESTADO DEL PROYECTO

Actualizado: 2026-09-15

## Dónde estamos
- Módulo 1, Núcleo POS: diseño terminado y aprobado por Dave, incluyendo los 4 casos del 2026-09-14: encargos con abono, ítem libre, cliente con solo nombre, ticket sin leyenda de impuestos. Spec: `docs/superpowers/specs/2026-09-12-nucleo-pos-design.md`.
- Propuesta para el propietario: `docs/propuesta-nucleo-pos.html`. Pendiente de su aprobación.
- Dave dio luz verde el 2026-09-15 ("listo, sigue"). Plan de implementación en 4 partes: 1 Cimientos, 2 Operación, 3 Complementos, 4 Entrega.
- Plan 1 escrito: `docs/superpowers/plans/2026-09-15-plan-1-cimientos.md` (7 tareas). Planes 2, 3 y 4 pendientes de escribir.
- No hay código todavía.

## Pendientes de decisión (preguntar a Dave o al propietario)
1. Aprobación del propietario sobre la propuesta.
2. Referencia opcional por pago: mantener o quitar.
3. Exportar reportes a CSV: mantener o quitar.
4. Nombre del local, cantidad de mesas, umbral de stock bajo (propuesto 5), propina sugerida.

## Siguiente paso exacto
- Modelo: `claude-fable-5-1`.
- Skill: `superpowers:subagent-driven-development` (o `superpowers:executing-plans` si es una sesión nueva sin subagentes), con `superpowers:test-driven-development` en cada tarea y `superpowers:verification-before-completion` al cerrar cada una.
- Entrada: `CLAUDE.md`, `docs/superpowers/plans/2026-09-15-plan-1-cimientos.md`, `docs/superpowers/specs/2026-09-12-nucleo-pos-design.md`.
- Salida: código en `src/` y `tests/`, un commit por tarea, todo en `origin/main`.
- Terminado cuando: `npm run typecheck && npm run build && npm test` pasa sin errores y la verificación manual de la Task 7 se cumplió.

## Paso posterior
- Escribir plan 2 (Operación: jornada, pedidos, rondas, stock, cuentas, pagos, ticket, pantallas mesero y caja). Modelo `claude-fable-5-1`, skill `superpowers:writing-plans`, entrada: spec + plan 1. Salida: `docs/superpowers/plans/AAAA-MM-DD-plan-2-operacion.md`.
- Luego plan 3 (cocina, egresos, encargos, ítems libres, clientes, reportes) y plan 4 (respaldos, lanzador Windows, ejecutable, pruebas extremo a extremo), mismo modelo y skill.
