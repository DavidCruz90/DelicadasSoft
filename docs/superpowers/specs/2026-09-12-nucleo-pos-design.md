# Núcleo POS Cafetería — Diseño

Fecha: 2026-09-12 (cuenta dividida 2026-09-13; encargos, ítem libre, cliente mínimo y ticket sin leyenda 2026-09-14)
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
| Cobro | Métodos efectivo, tarjeta, transferencia. Varios pagos por cuenta. Cuenta dividida por ítems al momento de cobrar, con cliente, descuento, propina y ticket por cuenta. La división es opcional: por defecto la mesa es una sola cuenta. Ticket imprimible desde navegador (80 mm y hoja normal). |
| Impresora | No hay aún. El ticket se imprime desde el navegador. |
| Mesas | Cantidad fija configurable más "Para llevar". |
| Cocina | Opcional, informativa. Estados Pendiente y Listo. Nada depende de ella. |
| Jornada | Apertura y cierre de caja explícitos. Nada opera sin jornada abierta. |
| Egresos | Monto, tipo (compra de ingredientes, devolución a cliente, otro), motivo, pedido vinculado opcional. |
| Impuestos | Precios finales. Sin desglose de IVA. El ticket no lleva ninguna leyenda de impuestos. |
| Encargos | Pedidos para días posteriores con abonos. Solo caja los crea. Los abonos van a una "caja de encargos" separada y no cuentan como venta ni en el arqueo. La venta y el ticket se generan el día de entrega. No tocan stock. |
| Ítem libre | Mesero y caja pueden agregar un ítem con texto y valor libres. Sin stock. Admin puede desactivarlo. |
| Cliente | Solo el nombre es obligatorio. Identificación, correo, teléfono y dirección son opcionales; Facturación SRI los exigirá al facturar. |
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
- `nombre_local`, `simbolo_moneda` (por defecto `$`), `cantidad_mesas` (entero), `propina_sugerida_pct`, `umbral_stock_bajo` (entero, por defecto 5), `cocina_activa` (booleano, por defecto falso), `sonido_cocina` (booleano), `permitir_items_libres` (booleano, por defecto verdadero).

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
- `abierta_en`, `cerrada_en` (nulo mientras abierta), `fondo_inicial`, `efectivo_contado` (nulo hasta cerrar), y totales congelados al cerrar: `total_ventas`, `total_efectivo`, `total_tarjeta`, `total_transferencia`, `total_descuentos`, `total_propinas`, `total_perdidas`, `total_egresos`, `efectivo_esperado`, `diferencia_efectivo`.
- Regla: solo una jornada con `cerrada_en` nulo a la vez (índice único parcial).

**pedido**
- `jornada_id`, `numero_mesa` (entero, 0 = para llevar), `numero` (secuencial dentro de la jornada, se muestra en ticket), `mesero_id` (nulo solo cuando el pedido nace de un encargo), `origen` (enum: `mesa`, `llevar`, `encargo`), `encargo_id` (nulo salvo origen encargo), `estado` (enum: `abierto`, `cobrado`, `anulado`), `notas`, `cobrado_en`.
- Regla: una mesa con número > 0 tiene como máximo un pedido `abierto` (índice único parcial). "Para llevar" admite varios.
- Un pedido pasa a `cobrado` cuando todas sus cuentas están cobradas.

**cuenta**
- `pedido_id`, `numero` (1, 2, 3… dentro del pedido), `cliente_id` (nulo), `descuento_tipo` (enum: `ninguno`, `monto`, `porcentaje`), `descuento_valor`, `propina`, `perdida` (monto, por defecto 0: parte del total que el cliente no pagó y se asumió como pérdida), `estado` (enum: `abierta`, `cobrada`), `cobrada_en`.
- Al crear un pedido se crea automáticamente la cuenta 1. Todos los ítems nacen asignados a ella. El mesero nunca ve cuentas.
- Caja puede crear cuentas adicionales solo al momento de cobrar, y mover ítems entre cuentas abiertas. Cualquier cuenta vacía se puede eliminar siempre que el pedido conserve al menos una cuenta (ajuste del 2026-09-15: si todos los ítems de la cuenta 1 se mueven a otra, la cuenta 1 vacía debe poder eliminarse para que la mesa se libere).
- Cliente, descuento y propina viven en la cuenta, no en el pedido, para que cada persona tenga los suyos.

