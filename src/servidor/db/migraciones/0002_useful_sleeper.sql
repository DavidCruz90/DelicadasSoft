ALTER TABLE "encargo" ADD CONSTRAINT "encargo_pedido_id_pedido_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedido"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX configuracion_fila_unica ON configuracion ((true));
--> statement-breakpoint
CREATE UNIQUE INDEX pedido_encargo_unico ON pedido (encargo_id) WHERE encargo_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX encargo_numero_unico ON encargo (numero);