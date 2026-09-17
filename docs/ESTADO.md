# ESTADO DEL PROYECTO

Actualizado: 2026-09-17 (Tarea 7 del plan 1, pantalla de admin)

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
- Plan 1 en ejecución. Tareas 1 a 6 terminadas y verificadas: proyecto base, esquema de 16 tablas migrado, servidor Fastify con manejo de errores y bus de eventos SSE, la API de configuración del local y de meseros (`GET/PATCH /api/admin/configuracion`, `GET/POST /api/admin/meseros`, `PATCH /api/admin/meseros/:id`), y el catálogo (`src/servidor/modulos/catalogo.ts`): categorías, productos con precio y control de stock, `POST /api/admin/productos/:id/stock` con registro en `movimiento_stock`, `POST /api/admin/productos/:id/foto` (multipart, sirve `/fotos/<id>.<ext>`) y `GET /api/catalogo` solo con categorías y productos activos. Ronda de arreglo 1 de la Tarea 4 (revisión de calidad): validación de tipos completa en ambos módulos (rechaza booleanos como texto, `null` en campos de texto, cuerpos que no son objeto, umbrales desmesurados), reactivar un mesero ya verifica nombre único, `exigirUuid`/`exigirObjeto` compartidos en `src/servidor/errores.ts`, e índice único parcial `mesero_nombre_activo_unico` (migración 0003) con traducción del 23505 de Postgres a 409. Tarea 5 aplicó la misma validación estricta (el brief traía validación laxa, corregida antes de ejecutar) y confirmó que `@fastify/static@10.1.3` acepta `root`/`prefix`/`decorateReply` igual que la versión con la que se escribió el brief. Ronda de arreglo 1 de la Tarea 5 (revisión de calidad, un hallazgo crítico): la simplificación de `editarProducto` de la ejecución original abría una puerta trasera (`PATCH {controla_stock:true, stock_actual:N}` sobre un producto que ya controlaba stock cambiaba el stock sin pasar por el ajuste, sin motivo y sin movimiento); se restauró la guarda del brief. Además: crear un producto con stock, y activar o desactivar el control de stock, ahora registran su propio `movimiento_stock` en la misma transacción; `exigirMonto` compartido en `errores.ts` endurece el precio (tope 99999999.99, decimales comparados en texto, ya no en 500 al desbordar `numeric(10,2)`); la subida de foto exige el campo `foto`, verifica los bytes reales del archivo contra el mimetype declarado, traduce 413/406 de `@fastify/multipart` y borra la foto anterior al cambiar de extensión. Tarea 6 añadió la web: Preact 10 + Vite 6 en `src/web` (raíz `src/web`, salida `dist/web`), cliente `api.ts` (get/post/patch/del/subirArchivo), `eventos.ts` con `useEventos` (EventSource a `/api/eventos`, reconecta cada 2 s) y `useEstado` (carga y recarga `/api/estado` con los eventos `jornada`/`config`), y las 4 apps por puesto (`AppMesero`/`AppCocina` ya leen `useEstado`; `AppAdmin`/`AppCaja` eran placeholders para las tareas 7 y el plan 2). `src/servidor/app.ts` registra un segundo `@fastify/static` (`prefix: '/'`, `decorateReply: true`, `index: false`, `wildcard: false`, solo si existe `dist/web/index.html`) y sirve `index.html` en `/`, `/admin`, `/mesero`, `/caja`, `/cocina`; `/fotos/` y el 404 JSON de `/api` siguen intactos. Tarea 7 (última del plan 1) construyó la pantalla de admin: `src/web/componentes/Aviso.tsx`, `src/web/admin/AppAdmin.tsx` (pestañas Configuración/Meseros/Menú), `Configuracion.tsx`, `Meseros.tsx` y `Menu.tsx` (categorías, productos con precio, control de stock y ajuste con motivo, fotos). El código del brief ya enviaba los tipos correctos (números y booleanos donde el servidor endurecido de las tareas 4-5 los exige; `descripcion: null` cuando está vacía, aceptado por `catalogo.ts`), así que se usó tal cual, sin cambios. Verificado en vivo con Chromium headless de Playwright contra la base `cafeteria`: cambio de nombre del local reflejado sin recargar, error de mesero duplicado, creación de categorías/productos, ajuste de stock a 20 con motivo confirmado por `curl /api/catalogo`, y subida de foto visible en la tabla. Reporte completo: `.superpowers/sdd/2026-09-15-plan-1-cimientos/task-7-report.md`. 66 pruebas pasan, `npm run typecheck` sin errores.

