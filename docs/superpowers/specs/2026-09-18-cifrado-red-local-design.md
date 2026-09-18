# Cifrado de la red local — Diseño

Fecha: 2026-09-18
Estado: aprobado en conversación por Dave, pendiente de revisión escrita
Módulo: 1 de 4 (Núcleo POS), fase 2 (seguridad de acceso). Reemplaza la sección 11 de `2026-09-17-seguridad-acceso-design.md`.

## 1. Por qué existe este documento

La spec de seguridad del 2026-09-17 decidió no cifrar el tráfico de la red local (sección 11) y recomendó poner el POS en una WiFi separada. Dave señaló el 2026-09-18 que eso es un fallo grave: la WiFi del local **se comparte con los clientes**, y con herramientas gratuitas (Wireshark, Bettercap) cualquiera conectado captura el tráfico en claro. En concreto, vería el **PIN** al escribirse, y las **cookies** `dispositivo` y `sesion`, que viajan en cada petición y con las que puede hacerse pasar por ese aparato y esa persona, incluido el administrador. Contra ese atacante, las tres capas de la fase 2 no alcanzan. La decisión de no cifrar fue un error de diseño; este documento la corrige.

## 2. Decisiones tomadas (Dave, 2026-09-18)

| Tema | Decisión |
|---|---|
| Cifrado | Todo el tráfico entre aparatos y servidor va por HTTPS. |
| Confianza en el certificado | **Autoridad de certificados propia de cada local** ("el sello de la cafetería"), creada por el sistema en la PC de caja. Cada aparato la instala una vez. Descartado el certificado público con dominio (camino B) por depender de internet, de una cuenta DNS externa, de IP fija y del router, y porque Dave tendría que operarlo para cada cafetería. Descartado el certificado sin sello confiable, porque enseña al personal a aceptar advertencias y con eso también aceptaría la del atacante. |
| Aparatos | Son del local (no los teléfonos personales del personal), así que instalar el sello en ellos es aceptable. |
| Internet | Delicadas tiene internet estable, pero el cifrado no depende de él. |
| Cuándo se instala el sello | Una sola vez por aparato, en el mismo momento en que se autoriza, **con el local cerrado y sin clientes en la WiFi**. |
| Cuándo se construye | Plan propio, dentro de la fase 2, después del cierre del plan de seguridad y antes del plan 2 (operación). Dave prueba la fase 2 una sola vez, al final, ya con cifrado. |

## 3. Cómo se usa

**En la PC de caja.** Al primer arranque se crea el sello. El lanzador de Windows (plan 4) lo instala en el almacén de confianza de Windows (una confirmación de permisos) para que el navegador de la PC de caja abra el sistema cifrado sin advertencias.

**En cada aparato del local, una vez:**
1. Escanea el QR que muestra la PC de caja: abre la **página de inicio** por la puerta sin cifrar, con "Paso 1: instala el sello de la cafetería", un botón de descarga y las instrucciones para Android y para iPhone, con imágenes y sin jerga.
2. Instala el sello.
3. Toca "Paso 2: abrir el sistema", que lleva a la puerta cifrada, y sigue el flujo de autorización de siempre (código de 4 dígitos, spec de seguridad 5.2).

**Regla operativa, obligatoria en el manual:** instalar el sello con el local cerrado, sin clientes en la red. La descarga del sello es lo único que viaja sin cifrar; con nadie ajeno conectado, nadie puede sustituirlo por uno falso.

## 4. Arquitectura

### 4.1 Dos puertas

- **Puerta cifrada (HTTPS), puerto 3000.** Sirve todo: pantallas, API y `/api/eventos`. Las reglas de la spec de seguridad (tres capas, `esLocal` con IP y `Host` locales) aplican igual.
- **Puerta de inicio (HTTP sin cifrar), puerto 3001.** Sirve **solo**:
  - `GET /` → página de inicio con los pasos 1 y 2.
  - `GET /sello.crt` → el certificado público del sello (nunca su clave privada), con `content-type: application/x-x509-ca-cert`. Android lo instala desde Ajustes tras descargarlo; iPhone lo abre desde Safari como perfil y luego se habilita en Ajustes → General → Información → Ajustes de confianza de certificados. No hace falta un perfil `.mobileconfig`.
  - Imágenes de las instrucciones.
  - Cualquier otra ruta, incluida toda `/api/...` → redirección 301 a `https://<mismo nombre de host>:3000<misma ruta>`, sin cuerpo. **Ninguna ruta de la API ni del negocio responde por la puerta de inicio.** Las pantallas usan siempre rutas relativas desde la puerta cifrada, así que nunca envían datos a la de inicio.

