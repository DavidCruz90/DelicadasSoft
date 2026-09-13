# Núcleo POS Cafetería — Diseño

Fecha: 2026-09-12
Estado: aprobado en conversación, pendiente de revisión escrita
Módulo: 1 de 4 (siguen: Menú digital, Facturación electrónica SRI, Wallet de fidelización)

## 1. Objetivo

Sistema para operar una cafetería en red local: tomar pedidos por mesa, ampliarlos, cobrarlos en caja, registrar egresos, controlar stock por producto con avisos, y opcionalmente mostrar pedidos en cocina. Lo opera y mantiene el dueño sin conocimientos de programación: arranca con doble clic, todo se configura desde pantalla.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Dispositivos | Varios en la red WiFi del local. Servidor en la PC de caja (Windows). Celulares y tablets abren el navegador. |
| Usuarios | Sin login ni contraseñas. Meseros se eligen de una lista definida en admin. |
| Stock | Por producto del menú. Cada producto decide si controla stock. Al llegar a cero se bloquea. |
| Cobro | Métodos efectivo, tarjeta, transferencia. Pagos múltiples (cuenta dividida). Descuento y propina. Ticket imprimible desde navegador (80 mm y hoja normal). |
| Impresora | No hay aún. El ticket se imprime desde el navegador. |
| Mesas | Cantidad fija configurable más "Para llevar". |
| Cocina | Opcional, informativa. Estados Pendiente y Listo. Nada depende de ella. |
| Jornada | Apertura y cierre de caja explícitos. Nada opera sin jornada abierta. |
| Egresos | Monto, tipo (compra de ingredientes, devolución a cliente, otro), motivo, pedido vinculado opcional. |
| Impuestos | Precios finales. Sin desglose de IVA en el Núcleo. |
| Moneda | Dólares, símbolo configurable. |
| Base de datos | PostgreSQL 16 desde el inicio, portátil dentro de la carpeta del programa. |
| Tecnología | Node.js 22 + TypeScript, Fastify, Drizzle ORM, Preact. |

## 3. Arquitectura

### 3.1 Componentes

```
Carpeta Cafeteria/
├── Cafeteria.exe          Lanzador: enciende PostgreSQL y el servidor, muestra dirección y QR
├── servidor/              Servidor Node.js empaquetado (API + pantallas estáticas)
├── pgsql/                 PostgreSQL 16 portátil (binarios EnterpriseDB zip)
├── datos/                 Directorio de datos de PostgreSQL
├── fotos/                 Imágenes de productos subidas desde admin
├── Respaldos/             Archivos .backup generados por pg_dump
└── logs/                  servidor.log
```

- **Lanzador** (`Cafeteria.exe`): ventana mínima. Al abrir: `pg_ctl start` sobre `datos/` (si `datos/` no existe, ejecuta `initdb` la primera vez), espera a que acepte conexiones, arranca el servidor Node, muestra `http://<IP local>:3000` como texto y QR, y un botón "Abrir caja" que lanza el navegador. Al cerrar la ventana: detiene el servidor y `pg_ctl stop`. Escrito en Node.js y empaquetado como ejecutable único (Node SEA) para no depender de una instalación de Node en la PC.
- **Servidor**: Fastify. Sirve las pantallas compiladas (Preact + Vite) como archivos estáticos y expone la API REST bajo `/api`. Un solo proceso.
- **Base de datos**: PostgreSQL local, puerto 5433 (para no chocar con una instalación previa), usuario `cafeteria`, sin acceso desde la red.
- **Pantallas**: `/mesero`, `/caja`, `/cocina`, `/admin`. Todas en español. Diseño táctil: botones grandes, sin menús hover.

### 3.2 Actualización en vivo

Cada pantalla abre una conexión Server-Sent Events a `/api/eventos`. El servidor emite eventos con nombre y datos mínimos; las pantallas vuelven a pedir lo que necesitan:

| Evento | Cuándo | Quién reacciona |
|---|---|---|
| `jornada` | Abierta o cerrada | Todas |
| `mesa` | Pedido creado, cobrado, anulado, ronda enviada o marcada lista | Mesero, caja, cocina |
| `stock` | Cualquier movimiento de stock | Mesero, caja, cocina, admin |
| `catalogo` | Producto o categoría cambia en admin | Mesero, caja, cocina |
| `config` | Configuración o lista de meseros cambia | Todas |