**ronda**
- `pedido_id`, `numero` (1, 2, 3… dentro del pedido), `origen` (enum: `mesero`, `caja`), `enviada_a_cocina` (booleano; falso cuando caja marca "ya servido"), `estado` (enum: `pendiente`, `lista`), `lista_en`, `aviso_visto_mesero`, `aviso_visto_caja` (booleanos para descartar el aviso de "Listo para servir").

**pedido_item**
- `ronda_id`, `cuenta_id`, `producto_id` (nulo si es ítem libre), `es_libre` (booleano), `nombre_producto` (copiado del producto, o texto libre), `precio_unitario` (copiado del producto, o valor libre), `cantidad`, `nota`, `afecta_stock` (booleano: falso en ítems libres y en ítems que vienen de un encargo), `anulado` (booleano), `motivo_anulacion`, `anulado_en`.
- Ítem libre: `producto_id` nulo, `es_libre` verdadero, nombre no vacío, precio mayor o igual a 0. Solo se acepta si `configuracion.permitir_items_libres` es verdadero.
- Repartir un ítem con cantidad mayor a 1 entre dos cuentas divide la fila en dos con la misma ronda y producto (por ejemplo cantidad 2 pasa a 1 + 1). No se dividen fracciones de unidad.

**pago**
- `cuenta_id`, `metodo` (enum: `efectivo`, `tarjeta`, `transferencia`), `monto`, `referencia` (texto libre opcional, por ejemplo últimos dígitos o número de transferencia).
- Una cuenta admite varios pagos con métodos distintos, por ejemplo parte en efectivo y parte por transferencia.

**egreso**
- `jornada_id`, `tipo` (enum: `compra_ingredientes`, `devolucion_cliente`, `otro`), `monto`, `motivo`, `pedido_id` (nulo).

### 4.3 Clientes

**cliente**
- `nombre` (único campo obligatorio), `tipo_identificacion` (enum: `cedula`, `ruc`, `pasaporte`, `consumidor_final`; nulo si no se registró), `identificacion` (nulo), `correo` (nulo), `telefono` (nulo), `direccion` (nulo), `activo`.
- Índice único sobre (`tipo_identificacion`, `identificacion`) solo cuando ambos están presentes y el tipo no es consumidor final.
- Para ticket no se exige ningún dato además del nombre. El módulo de Facturación SRI validará correo, identificación y dirección al emitir factura.
- Campos pensados para la Facturación SRI del módulo 3; el Núcleo solo los guarda y asocia a la cuenta. Como cada cuenta tiene sus propios ítems y cliente, el módulo 3 podrá emitir una factura por cuenta.

### 4.4 Encargos

**encargo**
- `numero` (secuencial global, se muestra al cliente), `cliente_id` (obligatorio), `fecha_entrega` (fecha), `notas`, `estado` (enum: `pendiente`, `entregado`, `cancelado`), `jornada_creacion_id`, `pedido_id` (nulo hasta entregar o hasta cancelar reteniendo), `entregado_en`, `cancelado_en`, `motivo_cancelacion`, `monto_devuelto` (monto devuelto al cancelar, 0 si no se devolvió nada), `abono_retenido` (booleano: verdadero si se retuvo algo; nulo si no se canceló o no había abono).

**encargo_item**
- `encargo_id`, `producto_id` (nulo si libre), `es_libre`, `nombre_producto`, `precio_unitario`, `cantidad`, `nota`. Editables mientras el encargo esté `pendiente`.

**abono**
- `encargo_id`, `jornada_id` (la del día en que se recibió), `metodo` (efectivo, tarjeta, transferencia), `monto`, `referencia`, `estado` (enum: `pendiente`, `aplicado`, `devuelto`), `aplicado_en`, `devuelto_en`.
- La suma de abonos `pendiente` no puede superar el total del encargo.

