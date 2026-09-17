# Formato CSV para cargar el menú

Formato para cargar o actualizar el menú completo de una cafetería de una sola vez, desde Excel o cualquier hoja de cálculo. Sirve para Delicadas y para cualquier otra cafetería que use el sistema. Decidido con Dave el 2026-09-17.

Archivos de referencia en el repositorio:
- Plantilla vacía con tres filas de ejemplo: `src/servidor/recursos/plantilla-menu.csv`. En el sistema: Admin → Importar menú → "Descargar plantilla".
- Menú real de Delicadas en este formato: `src/servidor/recursos/menu-delicadas.csv`. En el sistema: Admin → Importar menú → "Cargar menú de Delicadas".

## Columnas

La primera fila es el encabezado. El orden de las columnas es libre. Los nombres no distinguen mayúsculas ni tildes, y un espacio equivale a guion bajo: "Controla stock" vale igual que `controla_stock`.

| Columna | Obligatoria | Qué va | Si está vacía |
|---|---|---|---|
| `categoria` | Sí | Nombre de la categoría, hasta 80 caracteres. Si no existe, se crea. | Error en la fila |
| `producto` | Sí | Nombre del producto, hasta 120 caracteres. | Error en la fila |
| `precio` | Sí | Precio final en dólares, entre 0 y 99999999,99, con hasta 2 decimales. Vale `1,25`, `1.25` o `$1,25`. No vale `1.250,00` (dos separadores). | Error en la fila |
| `controla_stock` | No | `si` o `no` (también `sí`). | `no` |
| `stock_inicial` | No | Entero de 0 a 1000000. Solo se usa al crear el producto o al activarle el control de stock. | `0` |
| `descripcion` | No | Texto de hasta 300 caracteres que ve el mesero. | Al crear: sin descripción. Al actualizar: se conserva la que había. |
| `orden_categoria` | No | Entero de 0 a 1000000: posición de la categoría en pantalla. Todas las filas de una misma categoría deben traer el mismo valor o dejarlo vacío. | Al crear: 0. Al actualizar: se conserva. |
| `orden_producto` | No | Entero de 0 a 1000000: posición del producto dentro de su categoría. | Al crear: 0. Al actualizar: se conserva. |

Cualquier otra columna hace que se rechace el archivo entero, para detectar errores de tipeo como `precio_unitario`.

## Archivo

- Separador: punto y coma `;`. También se acepta coma `,` si toda la primera fila usa comas.
- Codificación: UTF-8. En Excel: "Guardar como" → "CSV UTF-8 (delimitado por comas)". Si se guarda como CSV normal de Windows, también se lee y las tildes se conservan.
- Un texto que contenga `;` o saltos de línea va entre comillas dobles; una comilla dentro del texto se escribe doble `""`. Excel lo hace solo.
- Las filas completamente vacías se ignoran.
- Tamaño máximo 1 MB y 2000 productos.

## Qué hace la carga

1. **Vista previa primero.** Al subir el archivo, el sistema muestra cada fila con su número de fila de Excel y lo que hará: crear, actualizar, sin cambios, o error con el motivo. No se guarda nada hasta pulsar "Confirmar carga".
2. **Un producto se identifica por categoría y nombre**, sin distinguir mayúsculas ni espacios de más. "Bebidas / Café" y "bebidas / CAFÉ" son el mismo producto. Las tildes sí cuentan: "Cafe" y "Café" son distintos.
3. **Si el producto ya existe, se actualiza** con los datos del archivo: precio, descripción, orden y control de stock. Si estaba desactivado, se reactiva; igual su categoría.
4. **El stock que ya existe nunca se cambia por CSV.** Solo cambia en la apertura de caja o con un ajuste con motivo. Si el archivo trae `stock_inicial` para un producto que ya controla stock, se ignora y la vista previa lo avisa.
5. **Activar o desactivar el control de stock deja registro.** Activarlo crea un movimiento "Stock inicial" con el `stock_inicial` del archivo. Desactivarlo crea un movimiento que lleva el stock a cero, con motivo "Control de stock desactivado".
6. **Las filas con error no se cargan; las demás sí.** Al confirmar se cargan todas las filas válidas juntas y se listan las que fallaron, para corregirlas y volver a subir el archivo. Volver a subir no duplica nada.
7. **Los productos que no están en el archivo no se tocan.** El CSV no borra ni desactiva nada.
8. **Nombre repetido dentro del mismo archivo:** la segunda aparición es un error que indica la fila de la primera.

## Menú de Delicadas en este formato

- 28 productos en 4 categorías: Tradicionales, Chochos y ceviches, Tostadas y sanduches, Bebidas.
- Con control de stock: Tortillas de maíz con queso (5 u), Quimbolitos, Humitas, Tamales de gallina. Se cargan con stock 0: la cantidad real de cada día se escribe en la apertura de caja. Hasta entonces aparecen como agotados.

## Para usarlo en otra cafetería

1. Admin → Importar menú → "Descargar plantilla".
2. Abrir en Excel, borrar las tres filas de ejemplo y escribir el menú propio.
3. Guardar como "CSV UTF-8 (delimitado por comas)".
4. Admin → Importar menú → elegir el archivo → "Ver vista previa" → revisar → "Confirmar carga".
5. Para cambiar precios más adelante: Admin → Importar menú → "Descargar menú actual", editar en Excel, y volver a cargar.