Si la conexión se cae, el cliente reintenta cada 2 s y al reconectar recarga el estado completo.

### 3.3 Respaldo

- Botón "Respaldar ahora" en admin: ejecuta `pg_dump -Fc` a `Respaldos/cafeteria-AAAA-MM-DD-HHMM.backup`. Incluye las fotos en un zip junto al backup.
- Respaldo automático al cerrar jornada.
- "Restaurar" en admin: elige un archivo de `Respaldos/`, pide confirmación escribiendo RESTAURAR, ejecuta `pg_restore --clean`. Solo permitido sin jornada abierta.

## 4. Modelo de datos

Nombres de tabla en singular, en español, sin tildes. Todas con `id` (uuid), `creado_en`, `actualizado_en`. Montos en `numeric(10,2)`.

### 4.1 Configuración y catálogo

**configuracion** (una sola fila)
- `nombre_local`, `simbolo_moneda` (por defecto `$`), `cantidad_mesas` (entero), `propina_sugerida_pct`, `umbral_stock_bajo` (entero, por defecto 5), `cocina_activa` (booleano, por defecto falso), `sonido_cocina` (booleano).

**mesero**
- `nombre`, `activo`.

**categoria**
- `nombre`, `orden`, `activa`.

**producto**
- `categoria_id`, `nombre`, `descripcion`, `precio`, `foto` (ruta relativa en `fotos/`, nulo si no hay), `activo`, `controla_stock` (booleano), `stock_actual` (entero, nulo si no controla), `orden`.

**movimiento_stock**
- `producto_id`, `jornada_id` (nulo si fuera de jornada), `cantidad` (positiva entra, negativa sale), `stock_resultante`, `origen` (enum: `venta`, `anulacion`, `ajuste_manual`, `apertura`), `motivo` (texto libre, obligatorio en ajuste manual), `pedido_item_id` (nulo salvo venta/anulación).

### 4.2 Operación

**jornada**
- `abierta_en`, `cerrada_en` (nulo mientras abierta), `fondo_inicial`, `efectivo_contado` (nulo hasta cerrar), y totales congelados al cerrar: `total_ventas`, `total_efectivo`, `total_tarjeta`, `total_transferencia`, `total_descuentos`, `total_propinas`, `total_egresos`, `efectivo_esperado`, `diferencia_efectivo`.
- Regla: solo una jornada con `cerrada_en` nulo a la vez (índice único parcial).

**pedido**
- `jornada_id`, `numero_mesa` (entero, 0 = para llevar), `numero` (secuencial dentro de la jornada, se muestra en ticket), `mesero_id`, `cliente_id` (nulo), `estado` (enum: `abierto`, `cobrado`, `anulado`), `descuento_tipo` (enum: `ninguno`, `monto`, `porcentaje`), `descuento_valor`, `propina`, `notas`, `cobrado_en`.
- Regla: una mesa con número > 0 tiene como máximo un pedido `abierto` (índice único parcial). "Para llevar" admite varios.

**ronda**
- `pedido_id`, `numero` (1, 2, 3… dentro del pedido), `origen` (enum: `mesero`, `caja`), `enviada_a_cocina` (booleano; falso cuando caja marca "ya servido"), `estado` (enum: `pendiente`, `lista`), `lista_en`, `aviso_visto_mesero`, `aviso_visto_caja` (booleanos para descartar el aviso de "Listo para servir").

**pedido_item**
- `ronda_id`, `producto_id`, `nombre_producto` (copiado), `precio_unitario` (copiado), `cantidad`, `nota`, `anulado` (booleano), `motivo_anulacion`, `anulado_en`.

**pago**
- `pedido_id`, `metodo` (enum: `efectivo`, `tarjeta`, `transferencia`), `monto`, `referencia` (texto libre opcional, por ejemplo últimos dígitos o número de transferencia).

**egreso**
- `jornada_id`, `tipo` (enum: `compra_ingredientes`, `devolucion_cliente`, `otro`), `monto`, `motivo`, `pedido_id` (nulo).

