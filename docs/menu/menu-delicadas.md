# Menú real de la cafetería

Fuente: foto de la carta impresa que Dave envió el 2026-09-17. Transcripción literal de nombres y precios, en dólares, con el mismo orden y agrupación visual de la carta. La foto original no está en el repositorio; si se quiere conservarla, copiarla como `docs/menu/menu-delicadas.jpg`.

## Datos del local que figuran en la carta

| Dato | Valor |
|---|---|
| Nombre | "Delicadas" |
| Lema | Tradición Ambateña |
| Horario | Lunes a sábado, 11h00 a 20h00 |
| Teléfonos para pedidos y al por mayor | 0958948285, 0987057371 |
| Servicios indicados | Estacionamiento, WiFi, página de Facebook |

La línea "Pedidos y al por mayor" confirma el caso de encargos con abono diseñado el 2026-09-14 (spec, sección 4.4).

## Productos, en el orden de la carta

### Grupo 1

| Producto (texto de la carta) | Precio |
|---|---|
| Tortillas de maíz con queso (5 u) | 1.25 |
| Quimbolitos | 0.60 |
| Humitas | 0.80 |
| Tamales de gallina | 1.75 |
| Tortilla de verde (queso mozarella) | 1.00 |
| Tortilla de yuca | 1.00 |
| Pastel de maduro | 1.00 |

### Grupo 2

| Producto (texto de la carta) | Precio |
|---|---|
| Chochos | 1.25 |
| Ceviche de chochos familiar (4 porciones) con sardina | 8.00 |
| Ceviche de chochos familiar (4 porciones) con atún | 9.00 |
| Ceviche de chochos personal | 3.00 |
| Tostadas de queso | 1.00 |
| Tostadas mixta (jamón + mortadela + queso) | 2.00 |
| Sanduche de hornado | 2.00 |
| Sanduche de pollo | 2.00 |
| Choripán | 2.00 |
| Sanduche de jamón, mortadela o mixto | 2.00 |

### Grupo 3

| Producto (texto de la carta) | Precio |
|---|---|
| Ponche de chicha | 1.50 |
| Capuchino | 1.50 |
| Café o aromáticas | 0.50 |
| Leche | 0.80 |
| Chocolate ambateño | 1.50 |
| Chicha (jarra 1 L) | 1.60 |
| Chicha con cola (jarra 1 L) | 1.80 |

### Grupo 4

| Producto (texto de la carta) | Precio |
|---|---|
| Vaso de chicha | 0.70 |
| Jugos | 1.00 |
| Batidos | 1.50 |
| Gaseosas / minerales | 0.80 |

Frutas disponibles para jugos y batidos, según la carta: mora, frutilla, tomate, guanábana, naranjilla, naranja.

Total: 29 productos. Los precios ya incluyen todo; la cafetería no cobra impuestos (decisión del 2026-09-14).

## Relación con el diseño ya aprobado

- **Choripán a 2.00** es el producto del caso "ítem libre" del 2026-09-14: el choripán sin pan a 1.50 no está en la carta y se registra como ítem libre con texto y valor.
- **Quimbolitos** es el producto del caso de encargos: "30 quimbolitos el martes para el jueves".
- **Variantes sin precio propio** (sabor de jugo o batido, café o aromática, jamón o mortadela o mixto, gaseosa o mineral): con el diseño actual se registran como un solo producto y la variante va en la nota del ítem, que el mesero escribe y cocina ve. No hace falta cambiar el diseño.

## Preguntas abiertas para Dave (no se asume ninguna respuesta)

1. **Categorías del sistema.** La carta agrupa visualmente en cuatro bloques sin nombre. Propuesta para el catálogo, pendiente de confirmar: "Tradicionales" (grupo 1), "Chochos y ceviches" (chochos y ceviches del grupo 2), "Tostadas y sanduches" (resto del grupo 2), "Bebidas" (grupos 3 y 4).
2. **Qué productos llevan control de stock.** Dave dijo el 2026-09-12 que algunos productos empiezan el día con cantidad limitada. La carta no lo indica. Hay que saber cuáles.
3. **Ceviche familiar con sardina y con atún:** ¿dos productos separados, como están transcritos, o uno con la variante en la nota? Tienen precios distintos, así que la propuesta es dos productos.
4. **Menú de ejemplo del sistema:** el plan 3, tarea 6, carga un menú ficticio para probar. ¿Se reemplaza por este menú real? El archivo `menu-delicadas.json` ya lo deja listo para eso.
