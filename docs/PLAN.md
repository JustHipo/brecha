# Plan: Brecha, proyecto de aprendizaje con las herramientas que piden las ofertas

Escrito el 23-nov-2026 a partir de una revisión de 46 ofertas de empleo backend publicadas en Chile en noviembre de 2026.

**Versión 3 (23-nov-2026, después del checkpoint de F0).** Juan redefinió la forma del producto (D8, sección 6.1): Brecha es una **instancia personal** que cada persona instala y deja corriendo en segundo plano; sigue las postulaciones en el correo y en las plataformas, la puede operar una IA por MCP y hooks, y valida con evidencia los movimientos del tablero. Sin login de servidor ni sitio público. Cambian las secciones 3, 4, 6, 7, 10 a 15 y los ADR 0009 a 0012. La versión 2 (F0 en papel con D1 a D7) queda incluida.

**Versión 4 (23-nov-2026, segunda ronda):** D9 a D18 (sección 6). Modo liviano en segundo plano y completo al abrir (3.1), FastAPI con PostgreSQL y pgvector en vez de MongoDB, lector de correo propio más MCP, proveedor de IA OpenAI o local, sin celular, capa de idioma para inglés, macOS primero. ADR 0013 a 0016; 0007 rechazado y 0011 reemplazado. Lo que falta decidir está en 6.3.

**Diseño detallado (23-nov-2026):** `docs/diseno/backend.md` (aprobado por Juan, con los cambios C1 a C7 de su sección 9: MCP por HTTP en el núcleo, token siempre más validación de Host y Origin, señales como comando HTTP, R4 con `aviso_url_activa`, prueba de humo de Prisma 7 con NestJS, flujo SSE de eventos y lado de lectura aparte; ADR 0018 y 0019) y `docs/diseno/ui.md` (**aprobado** el 23-nov con la dirección visual D22). Maquetas: https://claude.ai/artifact/XuQMrzncy3ysvrSx3yMZud (página «Maquetas v2»). La primera versión no le gustó a Juan; la segunda se hizo con referencias reales del MCP de Refero. Vista para leer: artifact «Plan de Brecha» (https://claude.ai/artifact/NKp2cCezZgsjFVqv9bGP84).

**F1 implementada (23-nov-2026):** estado, problemas y soluciones en la sección 7 (F1).

## 1. Contexto en simple

- **Qué es:** Brecha es un proyecto personal para aprender, en un sistema real, las herramientas que más piden las ofertas de desarrollo backend en Chile (Angular, React y Next.js, microservicios, RAG, colas y eventos, arquitectura hexagonal), conectadas a un stack conocido (NestJS, Prisma, PostgreSQL).
- **Qué hace la app:** sigue postulaciones de empleo en varias plataformas, con evidencia del correo y validación por IA (sección 4).
- **Qué se decidió:** sección 6 (D1 a D35). **Qué falta decidir:** sección 6.3.

## 2. Qué cubre y qué deja fuera

De las 46 fichas, 33 tienen algo «por aprender». Con D3 (sin nube) salen Google Cloud y Terraform; el resto se mantiene.

| Herramienta | Ofertas | Dónde entra |
|---|---|---|
| React / Next.js | 10 | Vista Panorama en Next.js (F4), local |
| Google Cloud | 5 | **Fuera (D3, 23-nov):** la app queda standalone en GitHub |
| MongoDB / NoSQL | 5 | **Fuera (D10, 23-nov):** el servicio con IA usa PostgreSQL con pgvector |
| Microservicios | 5 | 3 o 4 servicios chicos con motivo para estar separados (F1 a F6) |
| RAG con bases vectoriales | 4 | Búsqueda semántica con pgvector en PostgreSQL (F2) |
| Angular | 3 | Consola principal en Angular con Tailwind (F1), la primera fase |
| Tailwind | 3 | Consola Angular y sitio Next.js |
| Terraform | 3 | **Fuera (D3, 23-nov)** |
| DDD, hexagonal, Clean Architecture | 3 | Servicio núcleo en NestJS con puertos y adaptadores (F1) |
| Java con Spring Boot | 3 | **Fuera (D5, 23-nov):** Get on Board lo lee el vigía |
| Colas y eventos | 3 | RabbitMQ detrás de un puerto `BusDeEventos` (F3) |
| WebSocket / tiempo real | 2 | Notificaciones en vivo con Socket.IO (F3) |
| Turborepo, FastAPI, Testcontainers | 1 a 2 | De regalo: monorepo, servicio Python, pruebas de integración |

**Queda fuera, a propósito:**
- **Google Cloud, Terraform, Pub/Sub (D3):** decisión de Juan del 23-nov: «vamos a dejar los servicios cloud fuera por más que lo pidan, quedará como una app standalone en GitHub».
- **Django (3) y C# / .NET (3):** serían un tercer y cuarto framework de backend en el mismo proyecto. Si después quieres uno, Django es el más barato para ti; se haría como proyecto aparte.
- **DynamoDB, AWS Lambda (2 cada una):** son de AWS y el proyecto no usa nube.
- **Elasticsearch, n8n, scikit-learn, React Native, MLOps (1 cada una):** pocas ofertas. MLOps queda en parte cubierto por las evaluaciones y trazas del RAG (F2).

## 3. Arquitectura

Brecha es una **instancia personal autoalojada** (D8, ADR 0010): cada persona la instala en su máquina y la deja corriendo en segundo plano. No hay servidor central ni sitio público con datos. Las credenciales de cada uno (correo, portales, llave de su proveedor de IA) y sus datos se quedan en su máquina; no pasan por ningún sistema nuestro.

```
 ┌──────────────────────────── máquina de cada persona ─────────────────────────────┐
 │                                                                                   │
 │  Consola Angular ──REST──▶ Núcleo NestJS ◀──MCP──  IA del usuario                 │
 │  tablero, señales,         DDD, hexagonal          (Claude Code, Claude Desktop…) │
 │  discrepancias             Prisma + PostgreSQL     consulta, mueve, anota         │
 │        ▲ WebSocket              │ outbox                                          │
 │        │                        ▼                                                 │
 │  Notificaciones ◀════════ RabbitMQ ════════▶ Servicio con IA                      │
 │  Socket.IO + aviso del         ▲  │ hooks    FastAPI + Postgres: avisos, correos, │
 │  sistema operativo,            │  ▼          señales, RAG, validación             │
 │  con prioridad                 │  scripts y automatizaciones locales (F3)         │
 │                                │                                                  │
 │                    Fuentes (F2): correo (IMAP o Gmail, solo lectura),             │
 │                    API de Get on Board, plataformas sin API vía la IA del usuario │
 │                                                                                   │
 │  Panorama (Next.js, F4): análisis del mercado con los avisos propios              │
 └──────────────────────────────────────┬────────────────────────────────────────────┘
                                        │ solo hacia lo que el usuario configura:
                                        │ sus cuentas (correo, portales) y su proveedor de IA
```

Por qué cada servicio está separado (esto es lo que conviene saber decir en una entrevista):
- **Núcleo:** las reglas del negocio (contexto Seguimiento) y su base relacional. Es el único que escribe ahí. Tiene tres adaptadores de entrada sobre los mismos casos de uso: REST (consola), MCP (IA) y eventos (señales). Esto es lo que mejor demuestra la arquitectura hexagonal.
- **Servicio con IA:** otro lenguaje (Python), otra base (documentos y vectores) y otra forma de escalar (llamadas lentas a modelos). Lee las fuentes, extrae señales y valida.
- **Notificaciones:** mantiene conexiones abiertas y decide por dónde avisar según la prioridad; se escala distinto a una API que responde y cierra.

Y el contrapunto: con un equipo chico, un monolito modular suele ser lo correcto. Saber cuándo **no** separar es parte de saber microservicios (ADR 0005). En una app personal el costo de varios servicios se nota en memoria; está anotado como pregunta para la sesión de stack (sección 10).

### 3.1 Modo liviano y modo completo (D9, ADR 0014)

| | Liviano (siempre, en segundo plano) | Completo (con la app abierta) |
|---|---|---|
| Qué corre | Núcleo (REST y MCP), PostgreSQL, el **vigía** (entrada liviana del servicio con IA: lector de correo y tareas programadas) y los avisos del sistema operativo | Lo anterior más la API del servicio con IA (FastAPI: análisis, RAG, validación), RabbitMQ, notificaciones en vivo (Socket.IO), la consola y Panorama |
| Qué hace | Cada cierto tiempo revisa el correo y guarda los correos nuevos de plataformas, detecta cierres próximos y avisa. Si el proveedor de IA es por API (OpenAI), clasifica ahí mismo: una llamada HTTP casi no usa memoria. Con un modelo local, deja los correos en cola hasta que se abra la app | Clasifica lo pendiente, analiza avisos, responde preguntas, valida movimientos y entrega en vivo lo acumulado |
| Eventos | Se guardan en el outbox del núcleo | Al arrancar, el publicador vacía el outbox hacia RabbitMQ: nada se pierde |

Un proceso chico (el **supervisor**) arranca con el equipo, mantiene el modo liviano y levanta o baja el completo al abrir y cerrar la app. El outbox (ADR 0005) es lo que hace fácil este diseño: con RabbitMQ apagado, los eventos esperan en la base.

