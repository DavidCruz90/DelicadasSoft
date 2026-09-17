# Seguridad de acceso al Núcleo POS — Diseño

Fecha: 2026-09-17
Estado: aprobado en conversación por Dave, pendiente de revisión escrita
Módulo: 1 de 4 (Núcleo POS). Complementa `2026-09-12-nucleo-pos-design.md`, que queda modificado en los puntos que la sección 12 detalla.

## 1. Por qué existe este documento

El diseño del 2026-09-12 decidió "sin login ni contraseñas", y escribió como riesgo aceptado que cualquier dispositivo de la WiFi del local puede abrir `/admin`. La mitigación que hacía tolerable ese riesgo era "la WiFi tiene contraseña y no se comparte con clientes".

El 2026-09-17 Dave informó que **la WiFi del local sí se comparte con los clientes**. La mitigación nunca fue real: hoy un cliente sentado en una mesa, con la dirección del sistema, puede cambiar precios, borrar el menú, anular pedidos o cerrar la caja.

Este documento reemplaza esa decisión. El acceso pasa a estar controlado por tres capas independientes: el aparato debe estar autorizado, la persona debe escribir su PIN, y su rol debe permitirle lo que intenta hacer.

## 2. Decisiones tomadas (Dave, 2026-09-17)

| Tema | Decisión |
|---|---|
| Usuarios | Tabla única de usuarios con tres roles: mesero, caja, admin. Reemplaza la tabla `mesero`. |
| Entrada | Se elige el nombre de una lista y se escribe un PIN de 4 dígitos. Los PIN **no** necesitan ser únicos. |
| Duración de la sesión | Mesero: hasta que se cierre la jornada o toque "Salir". Caja: 30 minutos de inactividad. Admin: 15 minutos. |
| Bloqueo | Bloquear no pierde el trabajo en pantalla: el teclado de PIN se pone encima y al desbloquear se vuelve al mismo punto. |
| Dispositivos | Lista blanca. El aparato nuevo muestra un código de 4 dígitos y el administrador lo autoriza desde `/admin`. |
| Cocina | `/cocina` exige dispositivo autorizado pero **no** pide PIN. Es un monitor fijo y no muestra dinero ni precios. |
| Primer arranque | Pantalla de instalación en la PC de caja: crea el primer usuario administrador. Nada funciona hasta completarla. |
| Recuperación | "Restablecer PIN de administrador" solo con acceso físico a la PC de caja. |
| Cambios de precio | Quedan registrados con producto, precio anterior, precio nuevo, quién y cuándo. |
| Cuándo se construye | En un plan propio, **antes** del plan 2 (Operación). |

## 3. Las tres capas

```
Petición del navegador
  │
  ├─ Capa 1  ¿el dispositivo está autorizado?        no → 403, pantalla con código de autorización
  │
  ├─ Capa 2  ¿hay sesión viva?                       no → 401, teclado de PIN encima de la pantalla
  │
  └─ Capa 3  ¿el rol permite esta ruta?              no → 403, "No tienes permiso"
```

Las tres viven en **un único guardia** (hook `onRequest` de Fastify) que se aplica a todo `/api/*`. Es único a propósito: si cada ruta decidiera por su cuenta, una quedaría abierta tarde o temprano. Añadir una ruta nueva sin declararla la deja protegida por omisión, no expuesta.

### 3.1 Excepciones del guardia, lista cerrada

| Ruta | Capa 1 | Capa 2 | Motivo |
|---|---|---|---|
| `GET/POST /api/instalacion` | exenta | exenta | No hay usuarios todavía. Solo responde desde 127.0.0.1 y solo mientras no exista ningún admin activo. |
| `POST /api/dispositivos/solicitar` | exenta | exenta | Es cómo un aparato pide entrar. |
| `GET /api/dispositivos/estado` | exenta | exenta | El aparato pendiente consulta si ya lo autorizaron. |
| `GET /api/sesion/usuarios` | exige | exenta | Lista de nombres para el teclado de PIN. |
| `POST /api/sesion` | exige | exenta | Entrar con PIN. |
| `GET /api/estado`, `GET /api/catalogo` | exige | exenta | Los necesita `/cocina`, que no tiene sesión. |
| `GET /api/cocina/*`, `POST /api/rondas/:id/lista` | exige | exenta | Pantalla de cocina, sin PIN por decisión de diseño. |
| `GET /api/eventos` | exige | exenta | Canal de avisos en vivo. La pantalla de cocina no tiene sesión y lo necesita para enterarse de una ronda nueva. Solo emite avisos de que algo cambió, nunca datos. |
| Todo lo demás bajo `/api/` | exige | exige | Por omisión. |

