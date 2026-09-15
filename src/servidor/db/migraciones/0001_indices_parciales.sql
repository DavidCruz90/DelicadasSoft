CREATE UNIQUE INDEX jornada_abierta_unica ON jornada ((cerrada_en IS NULL)) WHERE cerrada_en IS NULL;
CREATE UNIQUE INDEX pedido_mesa_abierto_unico ON pedido (numero_mesa) WHERE estado = 'abierto' AND numero_mesa > 0;
CREATE UNIQUE INDEX cliente_identificacion_unica ON cliente (tipo_identificacion, identificacion)
  WHERE identificacion IS NOT NULL AND tipo_identificacion IS NOT NULL AND tipo_identificacion <> 'consumidor_final';
CREATE UNIQUE INDEX pedido_numero_por_jornada ON pedido (jornada_id, numero);
CREATE UNIQUE INDEX cuenta_numero_por_pedido ON cuenta (pedido_id, numero);
CREATE UNIQUE INDEX ronda_numero_por_pedido ON ronda (pedido_id, numero);
CREATE INDEX pedido_item_por_cuenta ON pedido_item (cuenta_id);
CREATE INDEX movimiento_stock_por_producto ON movimiento_stock (producto_id, creado_en);
CREATE INDEX encargo_por_fecha ON encargo (fecha_entrega, estado);
