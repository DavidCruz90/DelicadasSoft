# LEY DEL PROYECTO

1. Toda respuesta al usuario empieza con **Dave**. Todo en español.
2. Nada queda en la sesión ni en la memoria del modelo. **La fuente de verdad es este repositorio.** Antes de terminar cada turno se escribe aquí y se hace `git push origin main`. La memoria privada del agente no se usa como registro; como máximo contiene una línea que remite a este archivo.
   - Todo aprendizaje (error cometido, decisión con su motivo, dato del entorno, preferencia de Dave) se escribe en `docs/APRENDIZAJES.md` con fecha, qué pasó, qué se aprendió y cómo aplicarlo. Se lee al empezar cada sesión.
3. Sin supuestos. Lo que no está escrito en `docs/` se pregunta o se anota como pendiente en `docs/ESTADO.md`.
4. Todo se escribe para que cualquier agente lo despache: cada tarea indica **modelo** exacto, **skill** exacta, archivos de entrada, archivos de salida y comando de verificación con resultado esperado. Pasos numerados, en orden.
   - **Nunca un modelo por defecto.** Cada tarea nombra su modelo y el motivo. Regla de elección: `claude-sonnet-5` cuando el plan ya trae código, pruebas y verificación completos (ejecutar fielmente); `claude-fable-5-1` cuando hay que decidir, diseñar, depurar o manejar dinero y concurrencia; `claude-fable-5-1` siempre como revisor de cada tarea y para escribir specs y planes.
   - Cada tarea lleva revisor: `superpowers:requesting-code-review` contra la spec y luego calidad; el ejecutor responde con `superpowers:receiving-code-review`.
5. Archivos obligatorios: `docs/ESTADO.md` (estado y siguiente paso), `docs/BITACORA.md` (qué se hizo, por fecha), `docs/APRENDIZAJES.md` (qué se aprendió), `docs/superpowers/specs/` (diseños), `docs/superpowers/plans/` (planes). Orden de lectura al empezar: CLAUDE.md, ESTADO.md, APRENDIZAJES.md, y luego lo que ESTADO.md indique.
6. Flujo: `superpowers:brainstorming` → spec → `superpowers:writing-plans` → plan → `superpowers:subagent-driven-development` con `superpowers:test-driven-development` → `superpowers:verification-before-completion` → push.
7. Cada cambio de diseño se refleja en la spec, en `docs/propuesta-nucleo-pos.html` y en `docs/ESTADO.md`.

Contexto fijo: POS para cafetería en Ecuador, 4 módulos en orden (Núcleo POS, Menú digital, Facturación SRI, Wallet). Dave no programa: todo desde pantalla, doble clic en Windows. Stack: Node.js 22 + TypeScript, Fastify, Drizzle, PostgreSQL 16 portátil, Preact + Vite, Vitest, Playwright. SQLite rechazado. Remoto: https://github.com/DavidCruz90/DelicadasSoft.git rama `main`.