### 4.3 Clientes

**cliente**
- `nombre`, `tipo_identificacion` (enum: `cedula`, `ruc`, `pasaporte`, `consumidor_final`), `identificacion`, `correo`, `telefono`, `direccion`, `activo`.
- Índice único sobre (`tipo_identificacion`, `identificacion`) salvo consumidor final.
- Campos pensados para la Facturación SRI del módulo 3; el Núcleo solo los guarda y asocia al pedido.

### 4.4 Cálculo de totales de un pedido

```
subtotal   = suma de (precio_unitario × cantidad) de ítems no anulados
descuento  = 0 | descuento_valor | subtotal × descuento_valor / 100   (según descuento_tipo)
total      = subtotal − descuento + propina
pagado     = suma de pagos
saldo      = total − pagado
```

Redondeo a 2 decimales en cada paso. `descuento` nunca puede superar `subtotal`.

## 5. Reglas de negocio

1. **Nada sin jornada abierta.** Crear pedidos, enviar rondas, agregar ítems, cobrar, registrar egresos y ajustar stock desde caja requieren jornada abierta. Sin ella, mesero y cocina muestran "Caja cerrada". Admin permite catálogo, mesas, meseros, clientes, configuración y respaldos.
2. **Stock se descuenta al agregar el ítem**, dentro de una transacción con bloqueo de fila del producto. Si no alcanza, se rechaza con "Se acaba de agotar" y no se crea el ítem. Nunca queda negativo por ventas.
3. **Anular un ítem devuelve su stock** (movimiento `anulacion`). Solo caja anula ítems ya enviados; el mesero quita ítems solo antes de enviar la ronda (en ese caso nunca llegaron al servidor).
4. **Precio y nombre se copian al ítem.** Cambios en admin no alteran pedidos existentes.
5. **Rondas.** Cada envío del mesero crea una ronda `origen=mesero`, `enviada_a_cocina=true`. Cada agregado desde caja crea una ronda `origen=caja`; caja elige si va a cocina o "ya servido".
6. **Cocina no bloquea nada.** El estado de ronda es informativo. Con `cocina_activa=false` las pantallas de mesero y caja no muestran indicadores de "Listo para servir" y el lanzador no muestra el enlace de cocina.
7. **Cobro.** Se aceptan pagos parciales. Cuando `pagado >= total` el pedido pasa a `cobrado`, se fija `cobrado_en`, la mesa queda libre y se devuelve la URL del ticket. Se rechaza un pago que haga `pagado > total`.
8. **Pedido cobrado es inmutable.** Devoluciones posteriores se registran como egreso tipo `devolucion_cliente` vinculado al pedido.
9. **Anular pedido completo** (caja, con motivo): todos los ítems se anulan, stock devuelto, estado `anulado`, mesa libre. Solo si no tiene pagos.
10. **Apertura de caja** registra `fondo_inicial` y muestra los productos con stock para ajustar (cada ajuste genera movimiento `apertura`).
11. **Cierre de caja** exige que no haya pedidos `abiertos`. Calcula y congela totales. `efectivo_esperado = fondo_inicial + total_efectivo − total_egresos`. Caja ingresa `efectivo_contado`; `diferencia_efectivo = efectivo_contado − efectivo_esperado`. Genera respaldo automático.
12. **Avisos de stock.** `stock_actual <= umbral_stock_bajo` se muestra en amarillo con "Quedan N"; `0` en gris con "Agotado" y no seleccionable. Aplica en mesero, caja, admin y cocina (si activa).
13. **Idempotencia.** Cada envío de ronda y cada pago lleva un `id` generado en el cliente. Si el servidor ya lo tiene, responde con el resultado anterior sin duplicar.

## 6. API

Prefijo `/api`. JSON. Errores con `{ "error": "mensaje en español" }` y código HTTP 400/404/409.

