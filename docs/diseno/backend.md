# Plan detallado del backend

Escrito el 23-nov-2026 sobre `docs/PLAN.md` v4 (D1 a D21). F1 (núcleo) va al detalle de clases, tablas y rutas; F2 y F3 (servicio con IA, eventos, supervisor) van a nivel de diseño, porque sus decisiones abiertas se preguntan al empezar cada fase (D18). La sección 9 lista lo que este plan propone cambiar frente a PLAN v4: eso es lo que hay que aprobar en el checkpoint.

## 1. Mapa de procesos

| Proceso | Lenguaje | Modo | Qué hace |
|---|---|---|---|
| Supervisor (`apps/escritorio`, proceso principal de Electron) | TypeScript | Siempre | Arranca con el equipo, vive en la barra de menú, lanza y vigila los demás procesos, muestra avisos del sistema operativo |
| PostgreSQL 17 + pgvector | | Siempre | Esquemas `nucleo` e `ia`, cada uno con su usuario |
| Núcleo (`services/nucleo`) | TypeScript, NestJS 12 | Siempre | Reglas del negocio, REST, MCP, outbox, hooks, flujo de eventos local |
| Vigía (`services/ia`, entrada `vigia`) | Python | Siempre | Lee el correo y Get on Board cada cierto tiempo; clasifica si el proveedor es por API |
| API de IA (`services/ia`, entrada `api`) | Python, FastAPI | Completo | Análisis de avisos, RAG, clasificación pendiente, validación de movimientos |
| RabbitMQ | | Completo | Bus de eventos entre servicios |
| Notificaciones (`services/notificaciones`) | TypeScript, NestJS + Socket.IO | Completo | Avisos en vivo a la consola |
| Consola (`apps/consola`) | Angular 22 | Completo | Dentro de la ventana de Electron |
| Panorama (`apps/panorama`) | Next.js 16 | Completo | F4 |

En desarrollo y en el CI todo esto corre con `docker compose` (perfiles `liviano` y `completo`) y `pnpm dev`; Electron llega en F3.

## 2. Núcleo: capas y reglas de dependencia

```
infraestructura ──▶ aplicacion ──▶ dominio
   (Nest, Prisma,       (casos de uso,       (agregado, objetos de valor,
    MCP SDK, HTTP)       puertos)             eventos, políticas)
```

- `dominio/` no importa nada fuera de sí mismo y de `compartido/dominio/`.
- `aplicacion/` importa `dominio/` y define puertos (interfaces). No usa decoradores de Nest.
- `infraestructura/` implementa los puertos y conecta todo. Es la única que conoce Nest, Prisma y el SDK de MCP.
- dependency-cruiser lo hace cumplir en el CI (F1-05).

## 3. Dominio (F1-06)

### 3.1 Clases

```ts
// compartido/dominio
abstract class AggregateRoot { protected registrar(e: EventoDeDominio): void; sacarEventos(): EventoDeDominio[] }
interface EventoDeDominio { tipo: string; version: 1; ocurridoEn: Date; prioridad: Prioridad; datos: object }
abstract class ErrorDeDominio extends Error { abstract readonly codigo: CodigoError; readonly campo?: string }
interface Reloj { ahora(): Date }
interface GeneradorId { nuevo(): string }   // UUID v7

// postulaciones/dominio
class Postulacion extends AggregateRoot {
  static crear(p: { aviso: AvisoResumen; estado?: EstadoPostulacion; sueldoPretendido?: Dinero; origen: Origen }, d: Deps): Postulacion
  cambiarEstado(a: EstadoPostulacion, p: { motivo?: string; fechaPostulacion?: Date; canal?: Canal; origen: Origen }, d: Deps): void   // R1 R2 R3 R5 R6 R13
  registrarSenal(s: DatosSenal, d: Deps & { aplicarSeguras: boolean; umbral: number }): Senal                                            // R8 R11
  aplicarSenal(senalId: string, d: Deps): void
  resolverDiscrepancia(id: string, decision: 'confirmar' | 'corregir', a: EstadoPostulacion | undefined, d: Deps): void               // R14
  agregarNota(texto: string, d: Deps): void                                                                                           // R9
  agregarContacto(c: Contacto, d: Deps): void                                                                                         // R8
  agendarEntrevista(e: DatosEntrevista, d: Deps): void                                                                                // R7 R8
  registrarResultadoEntrevista(id: string, r: ResultadoEntrevista): void
  editar(p: { canal?: Canal; sueldoPretendido?: Dinero; cierre?: Date | null }): void
  prioridad(reloj: Reloj): Prioridad                                                                                                  // R12
  transicionesPosibles(): EstadoPostulacion[]
}
type Deps = { reloj: Reloj; ids: GeneradorId }
type Origen = 'tablero' | 'formulario' | 'ia' | 'senal' | 'importacion'
```

