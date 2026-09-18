# Fase 2 — Seguridad para entrar al sistema

Fase 2 de 5. Las demás están en esta misma carpeta, una por fase.
**Estado:** en construcción. Las 7 tareas de entrada con PIN, aparatos y roles están hechas y en revisión final. Falta el cifrado de la comunicación, aprobado el 2026-09-18. Cuando esté, pruebas todo una sola vez.

## Pendientes

Nada. Te aviso cuando haya algo que probar.

## Ya aprobado

Las 10 decisiones de cómo se entra al sistema (quién entra a qué, clave de 4 números, aparatos autorizados, qué pasa si se olvida la clave del administrador, y el registro de cambios de precio) agregar un párrafo de seguridad a la propuesta para el dueño, y que cambiarle los 4 números a alguien lo saque al instante de donde tenga abierto. El detalle quedó en `docs/BITACORA.md`.

**Aprobado el 2026-09-18: cifrado.** Toda la comunicación entre los aparatos y la PC de caja va cifrada, con un "sello" propio de la cafetería que cada aparato del local instala una sola vez, al autorizarlo, **con el local cerrado**. Si cambia la dirección de la PC o pasa un año, se renueva solo.

## Para probar

Nada todavía: esta fase aún no está construida. Cuando lo esté, aquí van los pasos en orden, con lo que deberías ver en cada uno.