**Caja de encargos.** No es una tabla: es la suma de `abono.monto` con `metodo = efectivo` y `estado = pendiente`. Representa el dinero físico guardado aparte. Se muestra en la pantalla de encargos y en el cierre de caja como dato informativo.

**Entregar** (solo con jornada abierta, encargo `pendiente`): en una transacción,
1. Crea `pedido` con `origen = encargo`, `numero_mesa = 0`, `mesero_id` nulo, `encargo_id`.
2. Crea `cuenta` 1 con `cliente_id = encargo.cliente_id`.
3. Crea `ronda` 1 con `origen = caja`, `enviada_a_cocina = false`, y copia cada `encargo_item` como `pedido_item` con `afecta_stock = false`. No genera movimientos de stock.
4. Convierte cada abono `pendiente` en un `pago` de la cuenta con el mismo método y monto, `referencia = "Abono DD/MM"`, y marca el abono `aplicado`.
5. Marca el encargo `entregado` y guarda `pedido_id`.
Caja queda dentro del pedido con el saldo a cobrar. Desde ahí el cobro, la división de cuenta y el ticket funcionan como en cualquier pedido. La venta completa, abonos incluidos, queda registrada en la jornada de entrega.

**Cancelar** (encargo `pendiente`, con motivo): caja escribe `monto_devolver`, entre 0 y lo abonado (decisión de Dave, 2026-09-15: "caja decide el monto a devolver", según qué tan avanzada esté la preparación). Sea `abonado` la suma de abonos pendientes.
- **Sin abonos**: solo cambia el estado.
- **Devolución total** (`monto_devolver = abonado`): cada abono pasa a `devuelto` con `devuelto_en`. El efectivo sale de la caja de encargos; no toca la caja del día. El cierre lo muestra como "Abonos devueltos hoy". `abono_retenido = false`, `monto_devuelto = abonado`.
- **Retención total o parcial** (`monto_devolver < abonado`): se crea un pedido `origen = encargo` con un único ítem libre "Encargo #N cancelado" por `abonado`, cuenta 1 con el cliente, y los abonos se aplican como pagos; queda cobrado. Si `monto_devolver > 0`, se crea además un egreso `devolucion_cliente` por `monto_devolver` vinculado a ese pedido, con motivo "Devolución parcial por cancelación del encargo #N: <motivo>". Resultado en caja del día: entra `abonado` como venta y sale `monto_devolver` como egreso; el neto es lo retenido. `abono_retenido = true`, `monto_devuelto = monto_devolver`.
- `monto_devolver` fuera de rango o ausente cuando hay abonos: 400 "Indica cuánto se devuelve, entre 0 y lo abonado".

### 4.5 Cálculo de totales de una cuenta

```
subtotal   = suma de (precio_unitario × cantidad) de ítems no anulados de la cuenta
descuento  = 0 | descuento_valor | subtotal × descuento_valor / 100   (según descuento_tipo)
total      = subtotal − descuento + propina
pagado     = suma de pagos de la cuenta
saldo      = total − pagado − perdida
```

`perdida` solo puede ser mayor a 0 cuando la cuenta se cierra por anulación con pagos parciales (regla 10). En ventas se cuenta el total completo; la pérdida se informa aparte en el cierre.

Redondeo a 2 decimales en cada paso. `descuento` nunca puede superar `subtotal`. El total del pedido, que se muestra en la cuadrícula de mesas, es la suma de los totales de sus cuentas.

## 5. Reglas de negocio