**Ojo con Docker en macOS:** Docker Desktop mantiene una máquina virtual que por sí sola ocupa memoria. Si el modo liviano corre dentro de Docker, deja de ser liviano. Por eso Brecha se empaqueta como app de escritorio con Electron (D19, ADR 0017): el proceso principal de Electron es el supervisor, vive en la barra de menú, y Docker queda solo para desarrollo y CI.

## 4. Las dos ideas

### Idea 1 (elegida el 23-nov): Brecha, seguimiento de postulaciones con evidencia

**Qué hace:**
- Juntas tus postulaciones de todas las plataformas (LinkedIn, trabajando, Get on Board, Computrabajo, sitios de empresas) en un tablero por estado y las mueves arrastrando.
- Brecha **vigila tus fuentes** (correo y plataformas) y convierte lo que encuentra en **señales**: «llegó un correo de rechazo de X», «te invitaron a entrevista en Y», «la postulación en Z cambió a vista».
- Una **IA valida tus movimientos** contra esas señales. Si moviste una tarjeta a «entrevista» y la evidencia dice otra cosa, te avisa; no te bloquea.
- **Notificaciones con prioridad:** lo que pasa en postulaciones activas avisa al tiro. Lo que llega de una que descartaste también avisa, pero con prioridad baja.
- **Todo se puede operar con IA:** un servidor MCP para que Claude u otra IA consulte, mueva y anote, y hooks para automatizar («cuando agenden una entrevista, haz X»).
- La IA extrae de cada aviso el stack, los requisitos y las brechas frente al perfil de la persona, y responde preguntas sobre tus ofertas (RAG). El código calcula los puntajes: el modelo clasifica y extrae, pero no hace cuentas.

**Cómo se reparte:** sección 3. **Para quién:** cualquier persona que postula; cada una instala su propia Brecha con sus cuentas (D8).

**Por qué:** datos reales desde el día 1 (46 fichas de postulación y 157 avisos), uso real, un dominio conocido de primera mano (DDD necesita conocerlo) y una idea que se entiende en 10 segundos.

**Riesgos:**
- **Plataformas sin API (LinkedIn, trabajando):** las condiciones de uso de LinkedIn prohíben automatizar o extraer datos de su sitio. Por eso el camino principal es el correo, que todas las plataformas mandan al cambiar de estado. Operar el portal con la IA del usuario en su propio navegador queda como opción explícita y bajo su responsabilidad (ADR 0011). Las condiciones exactas de cada portal se revisan al empezar F2.
- **Privacidad:** los correos y avisos llegan al proveedor de IA que configure cada persona, salvo que use un modelo local. Se dice claro en la instalación.
- **Peso en segundo plano:** resuelto con D9: en segundo plano corre solo lo liviano y lo pesado se levanta al abrir la app (3.1).

### Idea 2 (descartada el 23-nov): seguimiento de importaciones para pymes

Una pyme registra sus importaciones y las sigue por hitos, con RAG sobre normativa aduanera y cálculo de aranceles. Era un dominio de comercio exterior, sin usuarios ni datos reales y con un dominio nuevo que aprender. Juan eligió la Idea 1.

## 5. Nombre

**Brecha** (D2, 23-nov): describe lo que hace la app, mide lo que te falta para cada oferta. Revisado en GitHub el 23-nov: el repo más visible con ese nombre tiene 15 estrellas y es de otra cosa; «radar» estaba saturado. Repo: `github.com/JustHipo/brecha`.

## 6. Decisiones (cerradas el 23-nov-2026; D8 después del checkpoint)

