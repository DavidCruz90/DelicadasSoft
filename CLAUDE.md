# LEY DEL PROYECTO

1. Toda respuesta al usuario empieza con **Dave**. Todo en español.
2. Nada queda en la sesión ni en la memoria del modelo. Antes de terminar cada turno se escribe en el repositorio y se hace `git push origin main`.
3. Sin supuestos. Lo que no está escrito en `docs/` se pregunta o se anota como pendiente en `docs/ESTADO.md`.
4. Todo se escribe para que cualquier agente lo despache: cada tarea indica **modelo** exacto, **skill** exacta, archivos de entrada, archivos de salida y comando de verificación con resultado esperado. Pasos numerados, en orden.
5. Archivos obligatorios: `docs/ESTADO.md` (estado y siguiente paso), `docs/BITACORA.md` (qué se hizo, por fecha), `docs/superpowers/specs/` (diseños), `docs/superpowers/plans/` (planes).
6. Flujo: `superpowers:brainstorming` → spec → `superpowers:writing-plans` → plan → `superpowers:subagent-driven-development` con `superpowers:test-driven-development` → `superpowers:verification-before-completion` → push.
7. Cada cambio de diseño se refleja en la spec, en `docs/propuesta-nucleo-pos.html` y en `docs/ESTADO.md`.

Contexto fijo: POS para cafetería en Ecuador, 4 módulos en orden (Núcleo POS, Menú digital, Facturación SRI, Wallet). Dave no programa: todo desde pantalla, doble clic en Windows. Stack: Node.js 22 + TypeScript, Fastify, Drizzle, PostgreSQL 16 portátil, Preact + Vite, Vitest, Playwright. SQLite rechazado. Remoto: https://github.com/DavidCruz90/DelicadasSoft.git rama `main`.
