CREATE TYPE "public"."estado_abono" AS ENUM('pendiente', 'aplicado', 'devuelto');--> statement-breakpoint
CREATE TYPE "public"."estado_cuenta" AS ENUM('abierta', 'cobrada');--> statement-breakpoint
CREATE TYPE "public"."estado_encargo" AS ENUM('pendiente', 'entregado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."estado_pedido" AS ENUM('abierto', 'cobrado', 'anulado');--> statement-breakpoint
CREATE TYPE "public"."estado_ronda" AS ENUM('pendiente', 'lista');--> statement-breakpoint
CREATE TYPE "public"."metodo_pago" AS ENUM('efectivo', 'tarjeta', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."origen_movimiento" AS ENUM('venta', 'anulacion', 'ajuste_manual', 'apertura');--> statement-breakpoint
CREATE TYPE "public"."origen_pedido" AS ENUM('mesa', 'llevar', 'encargo');--> statement-breakpoint
CREATE TYPE "public"."origen_ronda" AS ENUM('mesero', 'caja');--> statement-breakpoint
CREATE TYPE "public"."tipo_descuento" AS ENUM('ninguno', 'monto', 'porcentaje');--> statement-breakpoint
CREATE TYPE "public"."tipo_egreso" AS ENUM('compra_ingredientes', 'devolucion_cliente', 'otro');--> statement-breakpoint
CREATE TYPE "public"."tipo_identificacion" AS ENUM('cedula', 'ruc', 'pasaporte', 'consumidor_final');--> statement-breakpoint
CREATE TABLE "abono" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"encargo_id" uuid NOT NULL,
	"jornada_id" uuid NOT NULL,
	"metodo" "metodo_pago" NOT NULL,
	"monto" numeric(10, 2) NOT NULL,
	"referencia" text,
	"estado" "estado_abono" DEFAULT 'pendiente' NOT NULL,
	"aplicado_en" timestamp with time zone,
	"devuelto_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"tipo_identificacion" "tipo_identificacion",
	"identificacion" text,
	"correo" text,
	"telefono" text,
	"direccion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre_local" text DEFAULT 'Cafetería' NOT NULL,
	"simbolo_moneda" text DEFAULT '$' NOT NULL,
	"cantidad_mesas" integer DEFAULT 10 NOT NULL,
	"propina_sugerida_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"umbral_stock_bajo" integer DEFAULT 5 NOT NULL,
	"cocina_activa" boolean DEFAULT false NOT NULL,
	"sonido_cocina" boolean DEFAULT true NOT NULL,
	"permitir_items_libres" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuenta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"numero" integer DEFAULT 1 NOT NULL,
	"cliente_id" uuid,
	"descuento_tipo" "tipo_descuento" DEFAULT 'ninguno' NOT NULL,
	"descuento_valor" numeric(10, 2) DEFAULT '0' NOT NULL,
	"propina" numeric(10, 2) DEFAULT '0' NOT NULL,
	"perdida" numeric(10, 2) DEFAULT '0' NOT NULL,
	"estado" "estado_cuenta" DEFAULT 'abierta' NOT NULL,
	"cobrada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "egreso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jornada_id" uuid NOT NULL,
	"tipo" "tipo_egreso" NOT NULL,
	"monto" numeric(10, 2) NOT NULL,
	"motivo" text NOT NULL,
	"pedido_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encargo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer GENERATED ALWAYS AS IDENTITY (sequence name "encargo_numero_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cliente_id" uuid NOT NULL,
	"fecha_entrega" date NOT NULL,
	"notas" text,
	"estado" "estado_encargo" DEFAULT 'pendiente' NOT NULL,
	"jornada_creacion_id" uuid NOT NULL,
	"pedido_id" uuid,
	"entregado_en" timestamp with time zone,
	"cancelado_en" timestamp with time zone,
	"motivo_cancelacion" text,
	"monto_devuelto" numeric(10, 2) DEFAULT '0' NOT NULL,
	"abono_retenido" boolean,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encargo_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"encargo_id" uuid NOT NULL,
	"producto_id" uuid,
	"es_libre" boolean DEFAULT false NOT NULL,
	"nombre_producto" text NOT NULL,
	"precio_unitario" numeric(10, 2) NOT NULL,
	"cantidad" integer NOT NULL,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jornada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"abierta_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrada_en" timestamp with time zone,
	"fondo_inicial" numeric(10, 2) DEFAULT '0' NOT NULL,
	"efectivo_contado" numeric(10, 2),
	"total_ventas" numeric(10, 2),
	"total_efectivo" numeric(10, 2),
	"total_tarjeta" numeric(10, 2),
	"total_transferencia" numeric(10, 2),
	"total_descuentos" numeric(10, 2),
	"total_propinas" numeric(10, 2),
	"total_perdidas" numeric(10, 2),
	"total_egresos" numeric(10, 2),
	"total_abonos_recibidos" numeric(10, 2),
	"total_abonos_devueltos" numeric(10, 2),
	"efectivo_esperado" numeric(10, 2),
	"diferencia_efectivo" numeric(10, 2),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mesero" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimiento_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producto_id" uuid NOT NULL,
	"jornada_id" uuid,
	"cantidad" integer NOT NULL,
	"stock_resultante" integer NOT NULL,
	"origen" "origen_movimiento" NOT NULL,
	"motivo" text,
	"pedido_item_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pago" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"metodo" "metodo_pago" NOT NULL,
	"monto" numeric(10, 2) NOT NULL,
	"referencia" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jornada_id" uuid NOT NULL,
	"numero_mesa" integer DEFAULT 0 NOT NULL,
	"numero" integer NOT NULL,
	"mesero_id" uuid,
	"origen" "origen_pedido" DEFAULT 'mesa' NOT NULL,
	"encargo_id" uuid,
	"estado" "estado_pedido" DEFAULT 'abierto' NOT NULL,
	"notas" text,
	"cobrado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ronda_id" uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"producto_id" uuid,
	"es_libre" boolean DEFAULT false NOT NULL,
	"nombre_producto" text NOT NULL,
	"precio_unitario" numeric(10, 2) NOT NULL,
	"cantidad" integer NOT NULL,
	"nota" text,
	"afecta_stock" boolean DEFAULT true NOT NULL,
	"anulado" boolean DEFAULT false NOT NULL,
	"motivo_anulacion" text,
	"anulado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "producto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"precio" numeric(10, 2) NOT NULL,
	"foto" text,
	"activo" boolean DEFAULT true NOT NULL,
	"controla_stock" boolean DEFAULT false NOT NULL,
	"stock_actual" integer,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ronda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"origen" "origen_ronda" NOT NULL,
	"enviada_a_cocina" boolean DEFAULT true NOT NULL,
	"estado" "estado_ronda" DEFAULT 'pendiente' NOT NULL,
	"lista_en" timestamp with time zone,
	"aviso_visto_mesero" boolean DEFAULT false NOT NULL,
	"aviso_visto_caja" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "abono" ADD CONSTRAINT "abono_encargo_id_encargo_id_fk" FOREIGN KEY ("encargo_id") REFERENCES "public"."encargo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abono" ADD CONSTRAINT "abono_jornada_id_jornada_id_fk" FOREIGN KEY ("jornada_id") REFERENCES "public"."jornada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuenta" ADD CONSTRAINT "cuenta_pedido_id_pedido_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedido"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuenta" ADD CONSTRAINT "cuenta_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egreso" ADD CONSTRAINT "egreso_jornada_id_jornada_id_fk" FOREIGN KEY ("jornada_id") REFERENCES "public"."jornada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egreso" ADD CONSTRAINT "egreso_pedido_id_pedido_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedido"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encargo" ADD CONSTRAINT "encargo_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encargo" ADD CONSTRAINT "encargo_jornada_creacion_id_jornada_id_fk" FOREIGN KEY ("jornada_creacion_id") REFERENCES "public"."jornada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encargo_item" ADD CONSTRAINT "encargo_item_encargo_id_encargo_id_fk" FOREIGN KEY ("encargo_id") REFERENCES "public"."encargo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encargo_item" ADD CONSTRAINT "encargo_item_producto_id_producto_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."producto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_producto_id_producto_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."producto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_jornada_id_jornada_id_fk" FOREIGN KEY ("jornada_id") REFERENCES "public"."jornada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_pedido_item_id_pedido_item_id_fk" FOREIGN KEY ("pedido_item_id") REFERENCES "public"."pedido_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago" ADD CONSTRAINT "pago_cuenta_id_cuenta_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuenta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_jornada_id_jornada_id_fk" FOREIGN KEY ("jornada_id") REFERENCES "public"."jornada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_mesero_id_mesero_id_fk" FOREIGN KEY ("mesero_id") REFERENCES "public"."mesero"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_encargo_id_encargo_id_fk" FOREIGN KEY ("encargo_id") REFERENCES "public"."encargo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_ronda_id_ronda_id_fk" FOREIGN KEY ("ronda_id") REFERENCES "public"."ronda"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_cuenta_id_cuenta_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuenta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_producto_id_producto_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."producto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producto" ADD CONSTRAINT "producto_categoria_id_categoria_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categoria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ronda" ADD CONSTRAINT "ronda_pedido_id_pedido_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedido"("id") ON DELETE no action ON UPDATE no action;