R4 (una postulación activa por aviso) y R10 (versión) no caben dentro de un agregado: se cumplen en el repositorio (3.3 y 5.2).

### 3.2 Regla R13 sin IA (lo determinista de F1)

Al guardar un cambio con origen `tablero`, `formulario` o `ia`, el agregado mira la **última señal no aplicada con `estadoSugerido`** recibida en los últimos 30 días. Abre una discrepancia si se cumple alguna de estas:

| Movimiento | Señal reciente | Ejemplo |
|---|---|---|
| A un estado de avance (`postulado` a `oferta`) | Sugiere `rechazado` | Mueves a entrevista y el último correo es un rechazo |
| A `rechazado` o `descartado` | Sugiere un estado de avance posterior al actual | Descartas y el último correo es una invitación a entrevista |
| A `entrevista` u `oferta` | No hay ninguna señal en 30 días y el origen es `tablero` | Movimiento sin evidencia (severidad baja, solo informativa) |

La IA de F3 suma evidencia nueva (busca en el correo) y puede abrir más discrepancias con el resultado de su validación; la regla de arriba no cambia.

### 3.3 Errores

| Clase | `codigo` |
|---|---|
| `TransicionInvalida` | `TRANSICION_INVALIDA` |
| `AvisoCerrado` | `AVISO_CERRADO` |
| `DatoInvalido` (con `campo`) | `VALIDACION` |
| `EstadoTerminal` | `ESTADO_TERMINAL` |
| `PostulacionDuplicada` (lo lanza el repositorio) | `YA_EXISTE` |
| `SenalDuplicada` (misma referencia externa) | `YA_EXISTE` |
| `ConflictoDeVersion` (lo lanza el repositorio) | `CONFLICTO` |
| `NoEncontrada` (lo lanza el caso de uso) | `NO_ENCONTRADO` |

## 4. Aplicación: puertos y casos de uso (F1-08)

**Puertos de salida:**
| Puerto | Métodos |
|---|---|
| `PostulacionRepositorio` | `porId(id)`, `guardar(p, versionEsperada)` (guarda el agregado y sus eventos en el outbox en una transacción) |
| `ConsultasDePostulaciones` (lado de lectura) | `listar(filtros, pagina)`, `tablero()`, `detalle(id)`, `resumenDesde(fecha)`, `exportar()` |
| `Reloj`, `GeneradorId` | |
| `Ajustes` | `aplicarSenalesSeguras()`, `umbralConfianza()` |

El lado de lectura devuelve vistas planas (no agregados) armadas con consultas directas: el tablero no necesita cargar 46 agregados completos. Es un CQRS liviano, sin bases separadas.