| Método y ruta | Uso |
|---|---|
| `GET /estado` | Configuración pública, jornada actual, lista de meseros activos |
| `GET /eventos` | SSE |
| `GET /catalogo` | Categorías y productos activos con stock |
| `GET /mesas` | Mesas con estado, pedido abierto, total, aviso de ronda lista |
| `POST /pedidos` | Crear pedido `{numero_mesa, mesero_id}` |
| `GET /pedidos/:id` | Detalle con rondas, ítems, pagos, totales |
| `POST /pedidos/:id/rondas` | Enviar ronda `{id, origen, enviada_a_cocina, items:[{producto_id, cantidad, nota}]}` |
| `POST /pedidos/:id/items/:itemId/anular` | `{motivo}` |
| `PATCH /pedidos/:id` | Descuento, propina, cliente, notas |
| `POST /pedidos/:id/pagos` | `{id, metodo, monto, referencia}` |
| `POST /pedidos/:id/anular` | `{motivo}` |
| `GET /pedidos/:id/ticket` | HTML imprimible |
| `GET /cocina/rondas` | Rondas pendientes enviadas a cocina |
| `POST /rondas/:id/lista` | Marcar lista |
| `POST /rondas/:id/aviso-visto` | `{pantalla: mesero|caja}` |
| `POST /jornadas/abrir` | `{fondo_inicial, ajustes_stock:[{producto_id, stock}]}` |
| `POST /jornadas/cerrar` | `{efectivo_contado}` |
| `GET /jornadas` y `GET /jornadas/:id/reporte` | Historial y reporte de cierre, ventas por producto, stock restante |
| `GET/POST /egresos` | Listar de la jornada, crear |
| `GET/POST/PATCH /clientes` | Buscar por nombre o identificación, crear, editar |
| `GET/POST/PATCH /admin/categorias`, `/admin/productos` | Catálogo. Subida de foto en `POST /admin/productos/:id/foto` |
| `POST /admin/productos/:id/stock` | Ajuste manual `{stock, motivo}` |
| `GET/POST/PATCH /admin/meseros` | Lista de meseros |
| `GET/PATCH /admin/configuracion` | Configuración |
| `POST /admin/respaldos`, `GET /admin/respaldos`, `POST /admin/respaldos/restaurar` | Respaldos |
| `POST /admin/datos-ejemplo`, `POST /admin/datos-ejemplo/borrar` | Menú de ejemplo |
| `GET /admin/logs` | Descarga `servidor.log` |

## 7. Pantallas

### 7.1 Mesero `/mesero`
1. Primera vez: elegir nombre de la lista de meseros activos. Se guarda en el navegador. Botón "Cambiar" siempre visible.
2. Cuadrícula de mesas: libre (blanco), ocupada (azul, con total y hora del último envío), con ronda lista (verde parpadeante, si cocina activa). Botón "Para llevar" crea un pedido sin mesa.
3. Dentro de una mesa: lista de rondas ya enviadas (solo lectura) y una zona "Nueva ronda" donde agrega ítems desde el catálogo por categorías. Cada producto muestra precio y, si controla stock, "Quedan N". Toque agrega 1; controles +/−; campo de nota por ítem.
4. "Enviar a cocina" (o "Enviar" si cocina inactiva). La ronda pendiente se conserva en el navegador si se cae la red.
5. Si jornada cerrada: pantalla "Caja cerrada, no se pueden tomar pedidos".

### 7.2 Cocina `/cocina`
- Solo visible si `cocina_activa`; de lo contrario muestra "Pantalla de cocina desactivada. Actívala en Admin".
- Tarjetas de rondas pendientes ordenadas por hora: mesa, mesero, minutos de espera, ítems con cantidad y nota. Botón "Listo".
- Barra lateral con productos que controlan stock, resaltando bajo y agotado.
- Sonido corto al recibir ronda nueva, con botón de silencio.

### 7.3 Caja `/caja`
- Barra superior: estado de jornada, fondo inicial, ventas del día. Botones "Abrir caja" / "Cerrar caja".
- Sin jornada abierta solo se puede abrir caja. Al abrir: fondo inicial y tabla de stock editable.
- Mesas ocupadas con total y saldo. Dentro de una mesa:
  - Ítems por ronda con origen. "Agregar ítems" abre el catálogo; al confirmar elige "Enviar a cocina" o "Ya servido".
  - "Anular" por ítem con motivo. "Anular pedido" completo si no hay pagos.
  - Descuento (monto o %), propina (con sugerido), cliente (buscar por identificación o nombre, crear al vuelo), notas.
  - Pagos: lista de pagos registrados, formulario método + monto + referencia, botón "Cobrar exacto" que rellena el saldo. Al cubrir el total: pedido cobrado, se abre el ticket en pestaña nueva.