1. **Nada sin jornada abierta.** Crear pedidos, enviar rondas, agregar ítems, cobrar, registrar egresos y ajustar stock desde caja requieren jornada abierta. Sin ella, mesero y cocina muestran "Caja cerrada". Admin permite catálogo, mesas, meseros, clientes, configuración y respaldos.
2. **Stock se descuenta al agregar el ítem**, dentro de una transacción con bloqueo de fila del producto. Si no alcanza, se rechaza con "Se acaba de agotar" y no se crea el ítem. Nunca queda negativo por ventas.
3. **Anular un ítem devuelve su stock** (movimiento `anulacion`). Solo caja anula ítems ya enviados; el mesero quita ítems solo antes de enviar la ronda (en ese caso nunca llegaron al servidor).
4. **Precio y nombre se copian al ítem.** Cambios en admin no alteran pedidos existentes.
5. **Rondas.** Cada envío del mesero crea una ronda `origen=mesero`, `enviada_a_cocina=true`. Cada agregado desde caja crea una ronda `origen=caja`; caja elige si va a cocina o "ya servido".
6. **Cocina no bloquea nada.** El estado de ronda es informativo. Con `cocina_activa=false` las pantallas de mesero y caja no muestran indicadores de "Listo para servir" y el lanzador no muestra el enlace de cocina.
7. **Cobro por cuenta.** Se aceptan pagos parciales con distintos métodos. Cuando `pagado >= total` de una cuenta, la cuenta pasa a `cobrada`, se fija `cobrada_en` y se devuelve la URL de su ticket. Se rechaza un pago que haga `pagado > total`. Cuando todas las cuentas del pedido están cobradas, el pedido pasa a `cobrado` y la mesa queda libre.
8. **División opcional y solo en caja.** El mesero toma el pedido sin pensar en cuentas. En caja, al cobrar, "Dividir cuenta" permite crear cuentas y mover ítems entre las que siguen abiertas. Una cuenta cobrada no acepta ni entrega ítems. Si nunca se divide, la cuenta 1 es la única y el flujo es idéntico a cobrar la mesa completa.
9. **Cuenta cobrada es inmutable.** Devoluciones posteriores se registran como egreso tipo `devolucion_cliente` vinculado al pedido.
10. **Anular pedido completo** (caja, con motivo). Si ninguna cuenta tiene pagos: todos los ítems se anulan, stock devuelto, estado `anulado`, mesa libre. Si alguna cuenta tiene pagos, caja debe elegir qué pasa con lo pagado (regla agregada el 2026-09-15 para el caso "cliente pagó parte y se fue"):
    - **Devolver**: se crea automáticamente un egreso tipo `devolucion_cliente` por el total pagado del pedido, con motivo "Devolución por anulación del pedido #N: <motivo>" y `pedido_id` vinculado. Todos los ítems se anulan, stock devuelto, pedido `anulado`, mesa libre. El arqueo cuadra porque el dinero recibido queda compensado por el egreso.
    - **Pérdida** (el cliente se fue sin pagar el resto): en cada cuenta con pagos, `perdida = total − pagado`, la cuenta queda `cobrada`; sus ítems no se anulan (se consumieron) y no devuelven stock. Las cuentas sin pagos se anulan con sus ítems y stock devuelto. El pedido queda `cobrado` con la nota "Cerrado con pérdida: <motivo>". La venta se registra completa y la pérdida aparece en el cierre de caja como "Pérdidas por consumo no pagado" y en reportes. Dave, 2026-09-15: "si el cliente ya se fue sin pagar la otra mitad fue una estafa, debe asumirse como pérdida".
    - Si caja quiere devolver stock de ítems no consumidos antes de cerrar con pérdida, anula esos ítems uno por uno primero.
