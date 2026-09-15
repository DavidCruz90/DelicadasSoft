# APRENDIZAJES

Registro acumulado de lo aprendido trabajando en este proyecto. Cualquier agente lo lee al empezar y lo amplía al terminar cada bloque de trabajo. Formato: fecha, qué pasó, qué se aprendió, cómo aplicarlo.

## 2026-09-12
- **Qué pasó:** Dave rechazó SQLite aunque técnicamente alcanzaba. **Aprendizaje:** las decisiones de tecnología se presentan con hechos una sola vez y luego se respeta la elección del dueño. **Aplicar:** no reabrir SQLite; PostgreSQL es definitivo.
- **Qué pasó:** el pedido inicial creció a cuatro sistemas (POS, menú digital, facturación SRI, wallet). **Aprendizaje:** dividir en módulos con orden explícito evita specs inabarcables. **Aplicar:** un módulo por spec y por serie de planes.

## 2026-09-13
- **Qué pasó:** el archivo temporal de la propuesta HTML desapareció entre sesiones y un script sobrescribió `docs/propuesta-nucleo-pos.html` con un archivo casi vacío; se recuperó desde git. **Aprendizaje:** nada temporal es fiable entre sesiones; todo lo que importa vive en el repo y se regenera desde ahí. **Aplicar:** editar siempre el archivo del repo, nunca una copia temporal; antes de sobrescribir, verificar que el origen existe.
- **Qué pasó:** los abonos de encargos no son venta hasta la entrega. **Aprendizaje:** el arqueo de caja debe separar "dinero recibido" de "venta registrada". **Aplicar:** caja de encargos como saldo aparte; la venta se registra el día de entrega.

## 2026-09-14
- **Qué pasó:** Dave dictó la ley del proyecto y pidió "solo lo importante y esencial". **Aprendizaje:** documentación corta y explícita gana a documentación larga. **Aplicar:** CLAUDE.md en 7 puntos; ESTADO.md con un solo "siguiente paso exacto".
- **Qué pasó:** Dave entregó casos de a uno y pidió procesarlos al final. **Aprendizaje:** acumular y aplicar en un solo bloque evita retrabajo en spec, HTML y estado. **Aplicar:** cuando lleguen varios casos, confirmar cada uno en una línea y procesar juntos.
- **Qué pasó:** un script de edición falló a mitad porque una frase no coincidía; como escribía al final, no dejó el archivo a medias. **Aprendizaje:** los scripts de edición deben verificar todas las coincidencias antes de escribir. **Aplicar:** `assert` por cada reemplazo y escritura única al final.

## 2026-09-15
- **Qué pasó:** en esta Mac no hay `psql`, `pg_ctl` ni Homebrew; sí hay Node 24 y Docker. **Aprendizaje:** verificar el entorno antes de planificar, no suponerlo. **Aplicar:** PostgreSQL de desarrollo y pruebas en Docker (`cafeteria-pg`, puerto 5433); el portátil solo en Windows.
- **Qué pasó:** todas las tareas de los planes quedaron con el mismo modelo por defecto. Dave lo detectó. **Aprendizaje:** un valor por defecto es una decisión no tomada; viola la ley. **Aplicar:** cada tarea nombra modelo, motivo, skill y revisor. Criterio en CLAUDE.md.
- **Qué pasó:** al planificar la división de cuentas apareció un caso que la spec no cubría (cuenta 1 vacía imposible de cobrar). **Aprendizaje:** escribir el plan con código real destapa huecos de la spec. **Aplicar:** cuando el plan contradiga la spec, corregir la spec en el mismo commit y anotarlo en BITACORA.
- **Qué pasó:** `@fastify/static` con `prefix: '/'` y rutas explícitas `/` puede chocar. **Aprendizaje:** usar `wildcard: false` para archivos compilados conocidos. **Aplicar:** ya está en el plan 1, Task 6.
- **Qué pasó:** Dave pidió que nada dependa de la memoria del modelo ni de la sesión. **Aprendizaje:** la memoria privada del agente no es un registro válido. **Aplicar:** este archivo y `docs/BITACORA.md` son el único registro de aprendizajes; la memoria privada solo contiene una línea que remite al repo.