Fuera del guardia quedan los archivos de las pantallas (`/`, `/admin`, `/mesero`, `/caja`, `/cocina`, JS y CSS) y `/fotos/`. Las pantallas tienen que poder cargar para mostrar "aparato no autorizado"; las fotos son imágenes del menú, sin valor que proteger, y dejarlas libres evita complicar el `<img>` de cada producto.

### 3.2 Permisos por rol

| Rol | Puede abrir |
|---|---|
| mesero | `/mesero` |
| caja | `/caja` y `/mesero` |
| admin | todas |

Cada ruta de la API declara los roles que la admiten. Regla general: rutas bajo `/api/admin/` son solo de admin; las de cobro, jornada, egresos y encargos son de caja y admin; las de pedidos y rondas son de mesero, caja y admin.

## 4. Modelo de datos

### 4.1 usuario (reemplaza `mesero`)

- `nombre`, `rol` (enum: `mesero`, `caja`, `admin`), `pin_hash` (texto, nulo si aún no tiene PIN), `activo`.
- La migración **renombra** la tabla `mesero` a `usuario`, añade `rol` con valor `mesero` para las filas existentes y `pin_hash` nulo. El índice único parcial `mesero_nombre_activo_unico` se renombra y conserva su comportamiento: nombre único entre los activos, sin distinguir mayúsculas.
- Un usuario con `pin_hash` nulo no aparece en la lista de entrada y no puede iniciar sesión. Admin lo muestra como "Sin PIN".
- El PIN se guarda con `scrypt` de `node:crypto` (sal aleatoria por usuario), nunca en claro. Se eligió `scrypt` por ser parte de Node: no añade dependencias al paquete de Windows.
- El PIN son exactamente 4 dígitos (`0000` a `9999`). No hay requisito de unicidad entre usuarios.
- El PIN **nunca** viaja de vuelta al navegador, ni en claro ni cifrado, en ninguna respuesta de ninguna ruta.

### 4.2 dispositivo

- `nombre` (nulo mientras está pendiente), `codigo` (4 dígitos, único entre los pendientes vigentes), `token_hash`, `estado` (enum: `pendiente`, `autorizado`, `revocado`), `descripcion` (resumen legible del navegador, por ejemplo "Chrome en Android"), `solicitado_en`, `autorizado_en`, `autorizado_por` (usuario_id, nulo), `ultimo_uso_en`, `intentos_fallidos` (entero), `bloqueado_hasta` (nulo).
- El token es aleatorio de 32 bytes, se entrega una sola vez al navegador, que lo guarda, y en el servidor solo queda su huella (SHA-256; no hace falta un hash lento porque el token no es adivinable).
- Las solicitudes pendientes caducan a los 10 minutos y se borran al listar o al crear una nueva.
- Revocar pone `estado` en `revocado`: el token deja de servir en la siguiente petición y las sesiones abiertas de ese aparato se cierran.

### 4.3 sesion

- `usuario_id`, `dispositivo_id` (nulo si es la PC de caja), `token_hash`, `creada_en`, `ultimo_uso_en`, `expira_en` (nulo para rol mesero), `cerrada_en` (nulo mientras viva).
- Caja y admin: `expira_en` se recalcula en cada petición (30 y 15 minutos). Mesero: sin expiración por inactividad.
- Al cerrar la jornada se cierran todas las sesiones de rol `mesero`.

### 4.4 intento_fallido

- `dispositivo_id`, `usuario_id` (a quién se le intentó el PIN), `ocurrido_en`.
- A los 5 fallos desde un mismo dispositivo, se llena `bloqueado_hasta` con 5 minutos en el futuro. Entrar bien pone `intentos_fallidos` en 0.
- Admin muestra los últimos intentos fallidos junto a la lista de dispositivos.