11. **Apertura de caja** registra `fondo_inicial` y muestra los productos con stock para ajustar (cada ajuste genera movimiento `apertura`).
12. **Cierre de caja** exige que no haya pedidos `abiertos` (mensaje: "Hay mesas ocupadas; cobra o anula los pedidos antes de cerrar"). Es intencional: cada mesa termina cobrada o anulada dentro de su jornada y el arqueo nunca tiene dinero sin explicar. Calcula y congela totales. `efectivo_esperado = fondo_inicial + total_efectivo − total_egresos`, donde `total_efectivo` incluye los abonos en efectivo aplicados ese día al entregar encargos (ese dinero pasa físicamente de la caja de encargos a la caja del día). Los abonos recibidos ese día no entran en `efectivo_esperado`: están en la caja de encargos. El cierre muestra como información: abonos recibidos hoy por método, abonos devueltos hoy, saldo de la caja de encargos, y pérdidas por consumo no pagado (`total_perdidas`). Caja ingresa `efectivo_contado`; `diferencia_efectivo = efectivo_contado − efectivo_esperado`. Genera respaldo automático.
13. **Avisos de stock.** `stock_actual <= umbral_stock_bajo` se muestra en amarillo con "Quedan N"; `0` en gris con "Agotado" y no seleccionable. Aplica en mesero, caja, admin y cocina (si activa).
14. **Idempotencia.** Cada envío de ronda, cada pago y cada abono lleva un `id` generado en el cliente. Si el servidor ya lo tiene, responde con el resultado anterior sin duplicar.
15. **Ítem libre.** Mesero y caja pueden agregar un ítem con nombre y precio escritos a mano, sin producto asociado y sin stock. Solo si `permitir_items_libres` está activo; si admin lo desactiva, el botón desaparece en ambas pantallas y el servidor rechaza el ítem. Cocina lo muestra como cualquier otro. En reportes se agrupan en la fila "Ítems libres".
16. **Encargos solo desde caja** y solo con jornada abierta, tanto para crear como para abonar, entregar o cancelar. El cliente es obligatorio (basta el nombre). Los ítems del encargo se pueden editar mientras esté pendiente; la suma de abonos nunca supera el total.
17. **Los abonos no son venta.** Se registran el día que se reciben pero no suman a ventas ni al arqueo de ese día. La venta se registra completa el día de entrega, cuando el encargo se convierte en pedido y los abonos se aplican como pagos.
18. **Los encargos no tocan stock.** Ni al crear ni al entregar. Se preparan aparte del menú del día.
19. **Cancelar un encargo con abono** obliga a caja a indicar cuánto se devuelve (de 0 a lo abonado); el resto se retiene como venta, según 4.4.

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
| `POST /pedidos/:id/rondas` | Enviar ronda `{id, origen, enviada_a_cocina, items:[{producto_id | null, es_libre, nombre, precio, cantidad, nota}]}` |
| `POST /pedidos/:id/items/:itemId/anular` | `{motivo}` |
| `PATCH /pedidos/:id` | Notas |
| `POST /pedidos/:id/cuentas` | Crear cuenta adicional (solo con jornada abierta y pedido abierto) |
| `DELETE /cuentas/:id` | Eliminar cuenta vacía (debe quedar al menos una cuenta) |
| `POST /cuentas/:id/items` | Mover ítems a esta cuenta `{items:[{pedido_item_id, cantidad}]}`; si `cantidad` es menor a la del ítem, se divide la fila |
| `PATCH /cuentas/:id` | Descuento, propina, cliente |
| `POST /cuentas/:id/pagos` | `{id, metodo, monto, referencia}` |
| `GET /cuentas/:id/ticket` | HTML imprimible de esa cuenta |
| `POST /pedidos/:id/anular` | `{motivo, pagos?: "devolver" | "perdida"}`; `pagos` es obligatorio si alguna cuenta tiene pagos (400 si falta) |
| `GET /cocina/rondas` | Rondas pendientes enviadas a cocina |
| `POST /rondas/:id/lista` | Marcar lista |
| `POST /rondas/:id/aviso-visto` | `{pantalla: mesero|caja}` |
| `POST /jornadas/abrir` | `{fondo_inicial, ajustes_stock:[{producto_id, stock}]}` |
| `POST /jornadas/cerrar` | `{efectivo_contado}` |
| `GET /jornadas` y `GET /jornadas/:id/reporte` | Historial y reporte de cierre, ventas por producto, stock restante |
| `GET/POST /egresos` | Listar de la jornada, crear |
| `GET /encargos` | Pendientes ordenados por fecha de entrega, con total, abonado, saldo; más saldo de caja de encargos. Filtro por estado y fecha |
| `POST /encargos` | Crear `{cliente_id, fecha_entrega, notas, items:[…]}` |
| `PATCH /encargos/:id` | Editar ítems, fecha, notas (solo pendiente) |
| `POST /encargos/:id/abonos` | `{id, metodo, monto, referencia}` |
| `POST /encargos/:id/entregar` | Convierte en pedido y devuelve `{pedido_id}` |
| `POST /encargos/:id/cancelar` | `{motivo, monto_devolver}`; `monto_devolver` obligatorio si hay abonos, entre 0 y lo abonado |
| `GET /encargos/:id/comprobante` | HTML imprimible del encargo con abonos recibidos, para entregar al cliente como constancia |
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
4. Botón "Ítem libre" junto al catálogo (si está permitido): nombre, precio y cantidad.
5. "Enviar a cocina" (o "Enviar" si cocina inactiva). La ronda pendiente se conserva en el navegador si se cae la red.
6. Si jornada cerrada: pantalla "Caja cerrada, no se pueden tomar pedidos".