**Casos de uso** (cada uno es una clase con `ejecutar(entrada)`):
| Caso de uso | Entrada | Salida | Errores |
|---|---|---|---|
| `CrearPostulacion` | aviso, estado?, sueldoPretendido?, origen | id | `VALIDACION`, `YA_EXISTE` |
| `CambiarEstado` | id, a, motivo?, fechaPostulacion?, canal?, origen, version | detalle | `NO_ENCONTRADO`, `TRANSICION_INVALIDA`, `AVISO_CERRADO`, `VALIDACION`, `CONFLICTO` |
| `EditarPostulacion` | id, cambios, version | detalle | `VALIDACION`, `CONFLICTO` |
| `RegistrarSenal` | id?, datos de la señal (si no hay id, va a la bandeja en F2) | señal | `VALIDACION`, `YA_EXISTE` |
| `AplicarSenal` | id, senalId, version | detalle | `TRANSICION_INVALIDA`, `CONFLICTO` |
| `ResolverDiscrepancia` | id, discrepanciaId, decision, a? | detalle | `NO_ENCONTRADO`, `TRANSICION_INVALIDA` |
| `AgregarNota`, `AgregarContacto`, `AgendarEntrevista`, `RegistrarResultadoEntrevista` | id, datos | detalle | `VALIDACION`, `ESTADO_TERMINAL`, `TRANSICION_INVALIDA` |
| `ImportarFichas` | archivo JSON | creadas, omitidas | `VALIDACION` |
| Consultas | filtros | vistas | `VALIDACION` |

Los casos de uso de escritura reintentan una vez si hay `CONFLICTO` solo cuando el origen es `senal` (el vigía); en los demás casos el conflicto llega al usuario para que recargue.

## 5. Persistencia con Prisma 7 (F1-07)

### 5.1 Lo que cambia en Prisma 7 (guía oficial, leída el 23-nov-2026)

- Driver adapter obligatorio: `new PrismaClient({ adapter: new PrismaPg(...) })` con `@prisma/adapter-pg` 7.10.1.
- Generator `prisma-client` con `output` obligatorio (el cliente ya no va a `node_modules`).
- `prisma.config.ts` en `services/nucleo/` con `schema`, `migrations.path` y `datasource.url`. El `.env` no se carga solo: `import "dotenv/config"` al inicio.
- Prisma es ESM. Hay que probar que conviva con NestJS 12: **tarea F1-07a**, una prueba de humo antes de escribir el repositorio. Si choca, el núcleo entero pasa a ESM o se genera el cliente en formato CommonJS, lo que la prueba muestre que funciona.
- `migrate diff` usa `--from-config-datasource` y `--to-schema`; `migrate dev` ya no corre `generate` ni el seed: todo explícito en los scripts.
- La versión fija es 7.10.1 (`prisma` y `@prisma/client`); el `latest` de `prisma` es una RC de la 8.

### 5.2 Tablas del esquema `nucleo`

| Tabla | Columnas principales | Índices y restricciones |
|---|---|---|
| `postulacion` | `id uuid`, `aviso_titulo`, `aviso_empresa`, `aviso_url`, `aviso_plataforma`, `aviso_modalidad`, `aviso_ubicacion`, `aviso_cierre date null`, `aviso_id_mercado null`, `aviso_calce numeric null`, `estado`, `canal_tipo null`, `canal_valor null`, `fecha_postulacion null`, `sueldo_monto null`, `sueldo_moneda null`, `sueldo_periodo null`, `sueldo_base null`, **`aviso_url_activa null`**, `version int`, `creada_en`, `actualizada_en` | `aviso_url_activa` única. Vale `aviso_url` mientras el estado no es terminal y `null` cuando lo es: PostgreSQL permite varios `null` en un índice único, así R4 se cumple sin índice parcial (que Prisma no maneja y que generan drift en las migraciones) |
| `cambio_estado` | `id`, `postulacion_id`, `de null`, `a`, `motivo null`, `origen`, `ocurrido_en` | índice por `postulacion_id, ocurrido_en` |
| `senal` | `id`, `postulacion_id null` (null = bandeja), `fuente`, `plataforma`, `resumen`, `estado_sugerido null`, `confianza numeric`, `referencia_externa null`, `recibida_en`, `aplicada bool` | `referencia_externa` única |
| `discrepancia` | `id`, `postulacion_id`, `cambio_estado_id`, `senal_id null`, `detalle`, `estado`, `detectada_en`, `resuelta_en null` | |
| `entrevista` | `id`, `postulacion_id`, `fecha`, `tipo`, `con null`, `resultado` | |
| `contacto` | `id`, `postulacion_id`, `nombre`, `rol null`, `email null`, `linkedin null` | |
| `nota` | `id`, `postulacion_id`, `texto`, `creada_en` | |
| `acceso` | `id = 1`, `clave_hash null`, `actualizada_en` | una sola fila |
| `ajuste` | `clave`, `valor jsonb` | |
| `outbox` | `id uuid`, `tipo`, `version`, `prioridad`, `datos jsonb`, `correlacion_id`, `ocurrido_en`, `publicado_en null`, `intentos int` | índice por `publicado_en, ocurrido_en` |

