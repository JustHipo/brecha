# Plan: cambio de foco y Arriendos

Escrito el 24-nov-2026. **Versión 2 (24-nov-2026, 11:30):** Juan respondió las 11 preguntas del artifact «Plan de Arriendos en Brecha» (sección 2). Cambia el alcance: mapa en los dos focos, canales y portales que se agregan solos, reglas de búsqueda que Claude guarda y respeta, importar desde WhatsApp, todo junto y en paralelo con F3. **Estado: implementado (24-nov-2026, rama `arriendos`).** Juan aprobó la versión 2 y pidió hacerlo de corrido; lo hecho, lo que cambió respecto del plan y lo que falta verificar está en la sección 13. Decisiones referenciadas desde `docs/PLAN.md` §6.4 y el ADR 0020.

## 1. La tarea en simple

- **Qué pidió Juan:** que donde la barra lateral dice «Brecha» haya un selector para cambiar a otra app que funcione parecido, pero para encontrar arriendo.
- **Qué hace el foco Arriendos:** sigues cada propiedad en un tablero por estado; guardas por dónde y con quién hablas (portal, WhatsApp, correo, teléfono); Brecha mide la **brecha** entre lo que buscas y lo que ofrece cada propiedad contra tus reglas de búsqueda; tu IA lo opera por MCP y respeta esas reglas; y un mapa muestra dónde está cada cosa.
- **Cómo:** un **segundo contexto** dentro de la misma instancia. Comparten base, barra de menú, vigía del correo, credenciales, MCP y hooks. Cada foco tiene su dominio, sus tablas, sus pantallas y sus herramientas. El selector solo cambia qué estás mirando; los dos corren siempre.

## 2. Lo que respondió Juan y qué cambia

