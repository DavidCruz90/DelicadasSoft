-- Garantiza a nivel de base que no puede haber dos meseros activos con el
-- mismo nombre (sin distinguir mayusculas), cerrando la ventana entre la
-- comprobacion de la aplicacion y la escritura cuando llegan dos peticiones
-- a la vez. El nombre del mesero es el unico rastro de quien tomo cada
-- pedido, porque el sistema no usa contrasenas.
CREATE UNIQUE INDEX mesero_nombre_activo_unico ON mesero (lower(nombre)) WHERE activo;