**Guardar un agregado** (en una transacción):
1. `UPDATE postulacion SET … , version = version + 1 WHERE id = $1 AND version = $2`; si afecta 0 filas, `ConflictoDeVersion`. Al crear, `INSERT`; si choca con `aviso_url_activa`, `PostulacionDuplicada`.
2. Insertar los hijos nuevos (el agregado marca qué es nuevo); actualizar los editados (resultado de entrevista, estado de discrepancia, señal aplicada).
3. Insertar los eventos sacados del agregado en `outbox`.

**Migraciones:** `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/<fecha>_<nombre>/migration.sql` y `migrate deploy`. El esquema `ia` y la extensión `vector` no los toca Prisma (ADR 0013).

## 6. Entradas al núcleo

### 6.1 Acceso local y seguridad (F1-09)

Escuchar solo en `127.0.0.1` no basta: cualquier página web abierta en tu navegador puede mandar pedidos a `http://127.0.0.1:<puerto>`. Por eso:
- **Siempre hay token**, haya o no clave. Sin clave, la ventana de Brecha recibe el token sola al abrir (Electron se lo pasa; en desarrollo, un archivo `.env` local). Con clave, el token se entrega al desbloquear.
- Tokens de 32 bytes aleatorios, comparados en tiempo constante. El de sesión vence a las 12 horas; el de MCP y el del vigía duran hasta que se regeneran desde Ajustes. Viven en la carpeta de la instancia con permisos `0600`.
- Se rechaza todo pedido cuyo `Host` no sea `127.0.0.1` o `localhost` (protege del DNS rebinding) y todo `Origin` que no sea el de la consola.
- Guard global de Nest con tres tipos de token: `sesion` (consola), `mcp` (IA del usuario) y `servicio` (vigía y API de IA). El tipo queda en el log y define el `origen` por defecto.

### 6.2 REST (F1-10a y F1-10b)

- Un módulo Nest por adaptador: `PostulacionesHttpModule`, `AccesoModule`.
- DTO con `class-validator`; en los opcionales, `@IsOptional()` en **todos** los campos que lo son. `ValidationPipe` global con `whitelist` y `forbidNonWhitelisted`: un campo desconocido es `VALIDACION`.
- Filtro global de errores: `ErrorDeDominio` → su `codigo` y el HTTP de la tabla de PLAN 12.1; cualquier otro → `ERROR_INTERNO` con el stack solo en el log.
- `pnpm --filter nucleo contrato:exportar` escribe `packages/contratos/openapi.json` y genera los tipos con `openapi-typescript`; el CI corre el mismo comando y falla con `git diff --exit-code`.
- Flujo de eventos local: `GET /api/v1/eventos/stream` (Server-Sent Events) con los eventos recién guardados. Lo usa el supervisor para los avisos del sistema operativo en el modo liviano (sección 8) y la consola mientras no exista el servicio de notificaciones.

### 6.3 MCP (F1-10c)

- **Transporte HTTP en el mismo núcleo** (`/mcp`, Streamable HTTP del SDK `@modelcontextprotocol/sdk` 1.32), con el token `mcp` en la cabecera. Claude Code y Claude Desktop se conectan con la URL y la cabecera. Así hay un solo proceso con acceso a la base y el MCP funciona siempre que Brecha esté corriendo (también en modo liviano). Ver el cambio propuesto en 9.
- Esquemas de entrada con zod (lo que usa el SDK). Cada herramienta llama a su caso de uso y devuelve un resultado corto en texto más el JSON; los errores salen con `isError: true` y el mismo `codigo`.
- `exportar` devuelve todo el estado en JSON y su tamaño se mide: si pasa de unos 50 KB, se pagina por estado (con demasiados datos, el modelo tiende a inventar).
- Las herramientas de escritura dejan `origen: 'ia'`; Claude Code ya pide permiso por herramienta, y Brecha no agrega otra confirmación.

