import { pgTable, pgEnum, uuid, text, integer, numeric, boolean, timestamp, date } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const tiempos = () => ({
  creado_en: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizado_en: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
const monto = (nombre: string) => numeric(nombre, { precision: 10, scale: 2 });

export const origenMovimiento = pgEnum('origen_movimiento', ['venta', 'anulacion', 'ajuste_manual', 'apertura']);
export const estadoPedido = pgEnum('estado_pedido', ['abierto', 'cobrado', 'anulado']);
export const origenPedido = pgEnum('origen_pedido', ['mesa', 'llevar', 'encargo']);
export const origenRonda = pgEnum('origen_ronda', ['mesero', 'caja']);
export const estadoRonda = pgEnum('estado_ronda', ['pendiente', 'lista']);
export const estadoCuenta = pgEnum('estado_cuenta', ['abierta', 'cobrada']);
export const tipoDescuento = pgEnum('tipo_descuento', ['ninguno', 'monto', 'porcentaje']);
export const metodoPago = pgEnum('metodo_pago', ['efectivo', 'tarjeta', 'transferencia']);
export const tipoEgreso = pgEnum('tipo_egreso', ['compra_ingredientes', 'devolucion_cliente', 'otro']);
export const tipoIdentificacion = pgEnum('tipo_identificacion', ['cedula', 'ruc', 'pasaporte', 'consumidor_final']);
export const estadoEncargo = pgEnum('estado_encargo', ['pendiente', 'entregado', 'cancelado']);
export const estadoAbono = pgEnum('estado_abono', ['pendiente', 'aplicado', 'devuelto']);
export const rolUsuario = pgEnum('rol_usuario', ['mesero', 'caja', 'admin']);
export const estadoDispositivo = pgEnum('estado_dispositivo', ['pendiente', 'autorizado', 'revocado']);

export const configuracion = pgTable('configuracion', {
  id: id(),
  nombre_local: text('nombre_local').notNull().default('Cafetería'),
  simbolo_moneda: text('simbolo_moneda').notNull().default('$'),
  cantidad_mesas: integer('cantidad_mesas').notNull().default(10),
  propina_sugerida_pct: numeric('propina_sugerida_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  umbral_stock_bajo: integer('umbral_stock_bajo').notNull().default(5),
  cocina_activa: boolean('cocina_activa').notNull().default(false),
  sonido_cocina: boolean('sonido_cocina').notNull().default(true),
  permitir_items_libres: boolean('permitir_items_libres').notNull().default(true),
  ...tiempos(),
});

export const usuario = pgTable('usuario', {
  id: id(),
  nombre: text('nombre').notNull(),
  rol: rolUsuario('rol').notNull().default('mesero'),
  // Nulo mientras no tenga PIN (los meseros que existían antes de la fase 2):
  // no aparece en la lista de entrada y no puede iniciar sesión.
  pin_hash: text('pin_hash'),
  activo: boolean('activo').notNull().default(true),
  ...tiempos(),
});

export const dispositivo = pgTable('dispositivo', {
  id: id(),
  nombre: text('nombre'),
  // 4 dígitos mientras está pendiente; se vacía al autorizar. Único entre
  // pendientes por el índice parcial dispositivo_codigo_pendiente_unico.
  codigo: text('codigo'),
  token_hash: text('token_hash').notNull(),
  estado: estadoDispositivo('estado').notNull().default('pendiente'),
  descripcion: text('descripcion').notNull().default(''),
  solicitado_en: timestamp('solicitado_en', { withTimezone: true }).notNull().defaultNow(),
  autorizado_en: timestamp('autorizado_en', { withTimezone: true }),
  autorizado_por: uuid('autorizado_por').references(() => usuario.id),
  ultimo_uso_en: timestamp('ultimo_uso_en', { withTimezone: true }),
  intentos_fallidos: integer('intentos_fallidos').notNull().default(0),
  bloqueado_hasta: timestamp('bloqueado_hasta', { withTimezone: true }),
  ...tiempos(),
});

export const sesion = pgTable('sesion', {
  id: id(),
  usuario_id: uuid('usuario_id').notNull().references(() => usuario.id),
  // Nulo cuando la sesión se abrió desde la PC de caja (127.0.0.1), que no
  // pasa por la lista blanca de dispositivos.
  dispositivo_id: uuid('dispositivo_id').references(() => dispositivo.id),
  token_hash: text('token_hash').notNull(),
  ultimo_uso_en: timestamp('ultimo_uso_en', { withTimezone: true }).notNull().defaultNow(),
  // Nulo para rol mesero (no expira por inactividad).
  expira_en: timestamp('expira_en', { withTimezone: true }),
  cerrada_en: timestamp('cerrada_en', { withTimezone: true }),
  ...tiempos(),
});

// "creada_en" de la spec 4.3 es creado_en de tiempos(); "ocurrido_en" de la
// spec 4.4 es creado_en de tiempos(). No se duplican columnas.
export const intentoFallido = pgTable('intento_fallido', {
  id: id(),
  // Nulo cuando el intento vino de la PC de caja.
  dispositivo_id: uuid('dispositivo_id').references(() => dispositivo.id),
  // Nulo cuando el usuario_id que se intentó no existe.
  usuario_id: uuid('usuario_id').references(() => usuario.id),
  ...tiempos(),
});

export const categoria = pgTable('categoria', {
  id: id(),
  nombre: text('nombre').notNull(),
  orden: integer('orden').notNull().default(0),
  activa: boolean('activa').notNull().default(true),
  ...tiempos(),
});

export const producto = pgTable('producto', {
  id: id(),
  categoria_id: uuid('categoria_id').notNull().references(() => categoria.id),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  precio: monto('precio').notNull(),
  foto: text('foto'),
  activo: boolean('activo').notNull().default(true),
  controla_stock: boolean('controla_stock').notNull().default(false),
  stock_actual: integer('stock_actual'),
  orden: integer('orden').notNull().default(0),
  ...tiempos(),
});

export const cambioPrecio = pgTable('cambio_precio', {
  id: id(),
  producto_id: uuid('producto_id').notNull().references(() => producto.id),
  precio_anterior: monto('precio_anterior').notNull(),
  precio_nuevo: monto('precio_nuevo').notNull(),
  usuario_id: uuid('usuario_id').notNull().references(() => usuario.id),
  ...tiempos(),
});

export const jornada = pgTable('jornada', {
  id: id(),
  abierta_en: timestamp('abierta_en', { withTimezone: true }).notNull().defaultNow(),
  cerrada_en: timestamp('cerrada_en', { withTimezone: true }),
  fondo_inicial: monto('fondo_inicial').notNull().default('0'),
  efectivo_contado: monto('efectivo_contado'),
  total_ventas: monto('total_ventas'),
  total_efectivo: monto('total_efectivo'),
  total_tarjeta: monto('total_tarjeta'),
  total_transferencia: monto('total_transferencia'),
  total_descuentos: monto('total_descuentos'),
  total_propinas: monto('total_propinas'),
  total_perdidas: monto('total_perdidas'),
  total_egresos: monto('total_egresos'),
  total_abonos_recibidos: monto('total_abonos_recibidos'),
  total_abonos_devueltos: monto('total_abonos_devueltos'),
  efectivo_esperado: monto('efectivo_esperado'),
  diferencia_efectivo: monto('diferencia_efectivo'),
  ...tiempos(),
});

export const cliente = pgTable('cliente', {
  id: id(),
  nombre: text('nombre').notNull(),
  tipo_identificacion: tipoIdentificacion('tipo_identificacion'),
  identificacion: text('identificacion'),
  correo: text('correo'),
  telefono: text('telefono'),
  direccion: text('direccion'),
  activo: boolean('activo').notNull().default(true),
  ...tiempos(),
});

export const encargo = pgTable('encargo', {
  id: id(),
  numero: integer('numero').notNull().generatedAlwaysAsIdentity(),
  cliente_id: uuid('cliente_id').notNull().references(() => cliente.id),
  fecha_entrega: date('fecha_entrega').notNull(),
  notas: text('notas'),
  estado: estadoEncargo('estado').notNull().default('pendiente'),
  jornada_creacion_id: uuid('jornada_creacion_id').notNull().references(() => jornada.id),
  pedido_id: uuid('pedido_id').references((): AnyPgColumn => pedido.id),
  entregado_en: timestamp('entregado_en', { withTimezone: true }),
  cancelado_en: timestamp('cancelado_en', { withTimezone: true }),
  motivo_cancelacion: text('motivo_cancelacion'),
  monto_devuelto: monto('monto_devuelto').notNull().default('0'),
  abono_retenido: boolean('abono_retenido'),
  ...tiempos(),
});

export const pedido = pgTable('pedido', {
  id: id(),
  jornada_id: uuid('jornada_id').notNull().references(() => jornada.id),
  numero_mesa: integer('numero_mesa').notNull().default(0),
  numero: integer('numero').notNull(),
  usuario_id: uuid('usuario_id').references(() => usuario.id),
  origen: origenPedido('origen').notNull().default('mesa'),
  encargo_id: uuid('encargo_id').references(() => encargo.id),
  estado: estadoPedido('estado').notNull().default('abierto'),
  notas: text('notas'),
  cobrado_en: timestamp('cobrado_en', { withTimezone: true }),
  ...tiempos(),
});

export const cuenta = pgTable('cuenta', {
  id: id(),
  pedido_id: uuid('pedido_id').notNull().references(() => pedido.id),
  numero: integer('numero').notNull().default(1),
  cliente_id: uuid('cliente_id').references(() => cliente.id),
  descuento_tipo: tipoDescuento('descuento_tipo').notNull().default('ninguno'),
  descuento_valor: monto('descuento_valor').notNull().default('0'),
  propina: monto('propina').notNull().default('0'),
  perdida: monto('perdida').notNull().default('0'),
  estado: estadoCuenta('estado').notNull().default('abierta'),
  cobrada_en: timestamp('cobrada_en', { withTimezone: true }),
  ...tiempos(),
});

export const ronda = pgTable('ronda', {
  id: id(),
  pedido_id: uuid('pedido_id').notNull().references(() => pedido.id),
  numero: integer('numero').notNull(),
  origen: origenRonda('origen').notNull(),
  enviada_a_cocina: boolean('enviada_a_cocina').notNull().default(true),
  estado: estadoRonda('estado').notNull().default('pendiente'),
  lista_en: timestamp('lista_en', { withTimezone: true }),
  aviso_visto_mesero: boolean('aviso_visto_mesero').notNull().default(false),
  aviso_visto_caja: boolean('aviso_visto_caja').notNull().default(false),
  ...tiempos(),
});

export const pedidoItem = pgTable('pedido_item', {
  id: id(),
  ronda_id: uuid('ronda_id').notNull().references(() => ronda.id),
  cuenta_id: uuid('cuenta_id').notNull().references(() => cuenta.id),
  producto_id: uuid('producto_id').references(() => producto.id),
  es_libre: boolean('es_libre').notNull().default(false),
  nombre_producto: text('nombre_producto').notNull(),
  precio_unitario: monto('precio_unitario').notNull(),
  cantidad: integer('cantidad').notNull(),
  nota: text('nota'),
  afecta_stock: boolean('afecta_stock').notNull().default(true),
  anulado: boolean('anulado').notNull().default(false),
  motivo_anulacion: text('motivo_anulacion'),
  anulado_en: timestamp('anulado_en', { withTimezone: true }),
  ...tiempos(),
});

export const movimientoStock = pgTable('movimiento_stock', {
  id: id(),
  producto_id: uuid('producto_id').notNull().references(() => producto.id),
  jornada_id: uuid('jornada_id').references(() => jornada.id),
  cantidad: integer('cantidad').notNull(),
  stock_resultante: integer('stock_resultante').notNull(),
  origen: origenMovimiento('origen').notNull(),
  motivo: text('motivo'),
  pedido_item_id: uuid('pedido_item_id').references(() => pedidoItem.id),
  ...tiempos(),
});

export const pago = pgTable('pago', {
  id: id(),
  cuenta_id: uuid('cuenta_id').notNull().references(() => cuenta.id),
  metodo: metodoPago('metodo').notNull(),
  monto: monto('monto').notNull(),
  referencia: text('referencia'),
  ...tiempos(),
});

export const egreso = pgTable('egreso', {
  id: id(),
  jornada_id: uuid('jornada_id').notNull().references(() => jornada.id),
  tipo: tipoEgreso('tipo').notNull(),
  monto: monto('monto').notNull(),
  motivo: text('motivo').notNull(),
  pedido_id: uuid('pedido_id').references(() => pedido.id),
  ...tiempos(),
});

export const encargoItem = pgTable('encargo_item', {
  id: id(),
  encargo_id: uuid('encargo_id').notNull().references(() => encargo.id),
  producto_id: uuid('producto_id').references(() => producto.id),
  es_libre: boolean('es_libre').notNull().default(false),
  nombre_producto: text('nombre_producto').notNull(),
  precio_unitario: monto('precio_unitario').notNull(),
  cantidad: integer('cantidad').notNull(),
  nota: text('nota'),
  ...tiempos(),
});

export const abono = pgTable('abono', {
  id: id(),
  encargo_id: uuid('encargo_id').notNull().references(() => encargo.id),
  jornada_id: uuid('jornada_id').notNull().references(() => jornada.id),
  metodo: metodoPago('metodo').notNull(),
  monto: monto('monto').notNull(),
  referencia: text('referencia'),
  estado: estadoAbono('estado').notNull().default('pendiente'),
  aplicado_en: timestamp('aplicado_en', { withTimezone: true }),
  devuelto_en: timestamp('devuelto_en', { withTimezone: true }),
  ...tiempos(),
});
