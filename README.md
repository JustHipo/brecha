# Brecha

Seguimiento personal de postulaciones de empleo. Juntas en un tablero las postulaciones de todas las plataformas, registras la evidencia que llega (correos, cambios en los portales) como **señales**, y Brecha te avisa cuando un movimiento del tablero no calza con esa evidencia (**discrepancias**). Una IA (Claude Code, Claude Desktop u otra) puede operarla por **MCP**.

Brecha se instala y corre en tu máquina: no hay servidor central, cuentas ni nube. Tus datos no salen de tu equipo.

## Cómo se usa

Brecha parte vacía: no trae ofertas ni se conecta sola a los portales. Es tu tablero, y quien hace el trabajo pesado es **Claude**, que se conecta a Brecha por **MCP** y la usa por ti: busca, agrega, ordena y anota. Tú revisas y decides.

Descarga la app en [Releases](https://github.com/JustHipo/brecha/releases) (Mac con chip Apple o Windows) y sigue estos pasos.

### 1. Conecta Claude a Brecha y a Chrome

Agrega Brecha como servidor MCP en Claude (Claude Desktop o Claude Code) y activa Claude en Chrome. Así Claude puede leer y escribir en tu tablero, y navegar los portales de empleo con tu sesión.

### 2. Llena tu perfil

Anota qué buscas: cargo, modalidad, ciudad, sueldo y herramientas que manejas. Hazlo en Brecha o pídele a Claude que lo llene contigo.

### 3. Pídele a Claude que busque

Por ejemplo: _«Busca en LinkedIn, GetOnBoard y Laborum ofertas que calcen con mi perfil de Brecha»_. Claude las revisa desde Chrome y descarta las que chocan con tu perfil.

### 4. Pídele que las agregue a Brecha

_«Agrega a Brecha las que valgan la pena»_. Quedan en el tablero con el link, la empresa y lo que les falta frente a tu perfil.

### 5. Revisa y postula

Tú eliges a cuáles postular y postulas en el portal. Después las marcas como postuladas (o se lo pides a Claude).

### 6. Conecta tu correo y tu llave de OpenAI

En **Ajustes** conectas tu Gmail y pones tu llave de OpenAI. Con eso Brecha lee los correos de las empresas y entiende si avanzas, te rechazan o te piden algo.

**6b. ¿Sin automatización?** También sirve a mano: creas las postulaciones, las mueves en el tablero y anotas lo que pasa. Nada de lo anterior es obligatorio.

### 7. Brecha se mantiene al día

Cuando llega un correo claro, la postulación cambia de estado sola y te avisa. Si el correo es dudoso, queda como sugerencia para que tú decidas.

> Lo mismo sirve para buscar arriendo: en el modo **Arriendos**, Claude busca departamentos que calcen con tu perfil y los guarda con sus fotos.

> Estado: **F2 y F3 en curso**. Ya funcionan el núcleo, la consola y el MCP (F1); el lector de correo con IA, los avisos con calce y Preguntar (F2); y la app de escritorio para macOS con tu red de LinkedIn (F3). El plan completo está en [`docs/PLAN.md`](docs/PLAN.md) y las decisiones en [`docs/adr/`](docs/adr/).

## Cómo está hecho

```
 ┌──────────────────────── tu máquina (127.0.0.1) ────────────────────────┐
 │                                                                         │
 │  Consola Angular ──REST──▶  Núcleo NestJS  ◀──MCP (HTTP)── tu IA       │
 │  tablero, ficha,            hexagonal + DDD        (Claude Code…)       │
 │  discrepancias ◀──SSE──     Prisma 7 ─▶ PostgreSQL 17 (pgvector)        │
 │                                                                         │
 └─────────────────────────────────────────────────────────────────────────┘
```

- **Núcleo** (`services/nucleo`): NestJS 12 con arquitectura hexagonal. El dominio (`postulaciones/dominio`) no importa NestJS ni Prisma; lo hace cumplir dependency-cruiser en el CI. Tres adaptadores de entrada sobre los mismos casos de uso: REST (consola), MCP (IA) y, desde F2, el servicio de fuentes. Los eventos se guardan en un outbox en la misma transacción que el agregado.
- **Consola** (`apps/consola`): Angular 22 (standalone, signals), Spartan sobre Tailwind 4, Transloco (español e inglés) y Angular CDK para arrastrar y soltar. Los tipos de la API salen del contrato OpenAPI (`packages/contratos`): si el contrato cambia, la consola no compila.
- **Seguridad local** (ADR 0010 y 0019): el núcleo escucha solo en `127.0.0.1`, siempre pide token, rechaza un `Host` o un `Origin` ajenos y admite una clave local opcional (argon2id).

## Instalar la app (macOS, Apple Silicon)

Brecha se instala como una app que vive en la barra de menú: al iniciar sesión arranca callada, levanta su propia base de datos (PostgreSQL 17 con pgvector, sin Docker), el núcleo, el servicio con IA y el vigía del correo, y te avisa con notificaciones del sistema cuando una postulación se mueve sola.

```bash
pnpm install
brew install pgvector        # pgvector compilado para PostgreSQL 17, que la app lleva adentro
pnpm --filter escritorio empaquetar
open apps/escritorio/empaquetado/app/*.dmg
```

- Arrastra Brecha a Aplicaciones. No está firmada por Apple (D39): la primera vez ábrela con clic derecho → Abrir.
- En **Ajustes** guarda tu correo de Gmail con una contraseña de aplicación y tu llave de OpenAI: se prueban antes de guardarse, quedan en el llavero de macOS y nunca se muestran. macOS te pedirá una vez permiso para que Brecha lea el llavero.
- Tus datos quedan en `~/Library/Application Support/Brecha` y los registros en `~/Library/Logs/Brecha`.
- Si venías del entorno de desarrollo, abre la app una vez y trae tus datos de Docker con `node apps/escritorio/scripts/importar-desde-docker.mjs`.
- Cerrar la ventana no apaga Brecha; para salir, usa «Salir de Brecha» en la barra de menú (o `Brecha --salir` desde una terminal).

## Instalar la app (Windows 10 u 11, x64)

El instalador sale del CI: en la PR o en Actions → «App de escritorio», baja el artefacto `Brecha-Setup-windows` y descomprímelo. También se arma en un Windows con `pnpm --filter escritorio empaquetar` (hace falta Visual Studio con C++ y un PostgreSQL 17.12 con cabeceras para compilar pgvector: ver `apps/escritorio/scripts/compilar-pgvector-windows.ps1`).

- Abre `Brecha-Setup-<versión>.exe`. Se instala solo para tu usuario en `%LOCALAPPDATA%\Programs\Brecha`, sin pedir clave de administrador, y abre Brecha al terminar.
- No está firmado (decisión W-j de `docs/diseno/windows.md`): Windows muestra «Windows ha protegido su PC». Elige «Más información» y «Ejecutar de todos modos». Si el equipo tiene **Smart App Control** activado, lo bloquea sin esa opción: se apaga en Seguridad de Windows → Control de aplicaciones y del navegador (es tu decisión; hoy se puede volver a activar sin reinstalar Windows).
- Brecha vive en la bandeja del sistema (al lado del reloj; puede estar en la flecha «^»). Clic abre la ventana; clic derecho, el menú.
- En **Ajustes**, «Conectar con Gmail» te guía para crear una contraseña de aplicación; la llave de OpenAI va en la tarjeta de OpenAI. Las dos quedan en el Administrador de credenciales de Windows (credenciales genéricas `brecha-app`) y nunca se muestran.
- Tus datos quedan en `%APPDATA%\Brecha` y los registros en `%APPDATA%\Brecha\logs`. PostgreSQL usa el puerto 5434 o, si está ocupado, otro libre (queda en `instancia\puertos.json`); el núcleo usa 4300 y la IA 4400.
- Para conectar tu IA por MCP, el token está en `%APPDATA%\Brecha\instancia\token-mcp`. En PowerShell:

```powershell
claude mcp add --transport http --scope user brecha http://127.0.0.1:4300/mcp --header "Authorization: Bearer $(Get-Content $env:APPDATA\Brecha\instancia\token-mcp)"
```

### Importar y exportar por CSV

En **Importar y exportar** (barra lateral, o ⌘K) cargas una planilla de postulaciones o de contactos de LinkedIn, ves un informe por fila (línea, columna y motivo de cada error o advertencia) y bajas tus datos en el mismo formato para que otra persona los importe en su Brecha. Hay plantillas con dos filas de ejemplo. Importar dos veces el mismo archivo deja lo mismo: una postulación se reconoce por la URL del aviso y un contacto por su perfil de LinkedIn (o por nombre y empresa si no tiene). Importa primero las postulaciones y después los contactos. Formato completo en `docs/diseno/csv.md`; ejemplos inventados en `datos/ejemplo/csv/`.

- **Postulaciones:** `titulo,empresa,url,plataforma,modalidad,ubicacion,cierre,estado,prioridad,fecha_postulacion,canal_tipo,canal_valor,correo_postulacion,sueldo_publicado,stack,requisitos,etiquetas,notas` y, opcional, `motivo`. Coma, UTF-8 y encabezado; `stack` y `etiquetas` separadas por `;`; fechas AAAA-MM-DD. Desde `postulado` en adelante hacen falta `fecha_postulacion`, `canal_tipo` y `canal_valor`.
- **Contactos:** `nombre,perfil_url,titular,empresa,correo,url_postulacion,motivo,mensaje_sugerido`.
- Cada postulación entra también a **Avisos**: su `stack` se compara con tu perfil y la ficha muestra en rojo, con ✕ y «falta», las herramientas que no tienes.
- Desde la terminal: `pnpm --filter nucleo importar archivo.csv`.

## Correrlo en desarrollo

Requisitos: Node 22.22 o más, pnpm 11, uv y Docker (solo para PostgreSQL en desarrollo).

```bash
cp .env.example .env
pnpm install
docker compose --profile liviano up -d --wait
pnpm --filter nucleo db:migrar
pnpm --filter nucleo importar datos/ejemplo/artifact-export.json
pnpm dev
```

- Consola: http://localhost:4200 · API: http://127.0.0.1:4300/api/v1 · OpenAPI: http://127.0.0.1:4300/docs
- El último paso de importación carga 5 postulaciones inventadas. Con datos reales, deja tu export en `datos/privado/` (está en `.gitignore`) y corre `pnpm --filter nucleo importar`.
- PostgreSQL queda en `127.0.0.1:5433` para no chocar con otra instancia local.

### Clave local (opcional)

```bash
pnpm --filter nucleo clave
```

Pide la clave y la guarda con argon2id. Reinicia el núcleo: la consola pedirá desbloquear. `pnpm --filter nucleo clave -- --quitar` la quita.

### Conectar tu IA por MCP

Con el núcleo corriendo, el token de MCP está en `.brecha/token-mcp` (permisos 0600). En Claude Code:

```bash
claude mcp add --transport http --scope local brecha http://127.0.0.1:4300/mcp --header "Authorization: Bearer $(cat .brecha/token-mcp)"
```

Herramientas: `listar_postulaciones` (con filtro por `etiquetas`), `listar_etiquetas`, `ver_postulacion`, `crear_postulacion`, `cambiar_estado`, `editar_postulacion` (también etiquetas y prioridad), `agregar_nota`, `agregar_contacto`, `agendar_entrevista`, `registrar_resultado_entrevista`, `registrar_senal`, `aplicar_senal`, `listar_bandeja`, `asociar_senal` (a una o varias postulaciones), `listar_pasos`, `registrar_paso`, `resolver_paso`, `editar_paso`, `listar_discrepancias`, `resolver_discrepancia`, `resumen`, `exportar`, `importar_csv` y `exportar_csv`. Lo que haga la IA queda con origen `ia` y pasa por las mismas reglas que la consola.

**Tu red de LinkedIn.** LinkedIn no tiene API, pero te avisa por correo: el vigía reconoce esos avisos (mensajes nuevos e invitaciones), crea o actualiza el contacto con su nombre, cargo, empresa y perfil, marca que te toca responder y lo liga a la postulación de esa empresa. Activa en LinkedIn → Preferencias → Comunicaciones los correos de mensajes e invitaciones. Lo que el correo no trae (el texto de los mensajes y los que envías tú) lo completa tu IA desde tu navegador con `listar_red`, `ver_contacto_red`, `registrar_contacto_red`, `registrar_interaccion_red` y `editar_contacto_red`: contactos, solicitudes de conexión y mensajes, cada uno ligado a sus postulaciones. Brecha calcula a quién le toca responder y te muestra, en la ficha de cada postulación, con quién estás hablando y por qué vía.

**Pasos pendientes.** Cuando un correo, un mensaje de LinkedIn o un portal te pide algo (un test, mandar el CV, un formulario, agendar una llamada), Brecha lo deja como un paso de texto libre en la postulación, o en varias, aunque esté cerrada. La tarjeta del tablero muestra una barra azul y el paso con **Hecho**, la ficha muestra el proceso completo y cada paso nuevo te avisa. El vigía reconoce la postulación por el número del aviso (Chiletrabajos `#3916453`), el hilo del correo o la empresa, y el siguiente correo se interpreta sabiendo qué pasos hiciste. Tu IA los anota con `registrar_paso` (o `registrar_interaccion_red` con `paso` si vino por LinkedIn) y los cierra con `resolver_paso` cuando le dices que ya lo hiciste. Para los correos que ya estaban leídos: `uv run ia pasos reprocesar --dias 30 --en-seco` (sin `--en-seco` los crea). Un correo de un dominio que ya escribió por una postulación (por ejemplo, la invitación de calendario de tu reclutador) pasa el filtro y va a esa postulación; si el filtro descartó uno antes de este cambio, `uv run ia correo releer --dias 3` lo vuelve a leer. Diseño en `docs/diseno/pasos.md`.

Con la app instalada, el token está en `~/Library/Application Support/Brecha/instancia/token-mcp`.

## Arriendos (segundo foco)

Donde dice **Brecha**, arriba a la izquierda, un selector cambia entre **Empleo** y **Arriendos** (también con ⌘1 y ⌘2). Arriendos funciona como empleo, pero para buscar dónde vivir:

- **Tablero por estado:** vista, contactada, visita agendada, visitada, en evaluación, aprobada y arrendada (más rechazada, descartada y no disponible).
- **Perfil de búsqueda:** reglas duras (descartan) y blandas con prioridad (P1 pesa más que P2), con etiquetas: presupuesto con gastos comunes, comunas, dormitorios, mascota, estacionamiento, renta exigida, aval… Brecha calcula el **calce** de cada propiedad y te dice la brecha en palabras («se pasa $40.000 del presupuesto»). Cada cambio queda en un historial con su motivo.
- **Canales:** Portal Inmobiliario, Yapo, Toctoc, Goplaceit, iCasas, Facebook Marketplace, WhatsApp, correo y teléfono vienen de partida; agregas los que falten (con sus dominios, Brecha reconoce sus URLs y correos).
- **Con quién hablas:** cada propiedad guarda sus contactos (teléfono, WhatsApp, correo, enlace de postulación, LinkedIn) y la conversación con cada uno; Brecha te dice a quién le toca responder.
- **Sin duplicados:** la misma URL es la misma propiedad; la misma dirección o un pin a menos de 30 m te la ofrece para unir.
- **Correo:** el vigía reconoce los correos de arriendo (alertas de portales, respuestas de corredores), los clasifica y los lleva a la propiedad o a la Bandeja de Arriendos.
- **Importar:** pega un aviso o sube un chat exportado de WhatsApp («Exportar chat» → «Sin archivos»); la IA propone las propiedades y tú eliges. Los teléfonos nunca se mandan a la IA.
- **Mapa** (también en Empleo, por comuna): MapLibre con el fondo de OpenFreeMap; las direcciones se ubican con Nominatim de OpenStreetMap (una por segundo, guardadas). Se apaga en el Perfil.

**Por MCP:** `ver_perfil` y `editar_perfil` (con `foco: arriendos`), `listar_propiedades`, `ver_propiedad`, `buscar_duplicado_propiedad`, `crear_propiedad`, `editar_propiedad`, `cambiar_estado_propiedad`, `agregar_publicacion`, `unir_propiedades`, `registrar_contacto_propiedad`, `registrar_interaccion_arriendo`, `agendar_visita`, `agregar_nota_propiedad`, `registrar_senal_arriendo`, `listar_bandeja_arriendos`, `asociar_senal_arriendo`, `listar_canales` y `registrar_canal`. Las instrucciones del servidor le piden a tu IA leer tus reglas antes de buscar, revisar duplicados antes de crear y **preguntarte antes de cambiar una regla**. Decisiones en [`docs/diseno/arriendos.md`](docs/diseno/arriendos.md) y el ADR 0020.

## Perfil de búsqueda (los dos focos)

Cada foco tiene una página **Perfil** con tus reglas: **duras** (descartan) y **blandas** con prioridad (P1 pesa más), cada una con **etiquetas** libres para agruparlas y filtrarlas, y un historial con el motivo de cada cambio. Una regla es un texto tuyo («Santiago solo híbrido o remoto»); si además calza con un chequeo que Brecha sabe hacer, el código la revisa:

- **Empleo:** palabras del título (incluir o excluir), modalidad por región (Región de Valparaíso, Santiago u otro lugar, con plataformas donde un aviso sin modalidad cuenta como presencial) y sueldo publicado frente a tu renta pretendida. Cada postulación que choca con una regla dura dice **«choca con tu perfil»** en la tarjeta y en la ficha; nunca cambia su estado.
- **Arriendos:** los criterios de siempre (presupuesto, comunas, dormitorios…), que dan el calce de cada propiedad.

Las reglas sin chequeo las aplica tu IA leyéndolas. Por MCP, `ver_perfil` y `editar_perfil` (con `foco: empleo` o `arriendos`); las instrucciones del servidor le piden a tu IA **leer el perfil antes de buscar**, y si le pides otro requisito, **preguntarte si lo agrega al perfil** o es solo esa vez. Diseño y decisiones (PB-D1 a PB-D14) en [`docs/diseno/perfil.md`](docs/diseno/perfil.md).

Para cargar un perfil desde un archivo (por ejemplo `datos/ejemplo/perfil-empleo.json`) en el núcleo que esté corriendo:

```bash
pnpm --filter nucleo perfil cargar datos/ejemplo/perfil-empleo.json
```

Usa `NUCLEO_URL` y `BRECHA_DIR` (la carpeta con `token-servicio`) del `.env`. Cargarlo dos veces deja lo mismo.

## Pruebas

```bash
pnpm turbo run lint typecheck test build   # lo mismo que corre el CI
pnpm turbo run e2e                          # Playwright del flujo principal, con axe
```

- Dominio: las 81 transiciones de estado y las reglas R1 a R14, sin base de datos.
- Persistencia, API y MCP: contra la base `brecha_pruebas` del mismo `docker compose`.
- Consola: stores, guard e interceptores con Vitest; el flujo completo con Playwright contra el núcleo real.

## Estructura

```
apps/consola          Angular 22 + Spartan + Tailwind 4
apps/escritorio       Electron: la app de macOS (barra de menú y supervisor)
services/nucleo       NestJS 12 hexagonal + Prisma 7 + MCP
services/ia           Python 3.13: vigía del correo, avisos, calce y Preguntar
packages/contratos    openapi.json y tipos generados
packages/config       tsconfig y ESLint compartidos
datos/ejemplo         datos inventados para probar
docs/                 plan, diseño y decisiones (ADR)
```

## Datos y privacidad

El repositorio es público y no contiene datos personales: los datos reales van a `datos/privado/` y a la base local (ADR 0008).