## Decisiones técnicas tomadas durante la ejecución, por si hay que revisarlas
- **`npm run build` no compila el servidor con `tsc` (2026-09-17, Tarea 6):** `tsc -p tsconfig.servidor.json` falla porque `module: NodeNext` exige extensión `.js` en los imports relativos del código servidor, que no la llevan. `build` quedó en `vite build` (solo la web) y `start` en `tsx src/servidor/index.ts`. Nadie usa la salida compilada de `dist/servidor`: el desarrollo corre con `tsx` y la entrega del plan 4 empaqueta con `esbuild`. Si el plan 4 decide compilar el servidor con `tsc` en vez de `esbuild`, hay que añadir `.js` a todos los imports relativos primero.
- **Dependencias subidas por seguridad (2026-09-15):** `@fastify/static` a 10.1.3 y `drizzle-orm` a 0.45.2, por fallos de severidad alta (path traversal e inyección SQL). `vitest`, `drizzle-kit` y `esbuild` se dejan como están: son de desarrollo y el arreglo que npm propone para drizzle-kit es un downgrade.
- **Validaciones de rango solo en el servidor:** la base de datos no lleva restricciones `CHECK` para montos, cantidades, precios ni stock, ni para la coherencia entre `es_libre` y `producto_id`. La spec pone esas reglas en el servidor (reglas 2, 7 y 16) y los planes 2 y 3 las implementan con pruebas. Si algún día se quiere defensa en profundidad, se añaden en una migración nueva, con cuidado: `movimiento_stock.cantidad` es un delta con signo y sí puede ser negativo.
- **`actualizado_en` se actualiza solo** vía `$onUpdate` de Drizzle, que cubre las escrituras hechas con Drizzle pero no las hechas con SQL crudo. Si en algún plan se escribe con SQL crudo, hay que poner el campo a mano o añadir un disparador.
- **Faltan índices sobre claves foráneas de alto tráfico** (`pedido_item.ronda_id`, `pago.cuenta_id`, `abono.encargo_id`, `encargo_item.encargo_id`). Irrelevante en una base de este tamaño; revisar solo si aparece lentitud.

## Decisiones tomadas durante la ejecución
- Las 30 decisiones que el orquestador tomó sin consultar durante el plan 1, con su motivo y su costo si son erróneas, están en `docs/decisiones-plan-1.md`. Conviene que Dave las repase.

## Riesgos aceptados
- **Sin contraseñas.** Es la decisión de diseño del 2026-09-12: cualquier dispositivo conectado a la WiFi del local que conozca la dirección puede abrir `/admin` y cambiar precios, stock o el menú. Los cambios de stock dejan rastro en movimientos; los de precio, no. Mitigación práctica: usar una WiFi con contraseña y no compartirla con clientes. Si algún día molesta, se añade un PIN para admin.

## Menú real (2026-09-17)
- Carta de Delicadas transcrita: `docs/menu/menu-delicadas.md`. En formato del sistema: `src/servidor/recursos/menu-delicadas.csv` (28 productos, 4 categorías).
- Decisiones de Dave: categorías Tradicionales, Chochos y ceviches, Tostadas y sanduches, Bebidas; stock contado en tortillas de maíz con queso, quimbolitos, humitas y tamales de gallina; ceviche familiar con sardina y con atún como dos productos; el menú ficticio de ejemplo se reemplaza por el real.
- Nueva función aprobada: carga masiva del menú por CSV, para esta y otras cafeterías. Si el producto existe se actualiza; filas con error no se cargan y se listan; vista previa antes de confirmar; el stock existente nunca cambia por CSV. Spec 4.6 y regla 20; formato para usuarios en `docs/menu/formato-csv.md`; plantilla en `src/servidor/recursos/plantilla-menu.csv`. Se construye en el plan 3, tareas 6 y 7.
- Nombre del local confirmado por la carta: Delicadas.

