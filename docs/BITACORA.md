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