## 7. Eventos, outbox y hooks

| Pieza | Fase | Cómo |
|---|---|---|
| Escritura en outbox | F1 | En la transacción del repositorio |
| Despachador local | F1 | Después de cada transacción, el núcleo pasa los eventos nuevos al flujo SSE (6.2). Sin RabbitMQ |
| Publicador a RabbitMQ | F3 | Solo en modo completo: cada segundo toma lotes de `outbox` con `publicado_en null` (`FOR UPDATE SKIP LOCKED`), publica con confirmación y marca `publicado_en`. Al arrancar el modo completo vacía lo acumulado |
| Hooks | F3 | El núcleo lee `hooks.yaml` y, por cada evento que calce con tipo y prioridad mínima, corre el comando local o llama la URL local con el evento en JSON, con tiempo máximo y registro del resultado |

**Señales: comando, no evento.** El vigía y la API de IA registran señales llamando a `POST /api/v1/senales` del núcleo con su token `servicio`. Registrar una señal es pedirle algo al dueño de los datos (un comando), y así funciona igual en modo liviano, sin RabbitMQ. Lo que el núcleo publica después (`postulacion.senal_registrada`) sí es un evento.

## 8. Supervisor (F3, diseño)

- Proceso principal de Electron: al iniciar sesión en el equipo arranca PostgreSQL, el núcleo y el vigía como procesos hijos; revisa su salud cada 10 segundos y los reinicia con espera creciente si caen.
- Se suscribe a `GET /eventos/stream` y muestra un aviso del sistema operativo para los eventos de prioridad `alta`; los de prioridad `media` y `baja` quedan para la consola y el resumen diario.
- Al abrir la ventana: levanta RabbitMQ, la API de IA y notificaciones, espera que estén sanos y carga la consola. Al cerrarla: los baja después de 5 minutos sin ventana.
- Carpeta de la instancia: `~/Library/Application Support/Brecha/` (`config.yaml`, `hooks.yaml`, tokens, logs, datos de PostgreSQL). Credenciales en el llavero del sistema.
- Empaquetar PostgreSQL y Python: se elige en F3 (el paquete `embedded-postgres` está en beta, 19.0.0-beta.20).

## 9. Cambios que propone este plan frente a PLAN v4

| # | Cambio | Por qué |
|---|---|---|
| C1 | **MCP por HTTP dentro del núcleo**, en vez de stdio (ajusta ADR 0012) | Con stdio, Claude lanza un proceso aparte que abre su propia conexión a la base. Por HTTP hay un solo proceso, y funciona en modo liviano sin instalar nada más |
| C2 | **Siempre hay token**, aunque no haya clave, más validación de `Host` y `Origin` (ajusta ADR 0010) | Sin esto, cualquier página web abierta en tu navegador podría mover tus postulaciones llamando a `127.0.0.1` |
| C3 | **Las señales entran al núcleo como comando HTTP**, no como evento `senal.detectada` | Funciona igual en modo liviano y es el modelado correcto: el núcleo es el dueño de los datos |
| C4 | **R4 con la columna `aviso_url_activa` única**, sin índice parcial | Prisma no maneja índices parciales y generan drift en las migraciones |
| C5 | **Tarea F1-07a:** prueba de humo de Prisma 7 (ESM) con NestJS 12 antes del repositorio | Prisma 7 es solo ESM y puede chocar con Nest |
| C6 | **Flujo SSE de eventos en el núcleo** para avisos en modo liviano | En modo liviano no hay RabbitMQ ni servicio de notificaciones |
| C7 | **Lado de lectura aparte** (`ConsultasDePostulaciones`) | El tablero no necesita cargar agregados completos |