### 4.5 cambio_precio

- `producto_id`, `precio_anterior`, `precio_nuevo`, `usuario_id`, `creado_en`.
- Se escribe dentro de la misma transacción que cambia el precio, y solo cuando el precio realmente cambia.
- Todos los caminos que cambian un precio escriben aquí: la edición del producto en admin y la carga masiva por CSV (plan 3, tarea 6). Es el mismo criterio que la spec principal ya aplica a `movimiento_stock`: un campo auditado se registra en **todos** sus caminos de escritura, no solo en el más obvio.

## 5. Flujos

### 5.1 Primer arranque

1. El sistema recién instalado no tiene ningún usuario admin activo. `GET /api/instalacion` responde `{ instalado: false }`.
2. Cualquier pantalla que reciba eso muestra la pantalla de instalación.
3. En la PC de caja se escribe nombre del administrador, PIN y su confirmación. `POST /api/instalacion` crea el usuario con rol `admin`.
4. La ruta solo acepta peticiones desde `127.0.0.1`/`::1` y solo mientras no exista un admin activo. Después responde 409 siempre.
5. Termina y entra a `/admin`, ya con sesión iniciada.

### 5.2 Autorizar un dispositivo

1. El navegador busca su token guardado. Si no tiene, llama `POST /api/dispositivos/solicitar` y recibe un código de 4 dígitos y un identificador de espera.
2. La pantalla muestra: "Este dispositivo no está autorizado. Código: 4821." Sin nombre del local ni ningún dato del negocio.
3. El navegador consulta `GET /api/dispositivos/estado` cada pocos segundos.
4. El administrador, en `/admin` → Dispositivos, ve el código esperando, le pone nombre ("Celular de Ana") y autoriza.
5. La siguiente consulta del navegador devuelve el token definitivo. Lo guarda y la pantalla continúa sola, sin recargar.
6. La PC de caja no pasa por esto: las peticiones desde `127.0.0.1`/`::1` se consideran siempre de un dispositivo autorizado. Es lo que evita quedar encerrado sin ningún aparato desde el cual autorizar al primero. **Solo se salta la capa 1: el PIN se exige igual**, y quien tiene acceso físico a esa máquina ya puede apagarla o llevársela, así que no se pierde ninguna protección real.

### 5.3 Entrar con PIN

1. La pantalla pide `GET /api/sesion/usuarios`: nombres y roles de los usuarios activos **con PIN puesto**.
2. Muestra la lista. El aparato recuerda quién entró la última vez y lo deja preseleccionado.
3. Se elige el nombre y se escriben 4 dígitos en un teclado numérico grande.
4. `POST /api/sesion` con usuario y PIN. Si es correcto devuelve el token de sesión; si no, un error genérico "PIN incorrecto" que nunca dice si el usuario existe.
5. A los 5 fallos, ese dispositivo queda bloqueado 5 minutos: responde 429 "Demasiados intentos. Espera 5 minutos."

### 5.4 Bloqueo y salida

- Cuando el servidor responde 401 por sesión vencida, la pantalla **no navega a otro lado**: pone el teclado de PIN encima de lo que hay, conservando el estado en memoria (ronda a medio armar, cuenta a medio dividir). Al desbloquear reintenta la petición que falló y sigue donde estaba.
- El botón "Salir" está siempre visible, cierra la sesión en el servidor y borra el token de sesión del navegador. **No** borra el token del dispositivo: el aparato sigue autorizado.
- En la pantalla de mesero, "Salir" reemplaza al botón "Cambiar" que la spec principal describe en 7.1.

### 5.5 Recuperar el PIN de administrador

- Un comando que se ejecuta en la PC de caja (`npm run restablecer-pin`, y en el paquete final la opción del lanzador) pide el nombre del administrador y un PIN nuevo, y lo escribe.
- Solo funciona con acceso físico a esa máquina: no se expone por la red en ninguna forma.
- **El lanzador de Windows se construye en el plan 4**, así que hasta entonces la recuperación existe solo como comando. Queda como requisito del plan 4, Task 3.

## 6. Reglas de negocio

