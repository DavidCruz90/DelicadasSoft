# BITÁCORA

## 2026-09-12
1. Carpeta vacía. Se hizo brainstorming (`superpowers:brainstorming`) con Dave.
2. Decisiones: red local con servidor en PC de caja Windows; sin login, meseros desde lista en admin; stock mixto por producto, bloqueo en cero; cobro con varios métodos, descuento, propina, ticket desde navegador; jornada con apertura y cierre; egresos con tipo; cocina opcional (Pendiente/Listo) que nunca bloquea; nada opera sin apertura de caja; precios con impuesto incluido; Ecuador.
3. Dave rechazó SQLite y eligió PostgreSQL. Agregó 3 módulos futuros. Orden: POS, Menú digital, Facturación SRI, Wallet.
4. Se escribió la spec y la propuesta HTML. `git init`, commits.

## 2026-09-13
1. Dave preguntó por pago con dos métodos: sí, varios pagos por cuenta.
2. Dave pidió dividir cuenta por persona. Aprobó Opción B: tabla `cuenta` entre `pedido` y `pago`; división opcional, solo en caja al cobrar; cliente, descuento, propina, pagos y ticket por cuenta. Spec y HTML actualizados.
3. Remoto GitHub `DelicadasSoft` conectado y `main` subido.

## 2026-09-14
1. Dave dictó la LEY del proyecto. Se creó `CLAUDE.md`, `docs/ESTADO.md` y este archivo. Subido a `origin/main`.
2. Dave entregó 4 casos y dijo "eso es todo". Se procesaron juntos:
   - Caso 1, encargos con abono: nuevas tablas `encargo`, `encargo_item`, `abono`; caja de encargos como saldo aparte; venta y ticket el día de entrega; no tocan stock; solo caja; al cancelar, caja elige devolver o retener. Dave respondió las 3 preguntas eligiendo las opciones recomendadas.
   - Caso 2, ítem libre: texto y valor, mesero y caja, sin stock, parametrizable en admin (`permitir_items_libres`).
   - Caso 3, cliente: solo nombre obligatorio; SRI exigirá el resto al facturar.
   - Caso 4, ticket sin leyenda de impuestos.
   Spec sección 4.4 nueva, reglas 15 a 19, API de encargos, pantallas, ticket y pruebas actualizados. Propuesta HTML y artifact actualizados. Subido a `origin/main`.

## 2026-09-15
1. Dave: "listo, sigue". Se tomó como luz verde para planificar la implementación.
2. Verificado en esta Mac: Node 24.19, npm 11.17, Docker 29.4. Sin psql, pg_ctl ni brew. PostgreSQL de desarrollo y pruebas irá en Docker (`cafeteria-pg`, puerto 5433).
3. Con `superpowers:writing-plans` se decidió dividir en 4 planes. Se escribió el plan 1 (Cimientos): proyecto, esquema completo de 16 tablas en Drizzle, migraciones, servidor Fastify con errores y SSE, API de configuración, meseros y catálogo con stock y fotos, web Preact + Vite servida por Fastify, pantalla de admin. Subido a `origin/main`.
4. Dave eligió "escribe primero los planes 2, 3 y 4" antes de ejecutar. Se escribieron los tres con `superpowers:writing-plans`: plan 2 Operación (8 tareas), plan 3 Complementos (6 tareas), plan 4 Entrega (5 tareas). Total 26 tareas con código, pruebas, comando de verificación y commit cada una.
5. Ajuste de diseño detectado al planificar y reflejado en la spec: cualquier cuenta vacía se puede eliminar mientras quede al menos una (antes la cuenta 1 no se podía eliminar). Pendiente reflejarlo en `docs/propuesta-nucleo-pos.html` al cerrar el plan 2.
6. Todo subido a `origin/main`. Siguiente paso en `docs/ESTADO.md`: ejecutar el plan 1.
7. Dave preguntó por qué todas las tareas usaban Fable. Respuesta: fue un valor por defecto, contrario a la ley. Se asignó modelo por tarea con motivo: Sonnet 5 en 20 tareas de ejecución fiel; Fable 5.1 en plan 2 tareas 3 y 4, plan 3 tarea 3, plan 4 tareas 3 y 4, y como revisor de todas. Regla "nunca un modelo por defecto" añadida a CLAUDE.md. Dave: "nada de poner las cosas por defecto".
8. Dave: "NADA DE MEMORIA y todo lo importante y los aprendizajes escritos". Se creó `docs/APRENDIZAJES.md` con lo aprendido del 12 al 15 de septiembre, se añadió a CLAUDE.md la regla de fuente de verdad y el orden de lectura, y la memoria privada del agente se redujo a una línea que remite al repo.
9. Dave preguntó qué pasa al cerrar caja con mesas abiertas. Respuesta: el cierre se bloquea con mensaje; cada mesa debe cobrarse o anularse. Se detectó el hueco "pago parcial y el cliente se fue" (no se podía anular por tener pagos). Dave aprobó la regla: anular con pagos exige elegir devolver (egreso de devolución automático) o retener (venta parcial con descuento igual al saldo). Aplicado en spec regla 10, plan 2 tareas 3 y 8, y propuesta HTML.