- "Egresos": lista de la jornada y formulario.
- "Cerrar caja": muestra resumen, pide efectivo contado, muestra diferencia, confirma, genera respaldo, imprime reporte de cierre.
- Indicador de ronda lista por mesa si cocina activa.

### 7.4 Admin `/admin`
- Menú: categorías (orden, activo) y productos (nombre, categoría, precio, descripción, foto, activo, controla stock, stock actual). Editar stock pide motivo.
- Meseros: alta, baja, activo.
- Mesas: cantidad. Cambiarla a menos exige que las mesas sobrantes estén libres.
- Clientes: listado, búsqueda, edición.
- Configuración: nombre del local, símbolo, propina sugerida, umbral de stock, cocina activa, sonido.
- Reportes: por jornada (actual e historial): cierre de caja, ventas por producto, stock restante, egresos. Exportar cada reporte a CSV.
- Respaldos: crear, listar, restaurar. Descargar log.
- Datos de ejemplo: cargar y borrar.

### 7.5 Ticket
HTML con CSS `@media print` para 80 mm y hoja A4. Contenido: nombre del local, número de pedido, mesa, mesero, fecha y hora, ítems (cantidad, nombre, precio, subtotal), ítems anulados omitidos, subtotal, descuento, propina, total, pagos por método, cliente (nombre e identificación) si hay. Pie: "Precios incluyen impuestos". Se abre con `window.print()`.

## 8. Manejo de errores

- **Concurrencia de stock**: transacción con `SELECT … FOR UPDATE` sobre el producto. Segundo pedido recibe 409 "Se acaba de agotar".
- **Red caída en el cliente**: franja roja "Sin conexión"; botones de envío desactivados; ronda en curso persistida en `localStorage`; reconexión automática de SSE y recarga de estado.
- **Reinicio de la PC de caja**: todo el estado está en PostgreSQL. El lanzador reabre y la jornada sigue abierta.
- **Validaciones** (409 con mensaje): sin jornada abierta; pago que excede el total; cierre con pedidos abiertos; descuento mayor al subtotal; modificar pedido cobrado; stock negativo en ajuste; mesa fuera de rango; mesero inactivo; producto inactivo o agotado.
- **Errores inesperados**: 500 con mensaje genérico en pantalla y detalle en `logs/servidor.log` (rotación diaria, 30 días).
- **PostgreSQL no arranca**: el lanzador muestra el error y ofrece "Ver registro" y "Reintentar".

## 9. Pruebas

- **Unitarias** (Vitest): cálculo de totales, reglas de descuento, lógica de stock, cierre de caja con efectivo esperado, idempotencia.
- **Integración** (Vitest + PostgreSQL de prueba en la misma instancia portátil, base `cafeteria_test`): cada ruta de la API, incluyendo concurrencia de stock con dos peticiones simultáneas.
- **Extremo a extremo** (Playwright): abrir caja → mesero toma pedido → caja agrega ítem → cocina marca lista → caja cobra dividido → egreso → cerrar caja → reporte correcto.
- Todas corren con `npm test`. La construcción del ejecutable se prueba en Windows antes de entregar.

## 10. Fuera del alcance del Núcleo

Login o PIN, impresora térmica directa, acceso desde internet, factura electrónica, puntos o wallet, menú digital público, desglose de IVA, múltiples locales, reservas, recetas por ingrediente.

## 11. Ganchos para módulos siguientes

- **Menú digital**: usará `categoria`, `producto` (foto, descripción) tal como están. Requerirá alojar una copia de solo lectura en internet.
- **Facturación SRI**: usará `cliente` y `pedido` con sus ítems y pagos. Necesitará agregar tablas `comprobante` y datos del emisor (RUC, establecimiento, punto de emisión, certificado .p12). Los productos necesitarán un campo de tarifa de IVA que hoy no existe; se agregará entonces.
- **Wallet**: usará `cliente` y `pedido.cobrado_en` para acumular. Agregará `saldo` o `puntos` y tabla de movimientos.