| # | Decisión | Decidido | Consecuencia |
|---|---|---|---|
| D1 | Idea | Idea 1 | Dominio: ofertas y postulaciones |
| D2 | Nombre | **Brecha** | Repo `JustHipo/brecha`, carpeta `proj/brecha` |
| D3 | Gasto en la nube | **Sin nube.** App standalone en GitHub, aunque las ofertas lo pidan | Sale F5 (Google Cloud con Terraform) y Pub/Sub. Todo corre con `docker compose`. Gasto: USD 0. Vector Search con la imagen local de MongoDB Atlas (ADR 0007; cambiado por D10 a PostgreSQL con pgvector) |
| D4 | Ritmo | **Intensivo: todo hoy (23-nov) y mañana si alcanza** | Las tareas se cortan para hacerse en paralelo (una sesión por servicio), con F1 primero |
| D5 | ¿Spring Boot? | **No se hace** (segunda ronda, 23-nov). Antes: «anótale las herramientas que deberíamos implementar» | F6 fuera; Get on Board lo lee el vigía; una JVM no cabe en el modo liviano |
| D6 | Git del proyecto | **La IA hace commits y push desde la cuenta de Juan (JustHipo) y abre PRs.** Sin nombrarse como coautora ni en el texto. Ningún merge sin CI en verde y sin confirmación previa de Juan | El CI va en la primera PR (tarea F1-03). |
| D7 | Dónde vive el código | **`~/Documents/proj/brecha`**, renombrando `proj/postulaciones` al cerrar F0 | F1 parte en una sesión nueva abierta en `proj/brecha`. El reflejo del vault `Personal/Proyectos/postulaciones` queda huérfano (no se borra sin pedirlo) |
| D8 | Forma del producto (después del checkpoint) | **Instancia personal autoalojada**, en segundo plano, operable por IA, con seguimiento de fuentes y validación de movimientos. Acceso solo local, con clave local opcional. Sin sitio público | ADR 0010 a 0012 (0009 reemplazado). F1 suma el servidor MCP; F2 pasa a ser «Fuentes y señales»; F4 pasa a ser una vista local |
| D9 | Peso en segundo plano | **Modo liviano siempre y modo completo al abrir la app** | Sección 3.1, ADR 0014. Supervisor que levanta y baja lo pesado |
| D10 | Servicio con IA y su base | **FastAPI y PostgreSQL con pgvector**, sin MongoDB | ADR 0013 (0007 rechazado). Una sola instancia de PostgreSQL con un esquema por servicio. MongoDB (5 ofertas) deja de cubrirse |
| D11 | Correo | **Lector propio de Brecha**, y además la IA del usuario puede registrar señales por MCP | ADR 0015 (reemplaza 0011) |
| D12 | Artifacts desde el MCP | El MCP permite leer todo y editar, para que Claude cree y actualice sus propios artifacts con los datos de Brecha | Herramientas `exportar` y `editar_postulacion` (12.2) |
| D13 | Proveedor de IA | Interfaz que acepta **OpenAI y un modelo local** | ADR 0016 |
| D14 | Plataformas sin API | La IA del usuario puede revisar el portal desde su navegador (por ejemplo, Claude en Chrome) y actualizar Brecha por MCP. **Brecha no automatiza navegadores** | ADR 0015 |
| D15 | Celular | **Sin acceso desde el celular**: app de escritorio | Se quitan los criterios de 375 px; la consola se diseña para ventana de escritorio |
| D16 | Idioma | Español con **capa de idioma para inglés** | i18n desde F1-12; la librería se elige al empezar F1 |
| D17 | Sistemas operativos | **macOS primero**; Windows si no es muy complicado (como Anytype) | Depende del empaquetado (6.3) |
| D18 | Decisiones de cada fase | Se le preguntan a Juan al empezar esa fase, no antes | Lista en 6.3 |
| D19 | Empaquetado | **App de escritorio con Electron**, como Anytype: vive en la barra de menú, la consola Angular va dentro y el proceso principal hace de supervisor | ADR 0017. Docker queda solo para desarrollo y CI. Windows queda al alcance; empaquetar PostgreSQL y el vigía en Python por sistema cae en F3 y F7 |
| D20 | Base de componentes | **Spartan** (shadcn/ui para Angular) sobre Tailwind; Angular CDK para el drag and drop | Los estilos viven en el repo y se editan. Confirmar su madurez y su compatibilidad con Angular 22 al empezar F1 (si falla, Tailwind con CDK) |
| D21 | Dirección visual | **Moodboard + Design de Claude:** referencias (Huntr, Teal, Linear, Anytype, temas de shadcn) en un moodboard de Obsidian con la skill `reference-board`; después un artifact Design System con 2 o 3 opciones de paleta y tipografía para que Juan elija, y maquetas de las pantallas clave en un artifact Design. Los tokens pasan al tema de Tailwind y Spartan | Tarea F1-00, en paralelo con el núcleo y antes de F1-12 |
| D22 | Dirección visual | **«Cálida» con barra lateral en degradé terracota.** Sale de las referencias de Refero que Juan eligió: 2 Marathon, 4 Fibery, 5 y 9 Homerun, 6 Teal. Fondo blanco, beige cálido en superficies, acento azul para acciones, terracota solo en la barra, amarillo para avisos y discrepancias; títulos en Plus Jakarta Sans 800 y texto en Inter; botones en píldora; embudo de etapas en flechas arriba del tablero; tarjetas con etiqueta de plataforma, iniciales de la empresa y filas de datos; ficha con etapas apiladas y panel de actividad a la derecha | Maquetas aprobadas en el lienzo (página «Maquetas v2»); tokens en `docs/diseno/ui.md` §7. F1-00 queda casi hecha: falta exportar los tokens al tema de Tailwind y Spartan |
| D23 | Modo oscuro | **Solo modo claro en F1**; los tokens quedan preparados para sumar el oscuro después | Sin segunda paleta ni pruebas de tema en F1 |
| D24 | Librería de idioma | **Transloco 8.4** (cambia de idioma en vivo, sin recompilar) | F1-12 la instala con `es` y `en` |
| D25 | Lector de correo (F2) | **IMAP con contraseña de aplicación**, solo lectura; la contraseña va al llavero de macOS | Sin proyecto en Google Cloud (P-BRECHA-SIN-NUBE). Sirve también para otros proveedores. Confirmar al empezar que Google sigue entregando contraseñas de aplicación para IMAP |
| D26 | Proveedor de IA en F2 | **Solo OpenAI por ahora**: clasificación y embeddings con la llave del usuario | El adaptador de modelo local (ADR 0016) queda para después; la interfaz se diseña igual para los dos. El gasto de OpenAI es de cada persona |
| D27 | Aplicar señales seguras (R11) | **Encendido por defecto, umbral 0,9** | Una señal de una fuente automática (`correo` o `plataforma`) con confianza 0,9 o más y un salto válido cambia el estado sola (origen `senal`); bajo el umbral, o si la registró la persona o su IA (`manual`, `ia`), queda como sugerencia. Cambia el valor por defecto de `PrismaAjustes` (hoy apagado) |
| D28 | Trazas del modelo | **Trazas propias** en el esquema `ia` (llamada, modelo, tokens, costo, resultado) y los sets de evaluación con un script; **sin Langfuse** | Nada pesado extra en Docker. Langfuse puede volver como perfil aparte si hace falta |
| D29 | Frecuencia del vigía | **Cada 15 minutos** | Una consulta IMAP por vuelta; ajustable desde Ajustes en F3. IMAP IDLE queda como mejora posible |
| D30 | Umbrales de evaluación de F2 | **Laxos:** correos ≥ 80 % estado, ≥ 75 % asociación, máximo 1 falso rechazo; preguntas ≥ 70 % y 100 % de citas válidas | Definen el «hecho» de F2 (`docs/diseno/f2.md` §9) |
| D31 | trabajando | **Fuera de F2**: solo sus correos | Su API no es pública; el portal lo revisa la IA del usuario por MCP (D14) |
| D32 | Perfil para brechas y calce | **Desde los datos del CV** (archivo local), editable en Conexiones | Nunca al repo |
| D33 | Primera sincronización del correo | **Últimos 60 días** | Después, solo lo nuevo |
| D34 | Modelo para clasificar correos | **`gpt-6-luna`** (USD 0,10 entrada y 0,50 salida por millón de tokens, página oficial del 24-nov-2026), con salida estructurada | Probado con 27 correos reales: USD 0,0045 en total. Se cambia en `OPENAI_MODELO` |
| D35 | Correos que envía la persona | **Cuentan como señal** (por ejemplo, de `postulado` cuando postula por correo directo) | Pasan el mismo filtro y la misma clasificación que los demás |
| D36 | PostgreSQL en la app instalada | **Adentro de la app**: PostgreSQL 17.12 de `@embedded-postgres/darwin-arm64` con el pgvector de Homebrew para PostgreSQL 17, en 127.0.0.1:5434 y solo TCP | Se instala sin Docker. Verificado: crea la base, aplica las migraciones y responde consultas de vectores (24-nov-2026) |
| D37 | Servicio con IA en la app | **Binario con PyInstaller** (`brecha-ia`, 46 MB, onedir) | Funciona sin internet ni Python instalado |
| D38 | Alcance para cerrar el desarrollo | **F3 sin RabbitMQ más F7**: app de escritorio, Ajustes, notificaciones, validación con IA y hooks leyendo el outbox; instalador y README. F4 queda para después | Para una sola persona, el outbox ya garantiza que no se pierdan eventos |
| D39 | Firma de la app | **Sin firma de Apple** (firma ad hoc) | Uso personal; macOS pregunta una vez por el acceso al llavero |
| D40 | Red de LinkedIn | **Contactos, solicitudes y mensajes en el núcleo, ligados a postulaciones**, actualizados por la IA de la persona por MCP (LinkedIn no tiene API) | Pedido de Juan el 23-nov-2026: saber con quién habla en cada postulación y por qué vía |
| D41 | Importar y exportar por CSV | **Postulaciones y contactos de LinkedIn en CSV** (coma, UTF-8, encabezado), idempotente por URL del aviso y por perfil; exportar en el mismo formato; plantillas. Pedido de Juan el 24-nov-2026 para la Brecha de Tamara | `docs/diseno/csv.md`; REST `/csv/*`, MCP `importar_csv` y `exportar_csv`, `pnpm importar archivo.csv`, página Importar y exportar |
| D42 | Etiquetas | **Objeto de valor del agregado**, guardadas en minúsculas y sin tildes, con filtro en lista, tablero, API y MCP | Migración `20261126000000_csv_etiquetas` |
| D43 | Prioridad fijada a mano | Manda **solo en estados abiertos**; las cerradas siguen en baja (R12) | Editable en la ficha y por MCP; columna `prioridad` del CSV |
| D44 | Estados al importar | **Los 9**; desde `postulado` se exigen fecha y canal; `descartado` no, salvo que traiga uno; columna opcional `motivo` (si falta, «Importado desde CSV») | Se crean directo con origen `importacion`, sin discrepancias |
| D45 | Stack con calce | El `stack` cuenta **directo como requisitos** sin llamar al modelo; el modelo solo completa con el texto de `requisitos`. **Toda postulación entra al inventario de Avisos** | `TraerAvisosDelNucleo` y `AnalizarSinModelo` en el servicio con IA |
| D46 | Contactos sin LinkedIn | **Se importan igual**, reconocidos por nombre y empresa, con advertencia; el perfil se completa después | Migración `20261126010000_red_sin_perfil` |
| D47 | Lector de CSV | **csv-parse 7.0.3 y csv-stringify 6.9.0** | Detrás del puerto `LectorCsv` |
| D48 | Rojo de las brechas | Token **`brecha` #B42318 sobre #FDECEA** (5,8:1), siempre con ✕ y «falta» | `apps/consola/src/styles.css` |
| D49 | Windows (D17) | **Sí, para Tamara**: instalador NSIS por usuario (sin administrador), PostgreSQL 17.12 de `@embedded-postgres/windows-x64` con pgvector compilado en el CI, `brecha-ia.exe` con PyInstaller y credenciales en el Administrador de credenciales | Pedido de Juan el 24-nov-2026. Plan y riesgos en `docs/diseno/windows.md` |
| D50 | Firma del instalador de Windows | **Sin firma** | Azure Artifact Signing no acepta personas ni empresas de Chile; un certificado OV no quita el aviso de SmartScreen para una sola instalación. Smart App Control se revisa en el equipo |
| D51 | CI de la app de escritorio | **Workflow «App de escritorio»** con jobs de Windows y macOS que arman la app, la instalan y la prueban (prueba de humo); el instalador y el .dmg quedan como artefactos | Corre en PRs que tocan la app, los servicios o la consola, y a mano |
| D52 | Conectar Gmail | **Guía de 4 pasos en Ajustes** para la contraseña de aplicación; cada persona conecta su propia cuenta | La contraseña se prueba antes de guardarse y nunca vuelve a la pantalla, a archivos ni a registros |

### 6.1 D8: lo que pidió Juan después del checkpoint de F0

Resumen de su mensaje del 23-nov-2026:
- **Sin inicio de sesión de servidor.** A lo más una contraseña local: la app no va a estar en un servidor.
- **Despliegue personal:** cada persona levanta la suya, en segundo plano, para que avise cuando algo cambie de estado.
- **Seguimiento:** ver si llegaron correos o si una postulación cambió de estado en las plataformas donde postulaste.
- **Varias plataformas** (trabajando, LinkedIn y otras) a partir de MCP o API con alguna IA.
- **Todo operable por IA**, para hacer hooks y automatizaciones.
- **Tablero con arrastrar y soltar**, pero con **validación de la IA**: si moví mal una postulación, que lo detecte.
- **Descartadas:** si llega algo de una postulación descartada, avisar igual, pero sin prioridad.
- **Nada público:** el frontend no es para todos ni va a estar levantado 24/7. Cada persona pone sus propias credenciales y sus datos no pasan por nuestro sistema.

### 6.3 Lo que falta decidir

**Antes de planificar la UI y el backend:**
1. ~~**Empaquetado**~~ → decidido: app Electron (D19).
2. ~~**Base de componentes**~~ → decidido: Spartan (D20).
3. ~~**Fuentes de diseño**~~ → decidido: moodboard + Design de Claude (D21).
4. ~~**Spring Boot**~~ → decidido: no se hace (D5).

Con esto no queda nada abierto antes de planificar la UI y el backend.

**Se preguntan al empezar su fase (D18):**
- **F1:** nada abierto: paleta y tipografía en D22, modo claro en D23, Transloco en D24.
- **F2:** ~~protocolo del lector, modelo local y embeddings, señales seguras, Langfuse, frecuencia del vigía~~ → decididos el 23-nov-2026 (D25 a D29).
- **F3:** librería de avisos del sistema operativo; hooks de ejemplo.
- **F4:** Panorama como app aparte o sección de la consola; página del proyecto en GitHub Pages.

### 6.2 Precios verificados (23-nov-2026, páginas oficiales)

Se verificaron antes de D3. Quedan como referencia por si algún día se despliega; hoy no aplican.