## 10. Servicio con IA (F2 y F3, diseño)

**Capas** (igual que el núcleo, en Python): `dominio` (Correo, Aviso, SenalCandidata, Clasificacion), `aplicacion` (sincronizar correo, clasificar, asociar, analizar aviso, responder pregunta, validar cambio) y `infraestructura` (lector de correo, cliente de Get on Board, adaptadores de OpenAI y del modelo local, repositorio en el esquema `ia`, cliente del núcleo). Dos entradas: `python -m ia.vigia` y `uvicorn ia.api:app`.

**Clasificación de un correo** (el modelo clasifica; el código decide y calcula):
1. **Filtro sin IA:** remitentes y dominios conocidos de plataformas (linkedin.com, trabajando.cl, getonbrd.com, computrabajo, etc.) y palabras clave. Lo que no pasa no se guarda ni sale de la máquina.
2. **Extracción con IA** con salida estructurada (esquema JSON): plataforma, empresa, título del cargo, estado sugerido, resumen de una línea y confianza.
3. **Asociación sin IA:** compara empresa y título con las postulaciones activas (similitud de texto normalizada) y elige si hay una sola sobre el umbral; si no, a la bandeja.
4. Llama a `POST /senales` del núcleo con `referencia_externa = Message-ID`.

**Tablas del esquema `ia`:** `correo` (id, message_id único, remitente, asunto, recibido_en, fragmento relevante, estado de clasificación; sin el cuerpo completo), `clasificacion` (correo, resultado jsonb, modelo, confianza, creada_en), `aviso` (url única, plataforma, datos jsonb, texto, `embedding vector`, modelo de embeddings), `analisis_aviso` (stack, requisitos, brechas y calce calculado por código), `evaluacion` (corridas de los sets de prueba). La dimensión del vector depende del modelo: se fija al configurar el proveedor y se recalcula todo si cambia (ADR 0016).

**Errores de IA visibles**: el proveedor que responde 429 o no está disponible da un estado visible en la consola («la IA no está disponible, 12 correos en cola»), nunca una clasificación vacía en silencio.

## 11. Observabilidad y pruebas

- Logs JSON a archivo en la carpeta de la instancia, con `correlacionId`, tipo de token y origen. Nada de cuerpos de correo en los logs.
- Langfuse local: se pregunta en F2 (D18).

| Capa | Qué | Dónde |
|---|---|---|
| Dominio | Las 81 transiciones, R1 a R14, prioridad, la tabla de 3.2 | Vitest, sin base |
| Aplicación | Casos de uso con repositorio en memoria y reloj fijo | Vitest |
| Repositorio | Guardar y leer, versión, `aviso_url_activa`, outbox | Vitest contra PostgreSQL del compose (en el CI, servicio del job) |
| API | Una prueba por ruta, éxito y error esperado; `Host` y `Origin` rechazados | Vitest + supertest |
| MCP | Cada herramienta con el cliente del SDK contra el núcleo levantado | Vitest |
| Contrato | `openapi.json` sin cambios sin commitear | CI |
| Capas | dependency-cruiser | CI |

## 12. Ajustes a las tareas de F1 (PLAN §15)

| Tarea | Ajuste |
|---|---|
| F1-02 | La imagen pasa a `pgvector/pgvector:pg17`, con los esquemas `nucleo` e `ia` y un usuario por esquema creados por un script de inicio |
| F1-07a (nueva) | Prueba de humo Prisma 7 + NestJS 12: generar el cliente, conectar con `adapter-pg`, una consulta desde un servicio de Nest, compilar y correr. Hecho: arranca y consulta; queda escrito qué formato de módulo se usó |
| F1-07 | Con lo de 5.1 y 5.2 |
| F1-09 | Con lo de 6.1: token siempre, `Host` y `Origin` |
| F1-10a | Suma `GET /eventos/stream` (SSE) |
| F1-10c | MCP por HTTP en `/mcp` (si se aprueba C1) |
