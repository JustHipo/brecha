# Brecha

Seguimiento personal de postulaciones de empleo. Juntas en un tablero las postulaciones de todas las plataformas, registras la evidencia que llega (correos, cambios en los portales) como **señales**, y Brecha te avisa cuando un movimiento del tablero no calza con esa evidencia (**discrepancias**). Una IA (Claude Code, Claude Desktop u otra) puede operarla por **MCP**.

Brecha se instala y corre en tu máquina: no hay servidor central, cuentas ni nube. Tus datos no salen de tu equipo.

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

Herramientas: `listar_postulaciones` (con filtro por `etiquetas`), `listar_etiquetas`, `ver_postulacion`, `crear_postulacion`, `cambiar_estado`, `editar_postulacion` (también etiquetas y prioridad), `agregar_nota`, `agregar_contacto`, `agendar_entrevista`, `registrar_senal`, `aplicar_senal`, `listar_bandeja`, `asociar_senal`, `listar_discrepancias`, `resolver_discrepancia`, `resumen`, `exportar`, `importar_csv` y `exportar_csv`. Lo que haga la IA queda con origen `ia` y pasa por las mismas reglas que la consola.

**Tu red de LinkedIn.** LinkedIn no tiene API, pero te avisa por correo: el vigía reconoce esos avisos (mensajes nuevos e invitaciones), crea o actualiza el contacto con su nombre, cargo, empresa y perfil, marca que te toca responder y lo liga a la postulación de esa empresa. Activa en LinkedIn → Preferencias → Comunicaciones los correos de mensajes e invitaciones. Lo que el correo no trae (el texto de los mensajes y los que envías tú) lo completa tu IA desde tu navegador con `listar_red`, `ver_contacto_red`, `registrar_contacto_red`, `registrar_interaccion_red` y `editar_contacto_red`: contactos, solicitudes de conexión y mensajes, cada uno ligado a sus postulaciones. Brecha calcula a quién le toca responder y te muestra, en la ficha de cada postulación, con quién estás hablando y por qué vía.

Con la app instalada, el token está en `~/Library/Application Support/Brecha/instancia/token-mcp`.

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