### 7.2 Cocina `/cocina`
- Solo visible si `cocina_activa`; de lo contrario muestra "Pantalla de cocina desactivada. Actívala en Admin".
- Tarjetas de rondas pendientes ordenadas por hora: mesa, mesero, minutos de espera, ítems con cantidad y nota. Botón "Listo".
- Barra lateral con productos que controlan stock, resaltando bajo y agotado.
- Sonido corto al recibir ronda nueva, con botón de silencio.

### 7.3 Caja `/caja`
- Barra superior: estado de jornada, fondo inicial, ventas del día. Botones "Abrir caja" / "Cerrar caja".
- Sin jornada abierta solo se puede abrir caja. Al abrir: fondo inicial y tabla de stock editable.
- Mesas ocupadas con total y saldo. Dentro de una mesa:
  - Ítems por ronda con origen. "Agregar ítems" abre el catálogo, con botón "Ítem libre" si está permitido; al confirmar elige "Enviar a cocina" o "Ya servido".
  - "Anular" por ítem con motivo. "Anular pedido" completo con motivo; si hay pagos, pregunta "Devolver el dinero" o "Cerrar con pérdida".
  - Por defecto se ve una sola cuenta con todos los ítems. Botón "Dividir cuenta": aparece la lista de ítems a la izquierda y las cuentas a la derecha ("Cuenta 1", "Cuenta 2", botón "+ Cuenta"). Tocar un ítem y luego una cuenta lo mueve; un ítem con cantidad mayor a 1 pregunta cuántas unidades mover. Las cuentas ya cobradas se muestran bloqueadas.
  - Por cada cuenta abierta: descuento (monto o %), propina (con sugerido), cliente (buscar por identificación o nombre, crear al vuelo).
  - Pagos por cuenta: lista de pagos registrados, formulario método + monto + referencia, botón "Cobrar exacto" que rellena el saldo. Al cubrir el total de la cuenta se abre su ticket en pestaña nueva. La mesa se libera cuando todas las cuentas están cobradas.
- "Egresos": lista de la jornada y formulario.
- "Encargos": lista de pendientes por fecha de entrega (los de hoy resaltados) con total, abonado y saldo, y el saldo de la caja de encargos arriba. "Nuevo encargo": cliente (buscar o crear con solo el nombre), fecha de entrega, ítems del catálogo o libres, notas. Dentro de un encargo: "Abonar" (método, monto, referencia), "Imprimir constancia", "Entregar" (abre el pedido resultante con el saldo a cobrar), "Cancelar" (motivo y monto a devolver, de 0 a lo abonado).
- "Cerrar caja": muestra resumen, pide efectivo contado, muestra diferencia, confirma, genera respaldo, imprime reporte de cierre.
- Indicador de ronda lista por mesa si cocina activa.

### 7.4 Admin `/admin`
- Menú: categorías (orden, activo) y productos (nombre, categoría, precio, descripción, foto, activo, controla stock, stock actual). Editar stock pide motivo.
- Meseros: alta, baja, activo.
- Mesas: cantidad. Cambiarla a menos exige que las mesas sobrantes estén libres.
- Clientes: listado, búsqueda, edición.
- Configuración: nombre del local, símbolo, propina sugerida, umbral de stock, cocina activa, sonido, permitir ítems libres.
- Reportes: por jornada (actual e historial): cierre de caja (incluye abonos recibidos, devueltos, saldo de caja de encargos y pérdidas por consumo no pagado), ventas por producto (con fila "Ítems libres"), stock restante, egresos, encargos entregados y cancelados. Exportar cada reporte a CSV.
- Respaldos: crear, listar, restaurar. Descargar log.
- Datos de ejemplo: cargar y borrar.

