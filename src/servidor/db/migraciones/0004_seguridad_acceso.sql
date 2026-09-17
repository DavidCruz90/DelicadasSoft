-- Seguridad de acceso (spec 2026-09-17, sección 4). Generada con drizzle-kit
-- y editada a mano: la tabla mesero NO se crea de nuevo, se RENOMBRA a
-- usuario para conservar los meseros existentes, y pedido.mesero_id se
-- renombra a usuario_id. drizzle-kit habría preguntado "¿creada o
-- renombrada?" en una terminal interactiva, que un agente no tiene; por eso
-- el esquema se cambió en dos pasos (plan de seguridad, Task 1) y esta
-- migración lleva el renombre escrito a mano. La 0005 solo alinea el
-- snapshot de drizzle-kit.
CREATE TYPE "public"."estado_dispositivo" AS ENUM('pendiente', 'autorizado', 'revocado');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('mesero', 'caja', 'admin');--> statement-breakpoint
ALTER TABLE "mesero" RENAME TO "usuario";--> statement-breakpoint
ALTER TABLE "usuario" RENAME CONSTRAINT "mesero_pkey" TO "usuario_pkey";--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "rol" "rol_usuario" DEFAULT 'mesero' NOT NULL;--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "pin_hash" text;--> statement-breakpoint
ALTER INDEX "mesero_nombre_activo_unico" RENAME TO "usuario_nombre_activo_unico";--> statement-breakpoint
ALTER TABLE "pedido" RENAME COLUMN "mesero_id" TO "usuario_id";--> statement-breakpoint
ALTER TABLE "pedido" RENAME CONSTRAINT "pedido_mesero_id_mesero_id_fk" TO "pedido_usuario_id_usuario_id_fk";--> statement-breakpoint
CREATE TABLE "cambio_precio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producto_id" uuid NOT NULL,
	"precio_anterior" numeric(10, 2) NOT NULL,
	"precio_nuevo" numeric(10, 2) NOT NULL,
	"usuario_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispositivo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text,
	"codigo" text,
	"token_hash" text NOT NULL,
	"estado" "estado_dispositivo" DEFAULT 'pendiente' NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"solicitado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"autorizado_en" timestamp with time zone,
	"autorizado_por" uuid,
	"ultimo_uso_en" timestamp with time zone,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intento_fallido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispositivo_id" uuid,
	"usuario_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"token_hash" text NOT NULL,
	"ultimo_uso_en" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_en" timestamp with time zone,
	"cerrada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cambio_precio" ADD CONSTRAINT "cambio_precio_producto_id_producto_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."producto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cambio_precio" ADD CONSTRAINT "cambio_precio_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivo" ADD CONSTRAINT "dispositivo_autorizado_por_usuario_id_fk" FOREIGN KEY ("autorizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intento_fallido" ADD CONSTRAINT "intento_fallido_dispositivo_id_dispositivo_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intento_fallido" ADD CONSTRAINT "intento_fallido_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_dispositivo_id_dispositivo_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX dispositivo_token_hash_unico ON dispositivo (token_hash);--> statement-breakpoint
CREATE UNIQUE INDEX dispositivo_codigo_pendiente_unico ON dispositivo (codigo) WHERE estado = 'pendiente';--> statement-breakpoint
CREATE UNIQUE INDEX sesion_token_hash_unico ON sesion (token_hash);--> statement-breakpoint
CREATE INDEX sesion_viva_por_usuario ON sesion (usuario_id) WHERE cerrada_en IS NULL;--> statement-breakpoint
CREATE INDEX intento_fallido_por_fecha ON intento_fallido (creado_en);--> statement-breakpoint
CREATE INDEX cambio_precio_por_producto ON cambio_precio (producto_id, creado_en);