## Pendientes de decisión (preguntar a Dave o al propietario)

Ninguno bloquea el trabajo. Todos tienen una respuesta por defecto ya construida o planificada; si Dave no dice lo contrario, se queda como está.

1. **Aprobación del propietario sobre la propuesta** (`docs/propuesta-nucleo-pos.html`). Dave la aprobó a nivel de diseño el 2026-09-12; el propietario de la cafetería no se ha pronunciado. No bloquea: el plan 1 ya está construido.
2. **Referencia opcional en cada pago** (últimos dígitos de tarjeta o número de transferencia). Construida en el plan 2 salvo que Dave la quite.
3. **Exportar reportes a CSV.** Construido en el plan 3 salvo que Dave lo quite.
4. **Valores de configuración del primer día:** cantidad de mesas, umbral de stock bajo (por defecto 5) y propina sugerida (por defecto 0). No hace falta decidirlos ahora: se escriben en Admin, pestaña Configuración, cuando el sistema se instale. El nombre del local ya se sabe por la carta: Delicadas.
5. **Menú:** resuelto el 2026-09-17. Categorías, productos con stock contado y carga masiva por CSV: ver `docs/menu/menu-delicadas.md`.

## Siguiente paso exacto
- **Plan 1 terminado** el 2026-09-17 (commits 8aebf5a..06bf176). Verificado: `npm run typecheck`, `npm run build` y 85 pruebas en verde. Revisión final de toda la rama: sin hallazgos críticos, sus cuatro condiciones aplicadas y re-revisadas.
- Siguiente: ejecutar el plan 2, `docs/superpowers/plans/2026-09-15-plan-2-operacion.md` (8 tareas: jornada, pedidos, rondas con stock, cuentas divididas, pagos, clientes, ticket, pantallas de mesero y caja).
- Orquestador: `superpowers:subagent-driven-development`. Ejecutor de cada tarea: el modelo del encabezado del plan (`claude-fable-5-1` en las tareas 3 y 4 por concurrencia y dinero; `claude-sonnet-5` en el resto) con `superpowers:test-driven-development`. Revisor: `claude-fable-5-1` con `superpowers:requesting-code-review` y sondeo en vivo. Cierre de cada tarea con `superpowers:verification-before-completion`.
- Prerrequisito de entorno: `open -a OrbStack` y `docker start cafeteria-pg`. Node 22+.
- Antes de empezar, el plan 2 debe hacer estos cambios que el plan 1 dejó apuntados: mover la consulta de jornada que hoy está dentro de `/api/estado` al módulo de jornada de la tarea 2; usar `exigirMonto` con mínimo para pagos, abonos y egresos; y usar el tipo `Tx` exportado desde `db/conexion.ts`.

## Cómo probarlo hoy
1. `open -a OrbStack`, esperar, y `docker start cafeteria-pg`.
2. En el proyecto: `npm run build` y luego `npm run dev`.
3. Abrir `http://127.0.0.1:3000/admin`. Funcionan configuración, meseros y menú con stock y fotos. `/mesero` y `/caja` dirán que están en construcción hasta el plan 2.

## Pasos posteriores, en orden
1. Ejecutar plan 2 (modelos por tarea en su encabezado: Fable en tareas 3 y 4, Sonnet en el resto). Terminado cuando el día completo de la Task 8 se verificó a mano.
2. Ejecutar plan 3. 3. Ejecutar plan 4; su Task 3 exige probar en la PC Windows de caja.
4. Al entregar el Núcleo: `superpowers:brainstorming` para el módulo 2, Menú digital.