### 7.5 Ticket
Un ticket por cuenta. HTML con CSS `@media print` para 80 mm y hoja A4. Contenido: nombre del local, número de pedido y de cuenta si la mesa se dividió (por ejemplo "Pedido #37 · Cuenta 2 de 2"), mesa o "Para llevar" o "Encargo #N", mesero si lo hay, fecha y hora, ítems de esa cuenta (cantidad, nombre, precio, subtotal), ítems anulados omitidos, subtotal, descuento, propina, total, pagos por método (los abonos con su fecha), cliente (nombre, e identificación si la registró). Sin leyenda de impuestos: el ticket no menciona impuestos. Se abre con `window.print()`.

Constancia de encargo: mismo formato, con número de encargo, fecha de entrega, ítems, total, abonos recibidos y saldo pendiente. Se entrega al cliente al abonar.

## 8. Manejo de errores

- **Concurrencia de stock**: transacción con `SELECT … FOR UPDATE` sobre el producto. Segundo pedido recibe 409 "Se acaba de agotar".
- **Red caída en el cliente**: franja roja "Sin conexión"; botones de envío desactivados; ronda en curso persistida en `localStorage`; reconexión automática de SSE y recarga de estado.
- **Reinicio de la PC de caja**: todo el estado está en PostgreSQL. El lanzador reabre y la jornada sigue abierta.
- **Validaciones** (409 con mensaje): sin jornada abierta; pago que excede el total de la cuenta; abono que excede el saldo del encargo; entregar o cancelar un encargo que no está pendiente; ítem libre con la opción desactivada o con nombre vacío; cierre con pedidos abiertos; descuento mayor al subtotal; modificar cuenta o pedido cobrados; mover ítems desde o hacia una cuenta cobrada; eliminar una cuenta con ítems o la última cuenta del pedido; stock negativo en ajuste; mesa fuera de rango; mesero inactivo; producto inactivo o agotado.
- **Errores inesperados**: 500 con mensaje genérico en pantalla y detalle en `logs/servidor.log` (rotación diaria, 30 días).
- **PostgreSQL no arranca**: el lanzador muestra el error y ofrece "Ver registro" y "Reintentar".

## 9. Pruebas

- **Unitarias** (Vitest): cálculo de totales por cuenta, reglas de descuento, división de ítems entre cuentas, lógica de stock, cierre de caja con efectivo esperado incluyendo abonos aplicados y excluyendo abonos recibidos, conversión de encargo a pedido, cancelación con devolver y retener, idempotencia.
- **Integración** (Vitest + PostgreSQL de prueba en la misma instancia portátil, base `cafeteria_test`): cada ruta de la API, incluyendo concurrencia de stock con dos peticiones simultáneas.
- **Extremo a extremo** (Playwright): abrir caja → mesero toma pedido con un ítem libre → caja agrega ítem → cocina marca lista → caja divide en dos cuentas con clientes distintos y cobra una con efectivo y transferencia → caja crea encargo con abono → egreso → cerrar caja (abono no cuenta en arqueo) → abrir caja al día siguiente → entregar encargo y cobrar saldo → cerrar caja (abono sí cuenta) → reportes correctos.
- Todas corren con `npm test`. La construcción del ejecutable se prueba en Windows antes de entregar.

## 10. Fuera del alcance del Núcleo

Login o PIN, impresora térmica directa, acceso desde internet, factura electrónica, puntos o wallet, menú digital público, desglose de IVA, múltiples locales, reservas de mesa, recetas por ingrediente, recordatorios automáticos al cliente por encargos.

## 11. Ganchos para módulos siguientes

- **Menú digital**: usará `categoria`, `producto` (foto, descripción) tal como están. Requerirá alojar una copia de solo lectura en internet.
- **Facturación SRI**: usará `cliente` y `cuenta` con sus ítems y pagos, emitiendo una factura por cuenta. Necesitará agregar tablas `comprobante` y datos del emisor (RUC, establecimiento, punto de emisión, certificado .p12). Los productos necesitarán un campo de tarifa de IVA que hoy no existe; se agregará entonces.
- **Wallet**: usará `cliente` y `cuenta.cobrada_en` para acumular por persona. Agregará `saldo` o `puntos` y tabla de movimientos.