| # | Respuesta | Qué cambia en el plan |
|---|---|---|
| P1 | La app sigue siendo **Brecha**; el selector muestra **Empleo** y **Arriendos** | Textos del selector y de la barra de menú |
| P2 | **Un color por foco** | En A1 se proponen 2 o 3 colores para Arriendos; Juan elige al probar (G-CRITERIO). Mientras, uno provisorio |
| P3 | Todos los portales, más WhatsApp, correo, etc. **Agregar portales nuevos a mano o por MCP**, con los mismos atributos, para saber dónde y con quién hablas; los contactos con teléfono, correo, enlace de postulación o LinkedIn | Nuevo: **catálogo de canales** editable (sección 5.3) y contactos con todos esos datos |
| P4 | Solo arriendo. **Reglas duras y blandas en Ajustes, también por MCP.** Claude las guarda, las sigue en la próxima búsqueda, evita duplicados y, si le pides algo distinto, pregunta antes de cambiar una regla (casa pasa a P1 y departamento a P2) | Nuevo: **perfil de búsqueda con reglas, prioridad e historial** (5.4), herramientas MCP para leerlo y cambiarlo, deduplicación (5.5) e instrucciones del servidor MCP con ese protocolo |
| P5 | Correo, WhatsApp, teléfono y chat del portal | WhatsApp y teléfono entran por importación y por MCP (sección 7); el vigía solo ve el correo |
| P6 | Los estados **sirven así** | Sin cambios (5.1) |
| P7 | **Todos duros**: presupuesto, comuna, dormitorios, mascota, estacionamiento, renta exigida, aval, amoblado, **y gastos comunes** | Valores iniciales del perfil. Cada regla se puede pasar a blanda después |
| P8 | Sin correos reales por ahora. **Importar avisos viejos** de WhatsApp, correo o lo que sea, y darle a Claude los datos del lugar donde postulaste para que los agregue por MCP | Nuevo: importar texto pegado y chats exportados de WhatsApp (7). Las pruebas del clasificador usan correos de ejemplo escritos a mano; el set real se arma después |
| P9 | **Todo junto**, en una rama nueva, con pruebas por fase, sin detenerse a preguntar, de inicio a fin; avisar al terminar para probar en Windows y en Mac; sin tocar nada más | Fases A1 a A7 seguidas (sección 9). Rama base con Windows (11) |
| P10 | **En paralelo** con F3 y F7 | Reemplaza A-D10 de la versión 1 (esperar a mergear #5 y #6). Riesgo de conflictos (10) |
| P11 | **Mapa en arriendos y en empleo**, con MapLibre u otra librería libre. Empleo con ubicación general («Las Condes, Santiago»): pin acumulado en el centro de la comuna. Arriendo: dirección exacta y pin en su lugar | Nuevo: pestaña Mapa en los dos focos (sección 6) |

## 3. Fuentes leídas

| Fuente | Para qué |
|---|---|
| `docs/PLAN.md` §1 a §7 (D1 a D40), `README.md` | Forma del producto, decisiones vigentes, fases |
| `services/nucleo/prisma/schema.prisma`, `postulaciones/dominio/estado.ts`, carpetas del núcleo, nombres de herramientas MCP | Qué es de cada contexto y cómo se registran las herramientas |
| `services/ia/src/ia/`: `filtro.py`, `clasificacion.py`, `calce.py`, `postgres/tablas.py` | Pipeline del correo, clasificación, calce y esquema `ia` |
| `apps/consola/.../marco/marco.ts`, `app.routes.ts`, carpeta `avisos/` (tiene `pegar.ts`) | Dónde está «Brecha», navegación, rutas, pegar avisos |
| `apps/escritorio/src/notificaciones.ts`, `main.ts` | Rutas que abren las notificaciones y la barra de menú |
| Ramas: `f2` (#5), `windows` (#6), `brecha-junta` (local: windows + tutorial + CSV sobre f2), `claude/pasos-pendientes-…` y su `docs/diseno/pasos.md` v2 | Desde dónde partir y qué archivos tocan otras sesiones |
| Respuestas de Juan en el artifact (24-nov, 11:16) | Sección 2 |

**No leído:** los casos de uso del núcleo por dentro, Bandeja y Preguntar por dentro, `backend.md`, `f2.md`, `ui.md` y los ADR uno por uno; se leen al empezar cada fase. **No verificado:** API y condiciones de los portales inmobiliarios, condiciones de uso de OpenFreeMap y Nominatim, y la fuente de los centros de las comunas (se verifican en A1 y A6 con la página oficial y la fecha).

## 4. Decisiones

| # | Decisión | Autor | Por qué |
|---|---|---|---|
| A-D1 | Selector de foco donde dice «Brecha»; la app sigue siendo Brecha con focos **Empleo** y **Arriendos** | Juan | Pedido y P1 |
| A-D2 | Misma instancia, segundo contexto `arriendos`; no app aparte ni motor genérico | Claude, validado por Juan (no lo objetó) | Una app aparte duplica base, supervisor, vigía, credenciales y MCP; un motor genérico fuerza a abstraer dos dominios distintos |
| A-D3 | El foco sale de la URL: empleo sin prefijo, arriendos en `/arriendos/...`; se recuerda el último foco | Claude | No rompe notificaciones ni pruebas; un enlace directo abre el foco correcto |
| A-D4 | Tablas propias por contexto; compartidas solo `outbox`, `ajuste` y `acceso` | Claude | Las señales y contactos de un arriendo traen otros datos |
| A-D5 | Un solo servidor MCP con herramientas nuevas; las de arriendos se registran desde su propio archivo | Claude | Un token y una conexión; un archivo propio reduce choques con otras ramas |
| A-D6 | El vigía lee el correo una vez y el filtro sin IA decide el foco | Claude | Una consulta IMAP por vuelta (D29) |
| A-D7 | El **calce de arriendos se calcula en el núcleo**, por código, contra las reglas del perfil | Claude | Los datos de una propiedad ya vienen estructurados (precio, m², comuna): no hace falta IA para el calce, solo para extraer datos de un texto. Así el calce se actualiza al instante cuando cambias una regla |
| A-D8 | Brecha no automatiza portales ni WhatsApp: correo, importación y tu IA por MCP | Juan (D14) | Condiciones de uso; WhatsApp personal no tiene API |
| A-D9 | Sin cuentas en servicios de nube | Juan (P-BRECHA-SIN-NUBE) | El mapa usa servicios públicos sin cuenta y sin llave (6) |
| A-D10 | **En paralelo** con F3 y F7, sin esperar merges | Juan (P10) | Reemplaza la A-D10 de la versión 1 |
| A-D11 | Contactos y conversaciones del arriendo viven en la propiedad; la red de LinkedIn queda solo en empleo | Claude | Cada corredor o dueño es de una propiedad |
| A-D12 | Catálogo de **canales** editable (portales, WhatsApp, correo, teléfono, corredoras, otros), a mano y por MCP | Juan (P3) | Saber dónde y con quién hablas, con portales nuevos sin tocar código |
| A-D13 | **Perfil de búsqueda con reglas duras y blandas, blandas con prioridad (P1, P2…) e historial de cambios**; editable en Ajustes y por MCP | Juan (P4); forma de los datos: Claude | Claude lo lee antes de buscar y pregunta antes de cambiarlo |
| A-D14 | Todas las reglas de P7 empiezan duras, más gastos comunes | Juan (P7) | |
| A-D15 | Una propiedad puede tener **varias publicaciones** (la misma en Portal Inmobiliario y en Yapo); duplicado seguro por URL, candidato por dirección y dormitorios | Claude | P4 pide evitar duplicados; la misma propiedad suele estar en varios portales |
| A-D16 | Importar desde texto pegado y desde un chat exportado de WhatsApp (.txt); la IA extrae, tú revisas antes de guardar | Juan (P8); formato: Claude | Avisos viejos sin correo |
| A-D17 | Mapa con **MapLibre GL JS**; mapa base de **OpenFreeMap** (sin cuenta ni llave); direcciones con **Nominatim** (OpenStreetMap), una por segundo y guardadas; centros de comuna en una **tabla local** | Juan (MapLibre); servicios: Claude | Sin cuentas (A-D9). Empleo nunca sale a internet a ubicar: usa la tabla local. A verificar condiciones de uso en A6 |
| A-D18 | El pin de un arriendo se puede **arrastrar** para corregirlo, y queda fijo | Claude | La geocodificación de direcciones chilenas falla a veces |
| A-D19 | Rama base: la que junta Windows (ver sección 11) | Claude propone; Juan confirma | P9 pide probar en Windows y en Mac al final |
| A-D20 | Ejecución de A1 a A7 seguida, con pruebas por fase, sin checkpoints intermedios; un solo aviso al final | Juan (P9) | Reemplaza el checkpoint por fase de la versión 1 |

## 5. Dominio (contexto `arriendos`)

### 5.1 Propiedad y estados

**Agregado `Propiedad`:** lo que estás siguiendo.
- **Datos:** tipo (departamento, casa, pieza), dirección, comuna, coordenadas (con origen: geocodificada o fijada a mano), precio y moneda (CLP o UF), gastos comunes, m² útiles y totales, dormitorios, baños, estacionamiento, bodega, amoblado, mascotas, disponible desde.
- **Requisitos del arrendador:** renta mínima (veces el arriendo), aval, meses de garantía, comisión, documentos pedidos.
- **Publicaciones:** una o más (canal, URL, precio publicado, fecha vista).
- **Seguimiento:** estado, cambios de estado con origen, visitas, contactos con conversaciones, documentos enviados, notas, señales, discrepancias, calce y brechas.

| Estado | Salidas |
|---|---|
| `vista` | `contactada`, `visita_agendada`, `descartada`, `no_disponible` |
| `contactada` | `visita_agendada`, `en_evaluacion`, `rechazada`, `descartada`, `no_disponible` |
| `visita_agendada` | `visitada`, `contactada`, `descartada`, `no_disponible` |
| `visitada` | `en_evaluacion`, `descartada`, `no_disponible` |
| `en_evaluacion` | `aprobada`, `rechazada`, `descartada`, `no_disponible` |
| `aprobada` | `arrendada`, `descartada` |
| `arrendada`, `rechazada` | terminales |
| `descartada`, `no_disponible` | `vista` |

Reglas (como R1 a R14 de empleo): una URL de publicación activa por propiedad; motivo para `rechazada` y `descartada`; `visita_agendada` pide fecha; `en_evaluacion` pide los documentos enviados; discrepancia si mueves contra la evidencia.

### 5.2 Contactos y conversaciones

Cada contacto de una propiedad: nombre, rol (corredor, dueño, conserje, administración, otro), teléfono, correo, WhatsApp, enlace de postulación, LinkedIn y el canal por el que hablan. Sus conversaciones son interacciones fechadas (mensaje enviado o recibido, llamada, visita) con su canal, como en la red de LinkedIn; de ahí sale «te toca responder».

### 5.3 Canales

Catálogo `Canal`: nombre, tipo (`portal`, `mensajeria`, `correo`, `telefono`, `corredora`, `otro`), dominios web (para reconocer URLs y correos) y si está activo. Viene con Portal Inmobiliario, Yapo, Toctoc, Goplaceit, iCasas, Facebook Marketplace, WhatsApp, Correo y Teléfono. Se agregan en la consola o con `registrar_canal` por MCP. Cuando el filtro del correo ve un dominio de un canal nuevo, ese correo pasa a contar como de arriendos.

### 5.4 Perfil de búsqueda

Una sola búsqueda activa (P4: solo arriendo). **Reglas** con: criterio (presupuesto total, gastos comunes, comuna, tipo, dormitorios, baños, m², mascota, estacionamiento, amoblado, renta exigida, aval, fecha de mudanza), operador y valor, **dura o blanda**, y para las blandas una **prioridad** (P1, P2…). Datos de la persona para comparar: renta líquida, si tiene aval y mascota. Cada cambio queda en el **historial** con fecha, origen (`persona` o `ia`) y motivo.

**Calce:** si falla una regla dura, calce 0 y esa brecha va primero; si no, cada blanda pesa según su prioridad (P1 pesa más). Brechas en palabras: «se pasa $40.000 del presupuesto», «pide renta 3x y tienes 2,6x». Se recalcula al cambiar una regla. Con la UF del día para comparar precios en UF.

**Protocolo para la IA** (en las instrucciones del servidor MCP y en la descripción de las herramientas):
1. Antes de buscar o agregar, `ver_busqueda`.
2. Antes de crear, `buscar_duplicado` (o `crear_propiedad`, que avisa si hay duplicado).
3. Si la persona pide algo que contradice una regla, **preguntarle** si cambia la regla; si dice que sí, `editar_busqueda` con el motivo. Ejemplo: pide casa y la regla dice departamento → «¿Paso casa a P1 y departamento a P2?».

### 5.5 Duplicados

- **Seguro:** la misma URL de publicación (normalizada, sin parámetros de seguimiento).
- **Candidato:** misma dirección normalizada y comuna, o mismas coordenadas a menos de 30 m con los mismos dormitorios. Se muestra para unir: la publicación nueva se suma a la propiedad que ya existe.

## 6. Mapa (los dos focos)

- **Librería:** MapLibre GL JS. **Mapa base:** OpenFreeMap (sin cuenta ni llave). En las pruebas, un estilo vacío local para no depender de internet.
- **Empleo:** la ubicación del aviso es texto («Las Condes, Santiago», «Santiago», «Remoto»). Se normaliza a una comuna con una **tabla local de comunas de Chile con su centro**; todas las postulaciones de esa comuna van en **un pin con el número**, que al tocarlo lista las postulaciones. Si solo dice una ciudad o región, va al centro de esa ciudad. «Remoto» y lo que no se reconoce van en una lista al lado del mapa, sin pin. Nada de empleo sale a internet para ubicarse.
- **Arriendos:** dirección exacta. Se ubica con **Nominatim**, una consulta por segundo, guardando el resultado; si no la encuentra, pin en el centro de la comuna marcado como aproximado. El pin se puede arrastrar para corregirlo. Color del pin según el estado y borde según el calce.
- **Filtros:** los mismos del tablero (estado, plataforma o canal).
- **Sin internet:** el mapa muestra un aviso y la lista sigue funcionando.

## 7. Importar y agregar desde cualquier lado

- **Pegar texto** (un aviso, un correo, un mensaje): la IA extrae una o más propiedades con sus datos y contactos; ves una vista previa con los duplicados marcados y confirmas.
- **Chat exportado de WhatsApp** (.txt de «Exportar chat»): se separa por mensajes, la IA arma propiedades y contactos, y los mensajes quedan como conversaciones del contacto. Lo procesa el servicio con IA en local; al modelo va solo el texto, con los números de teléfono reemplazados por marcas que el código vuelve a poner (como los enlaces en `pasos.md` §5.5).
- **Por MCP:** `crear_propiedad` y `registrar_interaccion_arriendo` aceptan todo lo anterior, para que Claude agregue lo que le cuentes del lugar donde postulaste.

## 8. Qué cambia

| Pieza | Cambio | Tipo |
|---|---|---|
| `apps/consola/.../marco/marco.ts` | Selector con Empleo y Arriendos, color por foco, nav por foco, pestaña Mapa | Modificado |
| `apps/consola/.../nucleo/foco/` | Servicio `Foco` (URL, último foco, ⌘1 y ⌘2, paleta) | Nuevo |
| `apps/consola/src/app/app.routes.ts` | `/mapa` y grupo `/arriendos/*` | Modificado |
| `apps/consola/.../funciones/arriendos/` | Tablero, lista, ficha, nueva, importar, bandeja, canales, búsqueda, mapa | Nuevo |
| `apps/consola/.../funciones/mapa/` | Componente de mapa compartido (MapLibre), pines acumulados y arrastrables | Nuevo |
| `apps/consola/public/geo/comunas.json` | Comunas de Chile con su centro (fuente a verificar en A6) | Nuevo |
| `apps/consola/.../ajustes` | Sección Búsqueda de arriendo | Modificado |
| `apps/consola/public/i18n/{es,en}.json` | Claves `foco.*`, `arriendos.*`, `mapa.*` | Modificado |
| `services/nucleo/src/arriendos/` | Dominio (propiedad, canales, perfil, calce, duplicados), casos de uso, REST, MCP, Prisma, eventos | Nuevo |
| `services/nucleo/prisma/schema.prisma` + migración | Tablas de arriendos al final del archivo | Modificado |
| `services/nucleo/.../mcp/servidor-mcp.ts` | Una línea que registra las herramientas de arriendos; instrucciones con los dos focos | Modificado |
| `services/nucleo/src/postulaciones/...` | Lectura de ubicación para el mapa de empleo (sin cambiar el dominio) | Modificado |
| dependency-cruiser | `arriendos/dominio` no importa NestJS, Prisma ni `postulaciones` | Modificado |
| `packages/contratos/openapi.json` | Rutas de arriendos y del mapa | Modificado |
| `services/ia/.../dominio/filtro.py`, `reglas.py` | Devuelve el foco; dominios de los canales | Modificado |
| `services/ia/.../dominio/arriendo/` | Clasificación de correos, extracción de propiedades desde texto y WhatsApp, asociación | Nuevo |
| `services/ia/.../entradas/api.py` | Rutas de importar y extraer; Preguntar por foco | Modificado |
| `apps/escritorio/src/notificaciones.ts`, `main.ts` | Ruta según el evento; pendientes por foco en la barra de menú | Modificado |
| `docs/adr/0020-segundo-contexto-arriendos.md`, `docs/PLAN.md`, `README.md` | Decisiones, fase y uso | Nuevo / modificado |

## 9. Fases (seguidas, con pruebas en cada una)

Juan pidió hacerlas de corrido (A-D20). Cada fase termina con `pnpm turbo run lint typecheck test build` en verde, más lo propio de la fase, y un commit. Si una fase no pasa, no se sigue a la siguiente hasta arreglarla.

| Fase | Qué | Pruebas |
|---|---|---|
| A1 | Selector, servicio Foco, color provisorio, rutas `/arriendos` y `/mapa` vacías, i18n, atajos | Vitest del Foco; Playwright: cambiar de foco, volver, enlace directo; axe |
| A2 | Núcleo: propiedad, canales, perfil con reglas e historial, calce, duplicados, REST, contrato, MCP, eventos | Todas las transiciones y reglas sin base; calce y duplicados; API y MCP contra `brecha_pruebas`; dependency-cruiser |
| A3 | Consola: tablero, lista, ficha, nueva, canales, Ajustes de búsqueda | Stores con Vitest; Playwright: crear, contactar, agendar visita, cambiar una regla y ver el calce |
| A4 | Servicio con IA: filtro con foco, clasificación de correos de arriendo, asociación, Bandeja | pytest con correos de ejemplo escritos a mano; el set de empleo sigue pasando |
| A5 | Importar texto y WhatsApp; Preguntar por foco | pytest del parser de WhatsApp (formatos de iOS y Android) y de las marcas de teléfono; Playwright de la vista previa |
| A6 | Mapa en los dos focos | Vitest de la normalización de comunas y de los pines acumulados; Playwright con estilo vacío; prueba de Nominatim con respuestas grabadas |
| A7 | Escritorio, notificaciones, hooks, documentación, PR borrador | Pruebas del escritorio; empaquetar en Mac; prueba de humo de la app instalada |

**Al terminar:** aviso a Juan con lo hecho, lo no verificado y cómo probar en Mac y en Windows.

## 10. Riesgos

| Riesgo | Cómo se maneja |
|---|---|
| **Conflictos con ramas en paralelo** (pasos pendientes toca `servidor-mcp.ts`, `schema.prisma` y el MCP; tutorial y CSV tocan la consola) | Código de arriendos en archivos propios; en los compartidos, cambios mínimos y al final del archivo; la migración propia se rehace si otra entra antes |
| WhatsApp y teléfono no llegan solos | Importar el chat y MCP (7) |
| Sin correos reales para medir el clasificador | Correos de ejemplo escritos a mano para las pruebas; el set real se arma cuando lleguen |
| OpenFreeMap o Nominatim cambian sus condiciones o se caen | Detrás de un puerto; el mapa sin fondo sigue mostrando pines; direcciones ya ubicadas quedan guardadas |
| La dirección de un arriendo sale a Nominatim | Es el dato de un aviso público, no tuyo; se dice en Ajustes y se puede apagar |
| Ubicaciones de empleo raras («Región Metropolitana», «Híbrido Santiago») | Tabla de sinónimos y lista «sin ubicar» a la vista |
| Todo junto es mucho para una sola pasada | Cada fase deja la app funcionando; si algo se traba, se anota y se sigue con lo que no depende de eso |
| Windows: Juan prueba al final | La rama sale de la que ya junta Windows; nada de rutas con `/` fijo ni comandos de shell de Mac |

## 11. Rama

- **Propuesta:** rama `arriendos` desde **`brecha-junta`** (f2 más Windows, tutorial y CSV), que es lo que Juan puede instalar en los dos sistemas. Esa rama todavía no está en GitHub: se usa la local y, si cambia, se trae lo nuevo con un merge.
- PR borrador con base `main` y el orden de merge escrito (después de #5, #6 y la que junta), como dice el manual de GitHub del AIOS.
- No se toca ninguna otra rama ni carpeta de trabajo; se trabaja en un worktree propio.

## 12. Lo que sale para otros

Nada para terceros. Para el proyecto: ADR 0020, decisiones D-A1 en adelante en `docs/PLAN.md`, README y nota de estado en la bandeja del AIOS al terminar.

## 13. Implementación (24-nov-2026)

Rama `arriendos` desde `brecha-junta`, fases A1 a A7 con pruebas en cada una (commits `feat(consola): selector de foco…` a `feat(escritorio): …`).

**Hecho como estaba planeado:** selector y color por foco; dominio con sus 10 estados, contactos con conversaciones por canal, visitas, documentos, señales y discrepancias (`contra_senal` y `visita_sin_registro`); canales editables; reglas duras y blandas con prioridad e historial; calce y brechas en palabras; duplicados por URL y por dirección o pin; REST, contrato y 19 herramientas MCP con el protocolo para la IA; correos de arriendo con filtro y clasificación propios; importar texto y chats de WhatsApp con teléfonos enmascarados; Preguntar; mapa en los dos focos; notificaciones y barra de menú.

**Cambió respecto del plan:**
| Qué | Por qué |
|---|---|
| Las alertas de portales van a la **Bandeja de Arriendos**, una señal por aviso, en vez de crear propiedades solas | Una alerta trae 10 a 30 avisos: crearlos todos llenaría el tablero. Desde la Bandeja creas o asocias las que te interesan |
| Preguntar no usa embeddings: manda al modelo un resumen de tus propiedades y solo acepta citas a propiedades que existen | Son pocas propiedades por persona; no hace falta un índice vectorial |
| Para correr las e2e en paralelo con otros worktrees, sus puertos se pueden cambiar con `E2E_NUCLEO`, `E2E_CONSOLA` y `E2E_IA` | Lección del 24-nov-2026 (dos worktrees chocaban en los puertos fijos) |
| Comunas: tabla local de 345 comunas con su centro, sacada una vez de OpenStreetMap (Overpass) en `apps/consola/public/geo/comunas-cl.json` | Empleo nunca sale a internet a ubicarse |

**Verificado ejecutando:** lint, tipos, pruebas y build de los cuatro paquetes; 411 pruebas del núcleo; pruebas del servicio con IA; 10 e2e nuevas con axe (selector, flujo, importar con el servicio con IA simulado, mapas); esquemas de OpenAI convertidos al formato estricto sin llamar a la API.

**No verificado:** llamadas reales a OpenAI con los prompts nuevos (sin correos reales de arriendo todavía, P8); el fondo de OpenFreeMap y Nominatim desde la app (las pruebas usan fondo liso y respuestas grabadas); Windows.

**Pendiente de Juan:** elegir el color de Arriendos (hoy un verde provisorio, `styles.css`).