Continúan la numeración de la spec principal, que llega a la regla 20.

21. Ninguna ruta bajo `/api/` responde sin dispositivo autorizado, salvo las tres de instalación y solicitud de dispositivo listadas en 3.1.
22. Ninguna ruta bajo `/api/` responde sin sesión viva, salvo las listadas como exentas de capa 2 en 3.1. Las exentas de sesión (catálogo, estado, cocina y el canal de eventos) exigen dispositivo autorizado y no exponen dinero, clientes ni ventas.
23. Una ruta cuyo rol no coincide responde 403 y no ejecuta nada.
24. El PIN son 4 dígitos, se guarda cifrado con sal por usuario, y no se devuelve nunca en ninguna respuesta.
25. Los PIN no necesitan ser únicos: el PIN se compara solo contra el usuario elegido.
26. 5 intentos fallidos desde un dispositivo lo bloquean 5 minutos. Un ingreso correcto reinicia el contador.
27. No se puede desactivar ni borrar al último usuario admin activo.
28. Revocar un dispositivo invalida su token y cierra sus sesiones de inmediato.
29. Cerrar la jornada cierra todas las sesiones de rol mesero.
30. Todo cambio de precio de un producto queda registrado con precio anterior, precio nuevo, usuario y fecha, por cualquier camino que lo cambie.
31. La instalación inicial solo se acepta desde la propia PC de caja y solo mientras no exista ningún admin activo.

## 7. API

**Instalación**
- `GET /api/instalacion` → `{ instalado }`
- `POST /api/instalacion` `{ nombre, pin }` → crea el primer admin e inicia sesión

**Dispositivos**
- `POST /api/dispositivos/solicitar` → `{ codigo, espera_id }`
- `GET /api/dispositivos/estado?espera_id=` → `{ estado }` y, si fue autorizado, `{ token }`
- `GET /api/admin/dispositivos` → pendientes, autorizados y últimos intentos fallidos
- `POST /api/admin/dispositivos/:id/autorizar` `{ nombre }`
- `POST /api/admin/dispositivos/:id/revocar`

**Sesión**
- `GET /api/sesion/usuarios` → `[{ id, nombre, rol }]` (activos y con PIN)
- `POST /api/sesion` `{ usuario_id, pin }` → `{ token, usuario }`
- `DELETE /api/sesion` → cierra la sesión
- `GET /api/sesion` → `{ usuario, expira_en }` para que la pantalla sepa quién es

**Usuarios** (reemplaza las rutas de meseros del plan 1)
- `GET /api/admin/usuarios`
- `POST /api/admin/usuarios` `{ nombre, rol, pin }`
- `PATCH /api/admin/usuarios/:id` `{ nombre?, rol?, activo? }`
- `POST /api/admin/usuarios/:id/pin` `{ pin }`

**Precios**
- `GET /api/admin/productos/:id/precios` → historial de cambios

## 8. Pantallas

- **Instalación** `/instalacion`: solo en el primer arranque. Nombre, PIN, confirmar PIN.
- **Aparato no autorizado**: código de 4 dígitos en grande y una línea de instrucción. Sin nombre del local, sin menú, sin nada del negocio.
- **Teclado de PIN**: lista de nombres con el último usado preseleccionado, teclado numérico grande, punto por dígito escrito, mensaje de error genérico. Aparece como pantalla completa al entrar y como capa encima al bloquearse.
- **Admin → Usuarios** (era "Meseros"): nombre, rol, activo, "Cambiar PIN", aviso "Sin PIN" en quien no lo tenga. No se puede desactivar al último admin.
- **Admin → Dispositivos**: pendientes (código, navegador, hace cuánto, campo de nombre y "Autorizar"); autorizados (nombre, último uso, "Quitar acceso"); y los últimos intentos fallidos con aparato, usuario y hora.
- **Admin → Menú → producto**: "Historial de precios" con precio anterior, nuevo, quién y cuándo.
- **Barra superior de toda pantalla con sesión**: nombre de quien está dentro y botón "Salir".

## 9. Manejo de errores