### 4.2 El sello y los certificados

- **Sello (autoridad raíz):** clave ECDSA P-256, vigencia 10 años, nombre "Sello de <nombre del local>". Se crea al primer arranque si no existe.
- **Certificado del servidor:** firmado por el sello, clave ECDSA P-256, **vigencia 365 días** (por debajo del máximo de 825 días que exigen los sistemas de Apple para cualquier certificado de servidor). Nombres alternativos: `localhost`, `127.0.0.1`, `::1` y **todas las direcciones IPv4 de red** de la PC en ese momento.
- **Renovación automática:** al arrancar, el servidor reemite su certificado si le quedan menos de 30 días o si las direcciones de red actuales no coinciden con las del certificado. Los aparatos no se enteran: confían en el sello, no en el certificado.
- **Dónde se guardan:** en `datos/certificados/` dentro de la carpeta del programa: `sello.key` (clave privada del sello), `sello.crt`, `servidor.key`, `servidor.crt`. `datos/` no se versiona. Las claves privadas nunca se sirven por ninguna puerta. En Windows, permisos del archivo limitados al usuario que corre el sistema.
- **Respaldos:** `datos/certificados/` entra en los respaldos del plan 4. Si se pierde el sello, hay que reinstalar el nuevo en cada aparato.
- **Librería:** `@peculiar/x509` (MIT, versión 2.1.0 al 2026-09-18) para fabricar los certificados, sobre `webcrypto` de Node. Es la única dependencia nueva: Node cifra, pero no fabrica certificados X.509. Se ejecuta `npm audit` al instalarla y se decide cada aviso, como manda `APRENDIZAJES.md`.

### 4.3 Cookies

- `dispositivo` y `sesion` pasan a llevar `Secure`: el navegador no las envía nunca por la puerta de inicio. Se conservan `HttpOnly`, `SameSite=Strict` y `Path=/`. Esto reemplaza la restricción "sin `Secure`" de la spec de seguridad.

### 4.4 Desarrollo y pruebas

- El servidor siempre arranca con cifrado; no existe un modo "sin cifrar" que pudiera llegar a producción por error.
- En la Mac de desarrollo, un comando (`npm run confiar-sello`) instala el sello en el llavero del sistema una vez.
- Las pruebas con `app.inject` no pasan por TLS y siguen igual.
- Pruebas nuevas: el certificado del servidor verifica contra el sello con `node:tls` y trae los nombres alternativos correctos; se reemite al cambiar las direcciones o al acercarse el vencimiento; la puerta de inicio sirve solo lo de 4.1 y redirige todo lo demás, incluida toda `/api/...`; ninguna respuesta de la puerta de inicio contiene la clave privada; las cookies llevan `Secure`.
- La verificación en vivo con Chromium usa la puerta cifrada con el sello cargado como raíz de confianza del contexto de prueba.

## 5. Reglas nuevas

Continúan la numeración de la spec de seguridad, que llega a la regla 31.

32. Todo el tráfico de pantallas, API y eventos va por la puerta cifrada. La puerta de inicio solo sirve la página de inicio, el sello público y sus imágenes; todo lo demás redirige a la puerta cifrada.
33. Las claves privadas del sello y del servidor nunca salen de la PC de caja por la red.
34. Las cookies de acceso llevan `Secure`.
35. El certificado del servidor se reemite solo cuando le quedan menos de 30 días o cambian las direcciones de red; el sello no cambia salvo que se pierda.

## 6. Lo que queda para el plan 4 (entrega)

- El lanzador instala el sello en el almacén de confianza de Windows de la PC de caja.
- El lanzador muestra el QR que abre la página de inicio en la puerta sin cifrar.
- `datos/certificados/` entra en los respaldos.
- El manual explica la instalación del sello en Android y iPhone con imágenes, y la regla de hacerlo con el local cerrado.
- La opción "Restablecer PIN de administrador" oculta lo que se escribe (requisito ya anotado en la Task 5 del plan de seguridad).

## 7. Riesgo residual aceptado

La primera descarga del sello viaja sin cifrar. Un atacante conectado en ese preciso momento podría entregar un sello falso. Se mitiga operativamente (instalar con el local cerrado, aparatos del local y no personales). Si algún día se quiere cerrar del todo, la vía es verificar la huella del sello en el aparato contra la que muestra la PC de caja; hoy no compensa la complejidad para el personal.

## 8. Fuera del alcance

Certificado público con dominio, HSTS (los navegadores lo ignoran para direcciones IP), nombre local por mDNS (`cafeteria.local`), rotación periódica del sello, y verificación de huella del sello en el aparato.