| Servicio | Dato | Fuente |
|---|---|---|
| Cloud Run | Capa gratis mensual por cuenta de facturación: 180.000 vCPU-s, 360.000 GiB-s y 2 M de solicitudes. Escalar a cero no cuesta. `us-central1` es Tier 1; `southamerica-west1` (Santiago) es Tier 2 (más caro) | https://cloud.google.com/run/pricing |
| Pub/Sub | 10 GiB al mes gratis; después USD 40 por TiB | https://cloud.google.com/pubsub/pricing |
| Free Trial | USD 300 por 90 días para cuentas nuevas | https://cloud.google.com/free |
| Cloud SQL | Sin capa gratis. db-f1-micro: USD 0,0105/h, unos USD 7,7 al mes en `us-central1` aunque no se use | https://cloud.google.com/sql/pricing |
| Presupuestos | Una alerta avisa y **no** corta el gasto. Hay topes de gasto que pausan Cloud Run, pero no son instantáneos | https://cloud.google.com/billing/docs/how-to/budgets |
| MongoDB Atlas Free (M0) | 512 MB, 100 ops/s, se pausa tras 30 días sin uso. Vector Search sí, con máximo 3 índices. **No existe en Santiago** (sí en `us-central1` y São Paulo) | https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/ |
| Neon Free | 1 GB por proyecto, 100 CU-h al mes, se suspende tras 5 min sin uso | https://neon.com/docs/introduction/plans |
| Get on Board | API pública gratis y sin llave: `https://www.getonbrd.com/api/v0/search/jobs`; 20 solicitudes cada 5 s; hay que citar y enlazar cada oferta | https://www.getonbrd.com/api-doc.html |
| MongoDB local | Imagen `mongodb/mongodb-atlas-local`: Search y Vector Search en local, nodo único, pide 2 GB de RAM y 2 núcleos; healthcheck incluido | https://www.mongodb.com/docs/atlas/cli/current/atlas-cli-deploy-docker/ |

### 6.4 Arriendos (24-nov-2026)

Juan pidió un segundo foco para buscar arriendo, con un selector donde dice «Brecha». Plan, respuestas de Juan y decisiones A-D1 a A-D20 en `docs/diseno/arriendos.md`; decisión de arquitectura en el ADR 0020. Se numeran aparte (A-D) para no chocar con las D de otras ramas en curso.

## 7. Fases con checkpoints

Cada fase termina con un checkpoint: la revisas, la pruebas y decides si seguimos.

### F0: Decisiones en papel (esta sesión)
**Estado**: ✅ Completada el 23-nov-2026. En el checkpoint Juan respondió con D8 (sección 6.1) y dijo «avanza, vamos adelante»
- D1 a D7 cerradas (sección 6). Precios y capas gratis verificados (6.2).
- Plan detallado: dominio (11), contratos (12), monorepo (13), pantallas (14) y tareas de F1 (15).
- ADRs 0001 a 0012 en `docs/adr/` (0010 a 0012 por D8).
- **El esqueleto técnico** (monorepo, `docker compose`, CI, repo en GitHub) pasa a ser el inicio de F1 (tareas F1-01 a F1-04).

**Archivos creados o modificados:**
| Archivo | Cambio |
|---|---|
| `docs/PLAN.md` | Versión 2: decisiones, secciones 10 a 15 |
| `docs/adr/0001` a `0012` | Decisiones de arquitectura (0009 reemplazado por 0010 tras D8) |

**Problemas encontrados:** el `latest` de Prisma en npm es una versión candidata (8.0.0-rc.35). **Solución aplicada:** fijar 7.10.1 (sección 10).

### F1: Esqueleto + núcleo hexagonal + consola Angular con Tailwind + MCP
**Estado**: ✅ Completada el 23-nov-2026: PR #1 mergeada en `main` con el CI en verde y el MCP conectado a Claude Code · desglose en la sección 15