| Situación | Respuesta | Qué ve la persona |
|---|---|---|
| Dispositivo sin token o revocado | 403 | Pantalla de código de autorización |
| Sin sesión o vencida | 401 | Teclado de PIN encima, sin perder el trabajo |
| Rol insuficiente | 403 | "No tienes permiso para esta pantalla" |
| PIN incorrecto | 401 | "PIN incorrecto", sin decir si el usuario existe |
| Dispositivo bloqueado | 429 | "Demasiados intentos. Espera 5 minutos." |
| Instalación ya hecha o desde la red | 409 / 403 | "El sistema ya está configurado" |

## 10. Pruebas

Con PostgreSQL real, como el resto del proyecto.

- **Barrido de rutas:** una prueba recorre **todas** las rutas registradas en Fastify y verifica que ninguna responde sin dispositivo y sin sesión, salvo la lista blanca de 3.1, que está escrita en la propia prueba. Es la prueba que evita que una ruta futura nazca abierta.
- Cada rol contra cada grupo de rutas: lo que le toca responde, lo que no, 403.
- Revocar un dispositivo corta el acceso en la petición siguiente.
- Expiración por inactividad: caja a los 30 minutos, admin a los 15, mesero no expira.
- Cerrar jornada cierra las sesiones de mesero y no las de caja ni admin.
- 5 intentos fallidos bloquean 5 minutos; el sexto responde 429 aunque el PIN sea correcto.
- Dos usuarios con el mismo PIN entran cada uno como sí mismo.
- El último admin activo no se puede desactivar ni borrar.
- `POST /api/instalacion` desde una IP que no es local responde 403; repetida responde 409.
- Ninguna respuesta de ninguna ruta contiene `pin` ni `pin_hash`.
- El canal de eventos responde con dispositivo autorizado y sin sesión, y no responde sin dispositivo.
- Cambiar el precio de un producto deja exactamente un registro; editar el producto sin tocar el precio no deja ninguno.
- Tipos antes que rangos en todos los cuerpos nuevos (`exigirObjeto`, `exigirUuid` de `errores.ts`), como manda el aprendizaje del 2026-09-17.

## 11. Recomendación de instalación, fuera del software

La protección más barata y más efectiva no se programa: **poner el POS en una red WiFi distinta de la de los clientes**, usando la "red de invitados" que casi todo router tiene.

Motivo concreto: dentro de una red local el tráfico entre el navegador y el servidor va sin cifrar, así que alguien con conocimientos y conectado a la misma red podría llegar a interceptar un PIN en tránsito. Las tres capas de este diseño lo hacen difícil; una red aparte lo hace innecesario. Cifrar el tráfico (HTTPS) en una red local sin dominio propio obliga a certificados que el navegador rechaza con avisos, y para este tamaño de local no compensa.

Debe quedar escrito en el manual del plan 4.

## 12. Cambios a la spec principal

En `2026-09-12-nucleo-pos-design.md`:

1. Tabla de decisiones, fila "Usuarios": deja de decir "Sin login ni contraseñas. Meseros se eligen de una lista" y pasa a "Usuarios con rol (mesero, caja, admin) y PIN de 4 dígitos. Lista blanca de dispositivos. Ver `2026-09-17-seguridad-acceso-design.md`".
2. Sección 4.1: `mesero` pasa a `usuario` con `rol` y `pin_hash`.
3. Sección 4.2, `pedido.mesero_id` pasa a `usuario_id`.
4. Sección 7.1: "elegir nombre de la lista" pasa a "entrar con PIN"; el botón "Cambiar" pasa a "Salir".
5. Sección 7.4: la pestaña "Meseros" pasa a "Usuarios"; se añade "Dispositivos"; el producto gana "Historial de precios".
6. Sección 10, fuera del alcance: se quita "Login o PIN" y se añade "HTTPS, permisos a medida por pantalla, cambio de PIN por el propio usuario, rechazo de PIN débiles".

## 13. Fuera del alcance

Contraseñas largas o usuarios con correo, permisos a medida por pantalla, que cada usuario cambie su propio PIN, rechazar PIN fáciles de adivinar (1234, 0000), HTTPS, registro de cambios de admin distintos del precio, bloqueo por usuario además de por dispositivo, y expulsar sesiones a distancia desde admin.