**Archivos creados o modificados:**
| Archivo | Cambio |
|---|---|
| `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `packages/config` | Monorepo con pnpm 11 y Turborepo (F1-01) |
| `docker-compose.yml`, `infra/postgres/init` | PostgreSQL 17 con pgvector en 127.0.0.1:5433, esquemas `nucleo` e `ia` y base `brecha_pruebas` (F1-02) |
| `.github/workflows/ci.yml` | Formato, lint con reglas de capas, tipos, pruebas, build, Playwright y contrato (F1-03, F1-15) |
| `services/nucleo` | Dominio, Prisma, casos de uso, acceso, REST, SSE, MCP por HTTP e importador (F1-05 a F1-11) |
| `packages/contratos` | `openapi.json` y tipos generados (F1-10a) |
| `apps/consola` | Tema, base, Tablero, Lista, Desbloquear, Ficha, Nueva, diálogos y pruebas (F1-00, F1-12 a F1-15) |
| `datos/ejemplo/artifact-export.json` | 5 fichas inventadas para probar el importador (F1-11) |

**Problemas encontrados:**
- TypeScript 7 es el `latest` de npm, pero Angular 22 y `@nestjs/swagger` 12 piden la 6.0.
- Prisma 7 es ESM y NestJS se compila a CommonJS (F1-07a).
- El export del artifact tiene 52 fichas únicas (50 en la página y 2 descartadas que solo están en su base), no 46.
- El token de `gh` no tenía el permiso `workflow`, que GitHub exige para subir `.github/workflows`.
- La Playwright encontró formularios con `(ngSubmit)` sin `[formGroup]` (recargaban la página), una clave de idioma repetida y un gris de la maqueta sin contraste suficiente.

**Soluciones aplicadas:**
- TypeScript fijo en 6.0.3 en todo el monorepo.
- Cliente de Prisma con `moduleFormat = "cjs"` (detalle en `docs/diseno/backend.md` §5.1).
- Se importan las 52; el importador es idempotente por URL del aviso.
- Formularios con `FormGroup`; el chequeo de idiomas detecta claves repetidas; la etapa pendiente de la ficha usa `tinta-suave` (#6B645E).
- Las columnas no permitidas se atenúan al arrastrar pero aceptan soltar: la API decide y la tarjeta vuelve con `TRANSICION_INVALIDA` (criterio de F1-13; ui.md §1 «la API manda»).

- Acceso solo local (clave local opcional), sin login de servidor (ADR 0010).
- El dominio ya modela señales, discrepancias y prioridad (la parte determinista); la IA que las produce llega en F2 y F3.
- Servidor MCP sobre los mismos casos de uso (ADR 0012).
- **Hecho cuando:** usas la consola con tus 46 postulaciones reales, Claude Code puede listar, mover y anotar postulaciones por MCP, el CI está en verde y la PR de F1 está mergeada con tu confirmación.

### F2: Fuentes y señales + PostgreSQL con pgvector + RAG
**Estado**: 🔄 En curso · plan aprobado en `docs/diseno/f2.md`
- Servicio con IA en FastAPI sobre PostgreSQL con pgvector (D10), con dos entradas: el **vigía** liviano y la **API** completa (3.1). Su esquema `ia` es solo suyo.
- **Correo primero, con lector propio (D11, ADR 0015):** conexión de solo lectura al correo de la persona (IMAP o Gmail con OAuth local; credenciales en el llavero del sistema operativo). La IA clasifica cada correo relevante en una señal (plataforma, empresa, aviso, estado sugerido, confianza) y la asocia a una postulación; si no sabe a cuál, va a la bandeja.
- **Get on Board:** su API pública para avisos y cambios.
- **trabajando:** su sitio usa una API JSON propia (`/api/ofertas/{id}`, `/api/searchjob`; responde 502 sin un User-Agent de navegador). No es pública ni documentada: revisar sus condiciones antes de usarla.
- **Plataformas sin API (D14):** Brecha no automatiza navegadores. La IA del usuario puede revisar el portal desde su propio navegador (por ejemplo, Claude en Chrome) y registrar lo que vea por MCP.
- Avisos con análisis (stack, requisitos, brechas, calce) y preguntas en lenguaje natural (RAG con pgvector). El proveedor es OpenAI o un modelo local (D13, ADR 0016).
- Evaluación: un set de correos reales anonimizados con su clasificación esperada, y un set de preguntas con respuesta esperada.
- **Hecho cuando:** un correo real de rechazo o de entrevista aparece como señal en la postulación correcta, y los dos sets pasan en el porcentaje que fijemos al empezar F2.

### F3: Segundo plano, eventos, validación y notificaciones
**Estado**: 🔄 En curso (24-nov-2026): app de escritorio, PostgreSQL embebido, IA compilada, notificaciones, Ajustes de credenciales y red de LinkedIn listos; faltan validación con IA y hooks (D38)
- RabbitMQ y el publicador del outbox; consumidores idempotentes.
- **Validación de movimientos:** cada cambio manual dispara una revisión contra las señales (y, si hace falta, una búsqueda de la IA en las fuentes). Si no calza, se crea una discrepancia y se avisa.
- **Notificaciones con prioridad:** alta como aviso del sistema operativo y en la consola; baja solo en la consola y en el resumen diario.
- **Hooks:** un archivo de configuración que, por tipo de evento, ejecuta un comando local o llama a una URL local.
- **Segundo plano con Electron (D19):** `apps/escritorio` arranca con el equipo, vive en la barra de menú, mantiene el modo liviano (núcleo, PostgreSQL y vigía como procesos hijos) y levanta el completo al abrir la ventana. Empaquetar PostgreSQL y Python por sistema se resuelve aquí (a verificar qué distribución de binarios usar).
- **Hecho cuando:** mover una tarjeta contra la evidencia genera un aviso de posible error; un correo de una postulación descartada llega como aviso de prioridad baja; al apagar RabbitMQ un rato no se pierde ningún evento.

### CSV, etiquetas y stack con calce (24-nov-2026, D41 a D48)
**Estado**: ✅ Implementado en la rama `f2-csv` (PR hacia `f2`); plan y decisiones en `docs/diseno/csv.md`
- Probado con los CSV reales de Tamara en una base de pruebas: 88 postulaciones y 51 contactos (10 sin LinkedIn, como advertencia), 0 errores; importar dos veces deja lo mismo y exportar e importar da el mismo archivo.

**Problemas encontrados:** csv-parse cuenta dos líneas por cada `\r\n` dentro de una celda; NestJS no registra su parser JSON global si ya hay un middleware llamado `jsonParser` (el límite de 6 MB de la ruta de importar dejó sin cuerpo a las demás).
**Soluciones aplicadas:** se corrige el número de línea en el lector; el parser de la ruta de importar va envuelto en una función con otro nombre.

### F4: Panorama en Next.js (local)
**Estado**: ⬜ Pendiente
- Ya no es un sitio público (D8). Es una vista local con Next.js (App Router, Server Components) y Tailwind: qué piden los avisos que tú juntaste (herramientas más pedidas, modalidad, sueldos publicados, tus brechas más repetidas).
- Opcional, a decidir en la sesión de stack: una página estática del proyecto en GitHub Pages, sin datos de nadie, que explique qué es y cómo instalarlo.
- **Hecho cuando:** el Panorama muestra tus datos reales y se ve bien en una ventana de escritorio.

### F5: Google Cloud con Terraform
**Estado**: ❌ Fuera del proyecto (D3, 23-nov-2026)
- Lo que sobrevive pasa a otras fases: el CI con GitHub Actions va en F1 (F1-03) y el puerto `BusDeEventos` en F3.

### F6: Servicio de ingesta en Spring Boot
**Estado**: ❌ Fuera del proyecto (D5, 23-nov-2026). Get on Board lo lee el vigía del servicio con IA (F2).

### F7: Vitrina, instalación y textos
**Estado**: ⬜ Pendiente
- Instalador de la app Electron para macOS (y Windows si F3 mostró que es viable, D17); al abrir por primera vez, conectar el correo y el proveedor de IA. Guía de privacidad: qué sale de su máquina y hacia dónde.
- README final con diagrama, decisiones, cómo correrlo, capturas con datos de ejemplo y un GIF corto.
- **Hecho cuando:** otra persona instala su Brecha siguiendo solo el README, y el repo se entiende en 2 minutos.

### FA: Arriendos (segundo foco)
**Estado**: 🔄 Implementado en la rama `arriendos` (24-nov-2026); falta que Juan lo pruebe en macOS y Windows y elija el color del foco · detalle en `docs/diseno/arriendos.md` §13

| Fase | Qué | Pruebas |
|---|---|---|
| A1 | Selector de foco, color por foco, rutas, ⌘1/⌘2 y paleta | Vitest del foco, 3 e2e con axe |
| A2 | Núcleo: propiedades, estados, canales, reglas con historial, calce, duplicados, Bandeja, REST, 19 herramientas MCP | 100 transiciones y reglas sin base, REST y MCP contra la base de pruebas |
| A3 | Consola: tablero, lista, ficha, agregar, Bandeja, Canales, Tu búsqueda | 3 e2e con axe |
| A4-A5 | Correos de arriendo, importar texto o WhatsApp, Preguntar | pytest con correos de ejemplo, chats de iPhone y Android, teléfonos enmascarados; e2e de importar |
| A6 | Mapa en los dos focos | Vitest de comunas, e2e de los dos mapas, Nominatim con respuestas grabadas |
| A7 | Notificaciones y barra de menú por foco, documentación | pruebas del escritorio |

## 8. Cómo se presenta el proyecto

Los textos para presentar el proyecto (CV, web personal, perfiles y postulaciones) se manejan fuera del repo. La regla: se menciona solo lo que ya está hecho.

## 9. Después de este plan

- F0 cerrada: se renombra la carpeta a `~/Documents/proj/brecha` (D7) y F1 parte en una sesión nueva abierta ahí, con este plan como documento de fases.
- Antes o en paralelo, la **sesión de stack** decide lo marcado «a decidir» en la sección 10. F1 no depende de ella: su stack ya está fijo.

## 10. Herramientas a implementar (para la sesión de stack)

Pedido de Juan en D5: «anótale las herramientas que deberíamos implementar». Versiones vistas en npm el 23-nov-2026; se vuelven a mirar al instalar.

**Fijas (F1 y D8).** No se reabren:
| Herramienta | Versión vista | Para qué |
|---|---|---|
| pnpm + Turborepo | pnpm 11.5 local (12.23 en npm) · turbo 2.11 | Monorepo (ADR 0002). Ojo: pnpm 11+ pide aprobar los build scripts |
| NestJS | 12.6 | Núcleo hexagonal (ADR 0003) |
| Prisma + PostgreSQL | **7.10.1** (el `latest` de npm es 8.0.0-rc.35, una versión candidata: no usarla) · PostgreSQL 17 en Docker | Persistencia del núcleo |
| REST + OpenAPI (`@nestjs/swagger` 12.1) + `openapi-typescript` 7.13 | | Contrato del núcleo y tipos para la consola (ADR 0006) |
| SDK oficial de MCP para TypeScript | a mirar al instalar | Servidor MCP del núcleo (ADR 0012) |
| argon2id + token de sesión local | | Clave local opcional (ADR 0010) |
| Angular | 22.3 | Consola: standalone, signals, `@if`/`@for`, formularios reactivos, guards, interceptors |
| Tailwind CSS | 4.3 | Estilos |
| Vitest | 5.1 | Pruebas del dominio y de la consola |
| dependency-cruiser | 18.9 | Hace cumplir que el dominio no importe NestJS ni Prisma |
| Playwright | | Una prueba de punta a punta del flujo principal |
| GitHub Actions | | CI obligatorio antes de cada merge (D6) |

**Decididas en la segunda ronda (D9 a D17):**
| Herramienta | Ofertas | Fase | Decisión |
|---|---|---|---|
| Python + FastAPI (+ uv) | 2 | F2 | Sí (D10) |
| PostgreSQL con pgvector (imagen `pgvector/pgvector:pg17`) | 4 (RAG) | F2 | Sí, en vez de MongoDB (D10) |
| MongoDB | 5 | — | No (D10) |
| Lector de correo propio + MCP | | F2 | Sí, ambos (D11) |
| Proveedor de IA: OpenAI y modelo local | | F2 | Sí (D13) |
| Automatizar navegadores desde Brecha | | — | No; lo hace la IA del usuario por fuera (D14) |
| Capa de idioma (es, en) | | F1 | Sí (D16); la librería se elige al empezar F1 |

**Todavía abiertas** (ver 6.3):
| Herramienta | Ofertas | Fase | Pregunta |
|---|---|---|---|
| Electron (app de escritorio) | | F3 y F7 | Sí (D19); en F1 se desarrolla con Docker |
| Spartan + Angular CDK | 3 (Tailwind) | F1 | Sí (D20) |
| Java 21 + Spring Boot | 3 | — | No (D5) |
| LangChain / LangGraph + Langfuse | ya los conoces | F2 | ¿Langfuse local? (se pregunta en F2) |
| RabbitMQ | 3 | F3 | Sí, solo en modo completo (D9) |
| Socket.IO + avisos del sistema operativo | 2 | F3 | Librería de avisos (se pregunta en F3) |
| Next.js 16 (React) | 10 | F4 | Panorama: app aparte o sección (se pregunta en F4) |
| Testcontainers (Node) | 1 a 2 | F1 o F3 | ¿En vez del Postgres del compose para las pruebas de integración? |

## 11. Modelo de dominio

Tres contextos (bounded contexts):
- **Seguimiento** (núcleo, PostgreSQL): la Postulación, su estado, sus señales y sus discrepancias. Se modela con DDD en F1.
- **Mercado** (servicio con IA, esquema `ia` de PostgreSQL con pgvector, F2): el Aviso tal como lo publicó el portal y su análisis (stack, requisitos, brechas, calce).
- **Fuentes** (servicio con IA, F2): correos y estados leídos de las plataformas, convertidos en señales.

Seguimiento no lee las bases de los otros. Guarda una **foto** del aviso (`AvisoResumen`) y recibe las señales como eventos (`senal.detectada`). Así el núcleo funciona solo en F1, y las señales se pueden registrar a mano o por MCP antes de que exista el servicio con IA.

### 11.1 Agregado `Postulacion`

Raíz del agregado. Todo cambio pasa por sus métodos; nadie modifica sus partes desde afuera.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `PostulacionId` (UUID v7) | Lo genera el puerto `GeneradorId` |
| `aviso` | `AvisoResumen` | Foto del aviso |
| `estado` | `EstadoPostulacion` | Sección 11.2 |
| `canal` | `Canal?` | Cómo se postuló; obligatorio desde `postulado` |
| `fechaPostulacion` | `Date?` | Obligatoria desde `postulado` |
| `sueldoPretendido` | `Dinero?` | Lo que pediste |
| `contactos` | `Contacto[]` | Reclutadores y otros |
| `entrevistas` | `Entrevista[]` | Entidades dentro del agregado |
| `notas` | `Nota[]` | Solo se agregan |
| `historial` | `CambioDeEstado[]` | Cada transición con fecha, motivo y **origen** |
| `senales` | `Senal[]` | Evidencia que llegó de las fuentes |
| `discrepancias` | `Discrepancia[]` | Movimientos que no calzan con la evidencia |
| `version` | `number` | Bloqueo optimista |

La prioridad no se guarda: la calcula `PoliticaDePrioridad` a partir del estado (11.3, R12).

Una instancia tiene un solo dueño (D8), así que no hay `usuarioId`. Si algún día hubiera varios, se agrega sin tocar las reglas.

### 11.2 Estados y transiciones

Los 8 estados son los que ya usas en el artifact (`ESTADOS`), con las mismas claves, para importar sin traducir. Se agrega `aceptada`.

| Desde | Puede ir a |
|---|---|
| `sin_decidir` | `por_postular`, `postulado`, `descartado` |
| `por_postular` | `postulado`, `sin_decidir`, `descartado` |
| `postulado` | `en_proceso`, `entrevista`, `rechazado`, `descartado` |
| `en_proceso` | `entrevista`, `rechazado`, `descartado` |
| `entrevista` | `oferta`, `rechazado`, `descartado` |
| `oferta` | `aceptada`, `rechazado` (la empresa la retira), `descartado` (la rechazas tú) |
| `descartado` | `sin_decidir` (reabrir) |
| `rechazado`, `aceptada` | ninguno (terminales) |

`descartado` lo decides tú; `rechazado` lo decide la empresa.

**Origen de cada cambio** (`CambioDeEstado.origen`): `tablero` (arrastrar), `formulario`, `ia` (por MCP), `senal` (aplicado desde una señal), `importacion`. La validación de F3 revisa los de origen `tablero`, `formulario` e `ia`.

### 11.3 Reglas (invariantes y políticas)

| Id | Regla | Error o efecto |
|---|---|---|
| R1 | Una transición fuera de la tabla 11.2 se rechaza | `TRANSICION_INVALIDA` |
| R2 | Para pasar a `postulado` hacen falta `fechaPostulacion` y `canal`; la fecha no puede ser futura | `VALIDACION` |
| R3 | No se puede pasar a `postulado` si el aviso ya cerró | `AVISO_CERRADO` |
| R4 | Una sola postulación no terminal por aviso (misma `aviso.url`) | `YA_EXISTE` |
| R5 | `rechazado` y `descartado` exigen motivo | `VALIDACION` |
| R6 | Reabrir (`descartado → sin_decidir`) solo si el aviso no está cerrado | `AVISO_CERRADO` |
| R7 | Agendar una entrevista solo desde `postulado`, `en_proceso` o `entrevista`; si no está en `entrevista`, la mueve ahí | `TRANSICION_INVALIDA` |
| R8 | En un estado terminal no se agregan entrevistas ni contactos; sí notas y señales | `ESTADO_TERMINAL` |
| R9 | Las notas no se editan ni se borran | (no hay operación) |
| R10 | Dos cambios simultáneos sobre la misma postulación: el segundo falla | `CONFLICTO` |
| R11 | **Una señal nunca cambia el estado por sí sola**, salvo que la persona active «aplicar señales seguras» y la señal tenga confianza alta y una transición válida. Si no, queda como sugerencia con un botón para aplicarla | evento `postulacion.senal_registrada` |
| R12 | **Prioridad:** alta en `postulado`, `en_proceso`, `entrevista` y `oferta`; media en `sin_decidir` y `por_postular` (alta si el aviso cierra en 2 días o menos); **baja en `descartado`, `rechazado` y `aceptada`**. Una señal de una postulación descartada se registra y se avisa, pero con prioridad baja | `PoliticaDePrioridad` |
| R13 | **Un movimiento manual válido siempre se guarda.** Si contradice la señal más reciente (por ejemplo, la mueves a `entrevista` y el último correo es un rechazo), se abre una discrepancia; no se bloquea | evento `postulacion.discrepancia_detectada` |
| R14 | Una discrepancia se cierra cuando la persona confirma su movimiento o lo corrige; no se borra | evento `postulacion.discrepancia_resuelta` |

Las reglas con fechas usan el puerto `Reloj`, nunca `new Date()` en el dominio. R13 tiene una parte determinista (comparar con las señales ya registradas, en el dominio, desde F1) y una parte con IA (buscar evidencia nueva en las fuentes, en F3).

### 11.4 Objetos de valor y entidades

| Objeto | Contenido | Validación |
|---|---|---|
| `AvisoResumen` | `titulo`, `empresa`, `url`, `plataforma`, `modalidad`, `ubicacion`, `cierre?`, `avisoId?` (en Mercado, desde F2), `calce?` (desde F3) | `url` válida; `titulo` y `empresa` no vacíos |
| `EstadoPostulacion` | una de las 9 claves | `puedeIrA(otro)`, `esTerminal()` |
| `Plataforma` | `linkedin`, `trabajando`, `getonboard`, `computrabajo`, `chiletrabajos`, `indeed`, `sitio_empresa`, `otra` | |
| `Canal` | `tipo` (`portal`, `email`, `formulario`, `referido`) y `valor` | `email` válido si el tipo es `email` |
| `Dinero` | `monto`, `moneda` (`CLP`, `USD`), `periodo`, `base` (`bruto`, `liquido`) | `monto > 0` |
| `Contacto` | `nombre`, `rol?`, `email?`, `linkedin?` | Al menos uno entre email y linkedin |
| `Nota` | `texto`, `creadaEn` | 1 a 5.000 caracteres |
| `CambioDeEstado` | `de`, `a`, `motivo?`, `origen`, `ocurridoEn` | |
| `Prioridad` | `alta`, `media`, `baja` | |
| Entidad `Entrevista` | `id`, `fecha`, `tipo` (`rrhh`, `tecnica`, `caso`, `final`), `con?`, `resultado?` | |
| Entidad `Senal` | `id`, `fuente` (`correo`, `plataforma`, `manual`, `ia`), `plataforma`, `resumen`, `estadoSugerido?`, `confianza` (0 a 1), `recibidaEn`, `referenciaExterna` (id del correo o del portal, para no duplicar), `aplicada` | `confianza` entre 0 y 1; no se repite `referenciaExterna` |
| Entidad `Discrepancia` | `id`, `cambio` (el `CambioDeEstado` revisado), `senal`, `detalle`, `estado` (`abierta`, `confirmada`, `corregida`), `detectadaEn` | |

### 11.5 Eventos de dominio

El agregado los acumula; el caso de uso los guarda en el outbox en la misma transacción (ADR 0005). Todos llevan la `prioridad` calculada en ese momento.

| Evento | Cuándo | Datos |
|---|---|---|
| `postulacion.creada` | Al crear | `postulacionId`, `aviso`, `estado` |
| `postulacion.estado_cambiado` | Cada transición | `postulacionId`, `de`, `a`, `motivo?`, `origen` |
| `postulacion.entrevista_agendada` | R7 | `postulacionId`, `entrevistaId`, `fecha`, `tipo` |
| `postulacion.senal_registrada` | R11 | `postulacionId`, `senalId`, `resumen`, `estadoSugerido?`, `aplicada` |
| `postulacion.discrepancia_detectada` | R13 | `postulacionId`, `discrepanciaId`, `detalle` |
| `postulacion.discrepancia_resuelta` | R14 | `postulacionId`, `discrepanciaId`, `decision` |
| `postulacion.cierre_proximo` | Tarea diaria (F3) | `postulacionId`, `cierre` |

### 11.6 Dueño de la instancia

Una instancia, una persona (D8). No hay registro ni cuentas. La clave local es opcional (ADR 0010).

## 12. Contratos

### 12.1 API REST del núcleo (F1)

Base `/api/v1`. JSON. El núcleo escucha **solo en `127.0.0.1`** (ADR 0010). Si hay clave local configurada, todo salvo `/acceso/*` exige `Authorization: Bearer <token de sesión>`; el servidor MCP y los hooks usan un token propio que se genera al instalar. OpenAPI en `/docs`; el `openapi.json` se guarda en `packages/contratos` y el CI falla si no coincide con el código.

| Método y ruta | Qué hace | Errores |
|---|---|---|
| `GET /acceso/estado` | `{claveConfigurada, desbloqueado}` | |
| `POST /acceso/desbloquear` | `{clave}` → `{token, expiraEn}` | `CLAVE_INVALIDA` |
| `GET /postulaciones?estado=&q=&plataforma=&prioridad=&limit=&offset=` | Lista paginada `{items, total}`, orden por `actualizadaEn` desc y `id` | `VALIDACION` |
| `GET /postulaciones/tablero` | Tarjetas por estado, con prioridad, señales nuevas y discrepancias abiertas | |
| `POST /postulaciones` | Crea desde `{aviso, estado?, sueldoPretendido?}` | `VALIDACION`, `YA_EXISTE` |
| `GET /postulaciones/:id` | Detalle con historial, señales, discrepancias y `transicionesPosibles` | `NO_ENCONTRADO` |
| `PATCH /postulaciones/:id` | Edita `canal`, `sueldoPretendido`, `aviso.cierre` (con `version`) | `VALIDACION`, `CONFLICTO` |
| `POST /postulaciones/:id/transiciones` | `{a, motivo?, fechaPostulacion?, canal?, origen, version}` | `TRANSICION_INVALIDA`, `AVISO_CERRADO`, `VALIDACION`, `CONFLICTO` |
| `POST /postulaciones/:id/notas` · `/contactos` · `/entrevistas` | Agregar partes | `VALIDACION`, `ESTADO_TERMINAL` |
| `POST /postulaciones/:id/senales` | Registrar una señal a mano (F1) | `VALIDACION`, `YA_EXISTE` |
| `POST /postulaciones/:id/senales/:sid/aplicar` | Aplicar el estado sugerido | `TRANSICION_INVALIDA` |
| `POST /postulaciones/:id/discrepancias/:did/resolver` | `{decision: confirmar | corregir, a?}` | `NO_ENCONTRADO`, `TRANSICION_INVALIDA` |

**Forma del error:** `{ "codigo": "TRANSICION_INVALIDA", "mensaje": "…", "campo": "a" }`.
| Código | HTTP |
|---|---|
| `VALIDACION` | 400 |
| `NO_AUTENTICADO`, `CLAVE_INVALIDA` | 401 |
| `NO_ENCONTRADO` | 404 |
| `YA_EXISTE`, `CONFLICTO` | 409 |
| `TRANSICION_INVALIDA`, `AVISO_CERRADO`, `ESTADO_TERMINAL` | 422 |
| `ERROR_INTERNO` (sin stack hacia afuera) | 500 |

Nada silencioso: un filtro desconocido es `VALIDACION`, nunca una lista vacía.

### 12.2 Servidor MCP del núcleo (F1, ADR 0012)

Transporte **Streamable HTTP en `/mcp` dentro del núcleo** (ADR 0018, reemplaza al stdio original), con el token `mcp`; se conecta a Claude Code o Claude Desktop con una línea de configuración (README). Cada herramienta llama al mismo caso de uso que la ruta REST equivalente; los errores devuelven el mismo `codigo`.

| Herramienta | Equivale a |
|---|---|
| `listar_postulaciones` (filtros) | `GET /postulaciones` |
| `ver_postulacion` | `GET /postulaciones/:id` |
| `crear_postulacion` | `POST /postulaciones` |
| `cambiar_estado` (origen `ia`) | `POST …/transiciones` |
| `agregar_nota` | `POST …/notas` |
| `registrar_senal` | `POST …/senales` |
| `listar_discrepancias` · `resolver_discrepancia` | discrepancias |
| `editar_postulacion` | `PATCH /postulaciones/:id` |
| `agregar_contacto` · `agendar_entrevista` | `POST …/contactos` · `POST …/entrevistas` |
| `resumen` | Qué cambió desde una fecha, ordenado por prioridad |
| `exportar` | Todo el estado en JSON (postulaciones, señales, discrepancias, conteos por estado y prioridad), para que la IA arme o actualice un artifact (D12) |

Recursos MCP: `brecha://postulaciones/{id}` y `brecha://resumen`. Con `exportar` y estas herramientas, Claude puede crear su propio artifact (un tablero, un informe) y actualizarlo cuando cambie algo (D12). Lo que se pone en un artifact queda en la cuenta de Anthropic de la persona: lo decide ella, Brecha no lo hace solo. Así la IA del usuario puede, por ejemplo, leer su correo con su propio MCP de correo y registrar señales en Brecha, desde F1 y sin esperar al servicio con IA.

### 12.3 API del servicio con IA (F2, borrador)

| Método y ruta | Qué hace |
|---|---|
| `POST /fuentes/correo/sincronizar` | Lee correos nuevos y publica `senal.detectada` |
| `GET /fuentes` · `PUT /fuentes/:tipo` | Fuentes configuradas (las credenciales van al llavero, no a la base) |
| `POST /avisos` · `GET /avisos` · `GET /avisos/:id` | Avisos con su análisis |
| `POST /preguntas` | `{pregunta}` → `{respuesta, avisosCitados[]}` (RAG) |
| `POST /validaciones` | Busca evidencia para un cambio manual (F3) |
| `GET /panorama` | Agregados para la vista Panorama (F4) |

### 12.4 Eventos (F3) y hooks

Sobre común: `id` (UUID v7), `tipo`, `version`, `ocurridoEn`, `origen`, `correlacionId`, `prioridad`, `datos`. RabbitMQ con un exchange `brecha.eventos` de tipo `topic`; la routing key es el `tipo`; cada consumidor tiene su cola durable y una cola de mensajes muertos. Esquemas en `packages/contratos/eventos/*.schema.json` (los leen TypeScript y Python). Consumidores idempotentes por `id`.

| Evento | Publica | Consume |
|---|---|---|
| `postulacion.*` | Núcleo (outbox) | Notificaciones, hooks; `estado_cambiado` también IA (validación) |
| `senal.detectada` | IA (fuentes) | Núcleo (asocia y registra), o la bandeja si no sabe a qué postulación va |
| `validacion.resultado` | IA | Núcleo (abre o no una discrepancia) |
| `aviso.recibido` | IA (pegado a mano o vigía desde Get on Board) | IA |
| `aviso.analizado` | IA | Núcleo (`AvisoResumen.calce`), Notificaciones |

**Hooks (F3):** `brecha.hooks.yaml` en la carpeta de la instancia. Por cada `tipo` de evento (y prioridad mínima) se ejecuta un comando local o se llama a una URL local con el evento en JSON. Ejemplo: al llegar `postulacion.entrevista_agendada`, crear el evento en el calendario.

## 13. Estructura del monorepo

```
brecha/
├── apps/
│   ├── escritorio/           Electron: barra de menú, supervisor de los modos, ventana con la consola (F3)
│   ├── consola/              Angular + Tailwind (F1)
│   └── panorama/             Next.js + Tailwind, vista local (F4)
├── services/
│   ├── nucleo/               NestJS hexagonal + Prisma + servidor MCP (F1)
│   ├── ia/                   FastAPI + PostgreSQL/pgvector: vigía (liviano) y API (completa); fuentes, señales, avisos, RAG (F2; Python con uv, con un package.json que solo expone scripts a turbo)
│   └── notificaciones/       NestJS + Socket.IO (F3)
├── packages/
│   ├── contratos/            openapi.json, tipos generados, esquemas de eventos
│   └── config/               tsconfig base, ESLint, Prettier
├── datos/
│   ├── ejemplo/              fixtures inventados y anonimizados (sí van al repo)
│   └── privado/              export del artifact y datos reales (en .gitignore, ADR 0008)
├── docs/                     PLAN.md, adr/
├── .github/workflows/ci.yml
├── docker-compose.yml        name: brecha; puertos solo en 127.0.0.1; perfiles liviano y completo; en F1 solo postgres
├── turbo.json · pnpm-workspace.yaml · package.json · .env.example
└── README.md
```

**Dentro del núcleo:**
```
services/nucleo/src/
├── compartido/
│   ├── dominio/              AggregateRoot, EventoDeDominio, ErrorDeDominio, puertos Reloj y GeneradorId
│   └── infraestructura/      PrismaService, filtro de errores, ConfigModule
├── postulaciones/
│   ├── dominio/              postulacion.ts, estado.ts, senal.ts, discrepancia.ts, politica-de-prioridad.ts,
│   │                         objetos-valor/, eventos/, errores.ts, postulacion.repositorio.ts (puerto)
│   ├── aplicacion/           crear-postulacion, cambiar-estado, registrar-senal, aplicar-senal,
│   │                         resolver-discrepancia, agregar-nota, agendar-entrevista, consultas
│   └── infraestructura/
│       ├── http/             controladores, DTO, mapeo de errores        ← adaptador de entrada 1
│       ├── mcp/              servidor MCP por HTTP en /mcp, herramientas ← adaptador de entrada 2
│       ├── prisma/           repositorio Prisma, mappers                 ← adaptador de salida
│       └── outbox/           escritura en la tabla outbox (el publicador llega en F3)
├── acceso/                   clave local, token de sesión, token de MCP, guard global
└── main.ts                   API REST, flujo SSE y MCP en 127.0.0.1
services/nucleo/prisma/schema.prisma
services/nucleo/.dependency-cruiser.cjs     dominio/ y aplicacion/ no importan @nestjs/*, @prisma/*, el SDK de MCP ni infraestructura/
```

Los casos de uso son clases simples que reciben sus puertos por constructor; un módulo de Nest los conecta con `useFactory` para REST, y `mcp.ts` los conecta igual para MCP.

**Tablas (Prisma):** `postulacion` (con `aviso_*` como columnas y `version`), `cambio_estado`, `entrevista`, `contacto`, `nota`, `senal` (única por `referencia_externa`), `discrepancia`, `acceso` (hash de la clave local, si existe), `outbox` (`id`, `tipo`, `datos jsonb`, `ocurrido_en`, `publicado_en null`). Migraciones con `prisma migrate diff --script`; `prisma generate` explícito en el CI.

## 14. Pantallas

### 14.1 Consola Angular (local)

| Pantalla | Fase | Qué muestra y hace |
|---|---|---|
| Desbloquear | F1 | Solo si hay clave local: un campo y un botón. Sin clave, la consola abre directo |
| Tablero | F1 | Kanban con una columna por estado (los terminales colapsados). Tarjeta: empresa, título, plataforma, días al cierre, punto de prioridad, ícono si hay señal nueva y aviso si hay discrepancia abierta. Arrastrar pide la transición; si la API la rechaza, la tarjeta vuelve con el mensaje del código. |
| Lista | F1 | Filtros por estado, plataforma, prioridad y texto; paginación |
| Ficha | F1 | Aviso con enlace; estado y botones solo para `transicionesPosibles`; línea de tiempo que mezcla cambios (con su origen) y señales; discrepancias con «confirmar» o «corregir»; canal, sueldo pretendido, contactos, entrevistas y notas |
| Nueva postulación | F1 | Formulario reactivo con validación en vivo |
| Diálogos de transición | F1 | Piden lo que exige la regla: motivo (R5), fecha y canal (R2) |
| Bandeja de señales | F2 | Señales que la IA no pudo asociar: elegir la postulación o crear una nueva |
| Conexiones | F2 | Correo, proveedor de IA, plataformas: qué está conectado y qué sale de la máquina hacia dónde |
| Avisos y análisis | F2 | Avisos con calce, brechas y botón «seguir» |
| Preguntar | F2 | Chat con respuestas que citan los avisos |
| Notificaciones | F3 | Campana en vivo, separada en prioridad alta y el resto |
| Ajustes | F3 | «Aplicar señales seguras» (R11), cada cuánto revisar las fuentes, hooks, resumen diario |

Angular vigente: componentes standalone, signals, `@if`/`@for`, formularios reactivos tipados, `HttpClient` con un interceptor que pone el token (si hay) y otro que traduce el error por `codigo`, guard de ruta (solo si hay clave), lazy loading por pantalla, capa de idioma español e inglés (D16). Diseño para ventana de escritorio, sin versión de celular (D15). Componentes de Spartan (D20) con estilos de Tailwind editables en el repo; drag and drop con Angular CDK. Lo estético lo eliges tú entre las opciones del Design System de F1-00 (D21).

### 14.2 Panorama en Next.js (F4, local)

| Página | Qué muestra |
|---|---|
| Inicio | Las herramientas más pedidas en tus avisos, con fecha de corte y cuántos avisos |
| Tus brechas | Las herramientas que más te faltan, ponderadas por cuántas ofertas las piden |
| Modalidad | Remoto, híbrido y presencial |
| Sueldos | Rangos publicados por seniority |
| Herramienta (`/herramienta/[slug]`) | Cuántos avisos la piden y con qué otras herramientas aparece |

Corre en la misma máquina que el resto; no se publica con datos.

## 15. Tareas de F1

**Orden y paralelo.** F1-01 a F1-04 van primero y en serie (esqueleto). Después se abren dos sesiones: **núcleo** (F1-05 a F1-11) y **diseño y consola** (F1-00, luego F1-12 a F1-15). La consola parte cuando exista el contrato (F1-10a: controladores y DTO con OpenAPI generado, aunque los casos de uso no estén). Así no programa contra mocks inventados. Cada tarea termina en un commit; F1 termina en una PR a `main` que mergeas tú.

| Id | Tarea | Hecho cuando |
|---|---|---|
| F1-00 | **Casi hecha (D22):** falta exportar los tokens de `docs/diseno/ui.md` §7 al tema de Tailwind y Spartan. Plan original: dirección visual (D21): moodboard de referencias con `reference-board`, artifact Design System con 2 o 3 opciones de paleta, tipografía y modo claro u oscuro, maquetas de Tablero, Ficha y Desbloquear en un artifact Design, y tokens exportados al tema de Tailwind y Spartan | Juan eligió una opción y aprobó las maquetas; los tokens están en `apps/consola` |
| F1-01 | Monorepo: `pnpm-workspace.yaml`, `turbo.json`, `packages/config`, `.gitignore` (incluye `datos/privado/` y `.env`), `.env.example`, `.nvmrc`. Versiones miradas con `npm view` al instalar; Prisma fijo en 7.x | `pnpm install` y `pnpm turbo run build lint` pasan con el repo vacío |
| F1-02 | `docker-compose.yml` con `name: brecha`, PostgreSQL 17 con healthcheck y el puerto publicado solo en `127.0.0.1` | `docker compose up -d` deja el servicio `healthy` y no responde desde otra IP de la red |
| F1-03 | CI en GitHub Actions: instalar con caché, `prisma generate`, lint, tipos, pruebas (Postgres como servicio del job), build y chequeo del contrato | Una PR de prueba muestra el check en verde |
| F1-04 | Crear el repo público `JustHipo/brecha` y subir `main` con el esqueleto. **Te confirmo antes de crearlo** (es público) | `git push` funciona y el CI corre en GitHub |
| F1-05 | Proyecto NestJS en `services/nucleo` con la estructura de la sección 13 y la regla de dependency-cruiser en el CI | El CI falla con un import de prueba de `@nestjs/common` dentro de `dominio/` (se prueba y se quita) |
| F1-06 | Dominio: objetos de valor, `EstadoPostulacion` con la tabla 11.2, `Senal`, `Discrepancia`, `PoliticaDePrioridad` y el agregado con R1 a R14 (la parte determinista de R13) y los eventos 11.5. Pruebas Vitest sin base | Cada par de estados probado (81 casos); cada regla con un caso que pasa y uno que falla; una señal de rechazo después de mover a `entrevista` abre una discrepancia; una señal en una descartada da prioridad baja; cobertura de `dominio/` ≥ 90 % |
| F1-07 | Prisma: schema, primera migración con `migrate diff --script`, repositorio con mappers, bloqueo optimista (R10) y outbox en la misma transacción | Prueba de integración contra el Postgres del compose: guardar y leer da el mismo agregado (con señales y discrepancias); el evento queda en `outbox`; el segundo guardado con la misma versión da `CONFLICTO` |
| F1-08 | Casos de uso con puertos `Reloj` y `GeneradorId`; pruebas con repositorio en memoria | Pruebas verdes, incluidas R3 y R4 con un reloj fijo y una señal repetida que no se duplica |
| F1-09 | Acceso local: el núcleo escucha solo en `127.0.0.1`; clave local opcional con argon2id y token de sesión; token de MCP generado al instalar; guard global. Configuración cargada antes de usarla | Sin clave configurada, la API responde en local; con clave, sin token da 401 `NO_AUTENTICADO`; una clave mala da `CLAVE_INVALIDA` |
| F1-10a | Contrato: controladores y DTO de la sección 12.1 con `@nestjs/swagger`; `openapi.json` exportado a `packages/contratos` con tipos generados por `openapi-typescript` | `/docs` muestra todas las rutas; el CI falla si `openapi.json` cambia sin commitearse |
| F1-10b | Conectar controladores con casos de uso y el filtro de errores con la tabla de códigos | Una prueba por ruta con un caso de éxito y uno de error esperado |
| F1-10c | Servidor MCP (HTTP en `/mcp`, ADR 0018) con las herramientas de 12.2 sobre los mismos casos de uso, y la línea de configuración para Claude Code en el README | Desde Claude Code: listar, mover una postulación (queda con origen `ia`) y registrar una señal; un salto inválido devuelve `TRANSICION_INVALIDA` |
| F1-11 | Importador: lee el export del artifact desde `datos/privado/` (46 fichas con `estado_inicial`) y crea las postulaciones con su estado (origen `importacion`). Idempotente por `aviso.url`. Para el repo, `datos/ejemplo/` con 5 fichas inventadas | Importar dos veces deja 46 postulaciones, no 92; el estado de cada una coincide con el del artifact |
| F1-12 | Consola: `ng new` en `apps/consola` con standalone, Tailwind 4 y Spartan (confirmar compatibilidad con Angular 22), integrada a turbo; cliente tipado desde `packages/contratos`; interceptores de token y de errores; guard de ruta condicionado a la clave; capa de idioma (es, en) con la librería que elijas al empezar F1 | `pnpm dev` levanta núcleo y consola; con clave configurada, `/tablero` manda a `/desbloquear` |
| F1-13 | Pantallas Desbloquear, Tablero (CDK drag and drop, prioridad, señales, discrepancias) y Lista | Mover una tarjeta de `sin_decidir` a `entrevista` vuelve atrás con el mensaje de `TRANSICION_INVALIDA`; una tarjeta con discrepancia muestra el aviso; se ve bien en una ventana de 1280 px de ancho |
| F1-14 | Ficha (línea de tiempo con cambios y señales, discrepancias con confirmar o corregir), Nueva postulación y diálogos de transición | Flujo completo a mano: crear, postular (pide fecha y canal), registrar una señal de rechazo, ver la discrepancia y corregirla, descartar con motivo |
| F1-15 | Pruebas de la consola: unitarias de servicios y del manejo de errores, y una Playwright del flujo de F1-14 en el CI | CI verde con las tres capas (dominio, API, consola) |
| F1-16 | README de F1 (qué es, diagrama, cómo correrlo, cómo conectar el MCP), PLAN.md actualizado, checkpoint contigo y, si apruebas, PR a `main` | Mergeas tú |

**Hecho de F1:** usas la consola con tus 46 postulaciones reales, Claude Code las opera por MCP, el CI está en verde y mergeaste la PR.
