# Pasos pendientes: lo que cada postulación te pide hacer

Escrito el 24-nov-2026 sobre la rama `f2` (PR borrador #5, `origin/f2` en `6f24183`). Pedido de Juan: que la IA asocie cada correo, mensaje de LinkedIn o página de portal a una o más postulaciones, detecte cuándo te piden un paso, resalte esas tarjetas con un borde, te deje marcarlo hecho (a mano o por MCP) y use eso como contexto para lo siguiente que llegue.

**Versión 2 (24-nov-2026).** Juan respondió las 6 preguntas del artifact «Plan de pasos pendientes» (sección 13) y aclaró por chat cinco cosas que la versión 1 tenía distinto: los pasos se ven aunque la postulación esté cerrada, son texto libre sin tipos, la ficha muestra el proceso completo (pedidos y hechos), cubren LinkedIn y los portales que Claude revisa con Chrome, y avisan siempre (sección 12). Estado: **versión 2 aprobada por Juan el 24-nov-2026 e implementada** en la rama `f2-pasos` (P1 a P4); decisiones D49 a D56 en `docs/PLAN.md`.

## 1. Qué cambia para ti

- Te piden algo: un test por correo de Chiletrabajos, «mándame tu CV» por LinkedIn, un formulario que Claude ve en un portal. Brecha lo asocia a la postulación correcta, **o a varias**, aunque esté cerrada, y crea un **paso pendiente** con texto libre: «Contestar a Daniel Cubillos con tu CV».
- En el tablero, esa tarjeta tiene una **barra azul a la izquierda** (opción B) y la línea del paso con el botón **Hecho**. También en el panel «Cerradas». Las columnas siguen siendo los estados: los pasos viven **dentro** de cada tarjeta.
- Al abrir la tarjeta, la ficha muestra el **proceso**: todos los pasos en orden, los hechos (✓, cuándo y quién) y los pendientes, con el detalle («Responde el mensaje de Daniel en LinkedIn adjuntando tu CV en PDF»), de dónde vino y el enlace si lo hay.
- Le dices a tu IA «ya mandé el CV» y lo marca por MCP (`resolver_paso`). Un correo que dice «recibimos tu test» lo cierra solo (confianza ≥ 0,9).
- Lo siguiente que llegue de esa postulación se interpreta sabiendo qué pasos están abiertos y cuáles se hicieron.
- Un paso nuevo te avisa con **prioridad alta** (notificación de F3), también en una cerrada.
- Arriba del tablero, un chip **«N pasos pendientes»** filtra las tarjetas que esperan algo de ti.

**Hecho de esta función:** el correo de Chiletrabajos «Continua tu Postulacion #3916453» se asocia solo a la postulación de Lanek por el id del aviso, aunque esté rechazada, crea el paso y la tarjeta se resalta en «Cerradas»; al marcarlo hecho por MCP la barra se va; un recordatorio posterior no crea otro paso. Y un «mándame tu CV» que Claude lee en LinkedIn con Chrome queda como paso en las postulaciones de ese contacto.

## 2. Qué pasa hoy y por qué falló el caso de Lanek

Revisado en el código de `origin/f2` y en tu base el 24-nov-2026:

1. **El lector, el clasificador y el registro ya existen** (F2-05 a F2-08 hechas en `f2`): `sincronizar_correo` → `clasificar_pendientes` (OpenAI, `gpt-6-luna`, D34) → `registrar_senales` (asociación sin IA) → `POST /api/v1/senales`. La ficha del AIOS que dice «F2 en pausa tras F2-04» está desactualizada.
2. **La asociación solo mira empresa y cargo** (`services/ia/src/ia/dominio/asociacion.py`). `PostulacionConocida` ya trae la `url` del aviso, pero nadie la usa. Sin empresa en el correo, solo prueba con postulaciones **activas**.
3. El correo de Chiletrabajos del 23-nov no traía la empresa, así que cayó a la bandeja. El asunto traía `#3916453`, el mismo número que termina la URL de la postulación (`…-ia-3916453`). **Con una regla por id del aviso se habría asociado sin dudas, abierta o cerrada.**
4. La clasificación sugirió `en_proceso` con confianza 0,95 y el resumen decía «te piden completar un test de personalidad», pero **ese pedido no queda guardado como algo por hacer**: vive en el resumen y en una nota que escribió tu IA.
5. LinkedIn: el aviso por correo de un mensaje nuevo **no trae el texto** (`dominio/linkedin.py`), así que «mándame tu CV» solo se puede leer abriendo LinkedIn: lo hace Claude con Chrome y lo registra por MCP (`registrar_interaccion_red`). Hoy esa herramienta no puede crear un pedido, y `RegistrarRed` liga el contacto solo a postulaciones activas.
6. En la bandeja está «Bienvenido a Connect by Tenpo»: Tenpo tiene 4 postulaciones tuyas (3 rechazadas). Es el caso de **un correo que puede tocar varias o ninguna**.
7. `senal.referencia_externa` es **única en toda la tabla**: hoy un mismo correo no puede quedar como señal en dos postulaciones.

## 3. Dónde encaja

Bloque nuevo encima de F2, como el de CSV: rama **`f2-pasos`** desde `origin/f2` y PR hacia `f2` (respuesta P6). No reabre D25 a D29 ni D34: el lector, el filtro, el modelo y el umbral 0,9 de D27 siguen iguales. Toca el clasificador (F2-06), la asociación (F2-07), el registro de la red (D40) y suma una entidad al núcleo.

## 4. Modelo de datos

### 4.1 El paso es una entidad propia (agregado `Paso`)

Como campos de la señal, un correo de 3 postulaciones daría 3 copias del mismo paso, y un pedido de LinkedIn o de un portal no tendría señal donde vivir. Como agregado propio hay un solo estado y un solo cierre, venga de donde venga.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID v7 | |
| `postulacionIds` | `string[]` (1 o más) | Abiertas o cerradas |
| `descripcion` | texto libre, 3 a 120 caracteres | Lo que se ve en la tarjeta: «Contestar a Daniel con tu CV». **Sin tipos** (J7): cada proceso pide cosas distintas |
| `detalle` | texto libre, hasta 2.000, opcional | Lo que se ve al abrir: qué piden exactamente y cómo |
| `plazo` | fecha, opcional | Si lo dicen. «Vencido» se calcula |
| `enlace` | URL, opcional | Sacado en local (5.4, respuesta P5) |
| `estado` | `pendiente`, `hecho`, `descartado` | Se puede reabrir; nunca se borra |
| `fuente` | `correo`, `linkedin`, `portal`, `persona` | Por dónde llegó el pedido |
| `registradoPor` | `vigia`, `ia`, `persona` | Quién lo anotó: el lector de correo, tu IA por MCP o tú |
| `contactoRedId` | UUID, opcional | La persona de tu red que lo pidió (LinkedIn) |
| `referenciaExterna` | texto, opcional, único | Message-ID del correo o referencia del mensaje; evita duplicar |
| `cierre` | `{por, en, nota?, referenciaExterna?}` | `por`: `persona`, `ia`, `correo`, `sistema` |
| `pedidoEn`, `creadoEn`, `actualizadoEn`, `version` | | `pedidoEn` = cuándo te lo pidieron (fecha del correo o del mensaje) |

Un paso **hecho desde el principio** también existe: «Llené el formulario de Teamtailor» o «Envié el CV por correo» se registran con `estado: hecho` para que el proceso de la ficha quede completo (J8).

Un paso **no cambia el estado** de la postulación ni su prioridad calculada (R11, D27 y R12 quedan igual). Lo que sí hace es avisar con prioridad alta (J10) y resaltar la tarjeta.

### 4.2 Señal en varias postulaciones

Un correo de 3 postulaciones queda como **3 señales**, una en cada una, con la misma `referenciaExterna`. Migración: `senal.referencia_externa` pasa de única en toda la tabla a única **por postulación**. D27 con varias: el estado sugerido se aplica solo si el correo toca **una** postulación; con varias queda como sugerencia en cada una (respuesta P4).

### 4.3 Bandeja

`senal_pendiente` suma `candidatas uuid[]` (para preseleccionarlas al asociar) y `paso_propuesto jsonb`. Al asociarla a una o varias postulaciones, el paso se crea ligado a ellas. En la bandeja se ve «Pide: completar test».

### 4.4 Tablas y migraciones

| Tabla | Cambio |
|---|---|
| `paso` (nueva) | columnas de 4.1; índice por `estado` |
| `paso_postulacion` (nueva) | `paso_id`, `postulacion_id` (clave doble; borrar la postulación borra el vínculo); índice por `postulacion_id` |
| `senal` | `@@unique([postulacion_id, referencia_externa])` en vez de única global |
| `senal_pendiente` | `candidatas uuid[] default '{}'`, `paso_propuesto jsonb null` |

Prisma: una migración `20261127000000_pasos` con `migrate diff --script`, probada antes contra una copia de tu base. Esquema `ia` (Alembic): `correo` suma `en_respuesta_a`, `hilo` y `enlaces jsonb`; `clasificacion.postulacion_id` pasa a `postulacion_ids text[]`, copiando el valor de hoy.

## 5. De dónde salen los pasos

Tres entradas, un mismo caso de uso en el núcleo:

| Entrada | Quién lee | Cómo llega al núcleo |
|---|---|---|
| **Correo** (Chiletrabajos, Teamtailor, reclutadores…) | El vigía con OpenAI | `POST /senales` con `paso` y `pasosCumplidos` |
| **LinkedIn** (mensajes) | Claude con Chrome; el aviso por correo solo dice que hay mensaje | `registrar_interaccion_red` con `paso`, o `registrar_paso` |
| **Portales sin API** (trabajando, Computrabajo…) | Claude con Chrome (D14) | `registrar_paso` (pendiente o hecho), después de ubicar la postulación por la URL |

### 5.1 Correo: candidatas por código

`dominio/asociacion.py` pasa de «una o la bandeja» a **una lista de candidatas con su motivo**. Se consideran **todas** las postulaciones, también las cerradas (J6).

| Regla | Qué compara | Tipo |
|---|---|---|
| **Id del aviso** | Números de 6 o más dígitos y URLs de avisos del asunto y del fragmento contra el id de la URL de cada postulación (Chiletrabajos `…-3916453`, Teamtailor `/jobs/8632917-…`, LinkedIn `/jobs/view/…`, trabajando, Computrabajo, Get on Board), con la misma plataforma | **Segura** |
| **Mismo hilo** | `In-Reply-To` o `References` contra un correo ya asociado | **Segura** |
| Remitente personal | Una persona (no `noreply`, no una plataforma) que ya escribió por una postulación, o un contacto de tu red con ese correo | Candidata |
| Plataforma o ATS de la empresa | El dominio del remitente es el sistema de selección de la empresa (`tenpo.teamtailor-mail.com`) | Candidata |
| Empresa y cargo | Lo de hoy, pero devuelve hasta 8 candidatas con puntaje | Candidata |

### 5.2 Correo: clasificación con contexto (prompt v2, respuesta P1: híbrido)

El modelo recibe lo de hoy más las candidatas, cada una con un id corto (`p1`, `p2`…), empresa, cargo, estado, sus pasos pendientes, sus pasos de los últimos 30 días (hechos y descartados, con quién y cuándo) y sus 3 últimas señales. Devuelve además:

| Campo | Qué es |
|---|---|
| `postulaciones` | Ids cortos de las candidatas a las que corresponde (puede ir vacío) |
| `paso` | `null` o `{descripcion, detalle, plazo, enlace, mismo_que}`. `mismo_que`: el id de un paso pendiente si el correo solo lo recuerda (se actualiza el plazo, no se crea otro) |
| `pasos_cumplidos` | Ids de pasos pendientes que este correo da por hechos, con su confianza |

Ejemplos negativos en el prompt: «completa tu perfil para destacar», alertas y boletines **no** son pasos. Costo extra: unas 600 fichas (tokens) por correo, menos de un centavo de dólar al mes con `gpt-6-luna`.

### 5.3 Correo: verificación por código

1. Si hubo una regla segura, esas postulaciones mandan; el modelo puede sumar otras solo si son candidatas con la empresa coincidente.
2. Sin regla segura, se aceptan las que eligió el modelo si están entre las candidatas y su empresa coincide (≥ 0,8). Si no, va a la bandeja con las candidatas marcadas.
3. Los ids fuera de la lista se descartan y quedan en la traza.
4. Un paso cumplido con confianza ≥ 0,9 se cierra solo (`por: correo`, respuesta P3); con menos, queda la sugerencia «parece que ya lo hiciste».

### 5.4 Enlaces sin sacar tokens de tu máquina (respuesta P5)

El lector saca los `href` del HTML **en local**, guarda solo los de dominios del remitente o de plataformas conocidas en `ia.correo.enlaces`, y en el fragmento los reemplaza por `[enlace 1]`. El modelo responde `enlace: 1` y el código pone la URL real. El token nunca va a OpenAI.

### 5.5 LinkedIn

- `registrar_interaccion_red` suma un `paso` opcional (`descripcion`, `detalle`, `plazo`): se crea en las postulaciones del contacto, con `fuente: linkedin` y `contactoRedId`. Si el contacto no tiene postulaciones ligadas, la herramienta devuelve las candidatas de su empresa para que la IA elija (o pase `postulacionIds`).
- Cuando el vigía ve el aviso por correo de un **mensaje nuevo** de un contacto ligado a una postulación, crea el paso «Leer el mensaje de Daniel Cubillos en LinkedIn» (el texto no viene en el correo). Cuando Claude lo lee con Chrome, cierra ese paso y, si piden algo, registra el pedido real («Contestar con tu CV»).
- `RegistrarRed` liga los contactos también a postulaciones cerradas de su empresa (hoy solo activas).

### 5.6 Portales con Chrome

- `listar_postulaciones` suma el filtro `url` (acepta la URL de un aviso o solo su id) para que Claude ubique la postulación desde la página del portal.
- Las instrucciones del servidor MCP suman: al revisar un portal o un mensaje, registra con `registrar_paso` lo que te piden (pendiente) y lo que ya se hizo (hecho); cuando la persona diga que completó algo, usa `resolver_paso`; antes de registrar, mira los pasos de la postulación para no duplicar.

### 5.7 Lo ya leído

`uv run ia pasos reprocesar --dias 30` vuelve a clasificar con el prompt v2 los correos guardados de los últimos 30 días y solo crea pasos; no vuelve a registrar señales. Lo corres tú al terminar P2.

## 6. Reglas nuevas del núcleo

| Id | Regla | Efecto |
|---|---|---|
| R15 | Un paso tiene al menos una postulación (abierta o cerrada) y una descripción de 3 a 120 caracteres | `VALIDACION` |
| R16 | Un paso pasa a hecho o descartado y se puede reabrir; nunca se borra. Cada cambio guarda quién, cuándo y la nota. Se puede crear ya hecho | evento `paso.resuelto` |
| R17 | Cerrar una postulación **no** descarta sus pasos. El diálogo de cerrar muestra los pendientes con «Descartar estos pasos» marcado por defecto; por MCP, `cambiar_estado` avisa cuántos quedan pendientes | |
| R18 | Un paso para una postulación cerrada se crea pendiente, se resalta y avisa con prioridad alta | evento `paso.detectado` |
| R19 | Un mismo correo o mensaje crea a lo más un paso (`referencia_externa` única); `mismo_que` actualiza el existente | `YA_EXISTE` |
| R20 | Un correo posterior cierra un paso si la confianza es ≥ 0,9; si no, queda la sugerencia | evento `paso.resuelto` |

## 7. Consola

### 7.1 Tarjeta (opción B, respuesta P2)

Barra de 4 px en `acento` a la izquierda; el borde de siempre no cambia, así convive con el amarillo de discrepancia. Dentro, una línea en `acento-suave` con la descripción del paso, el plazo (naranja si es hoy o mañana) y **Hecho** (toast con **Deshacer**). Si hay más de uno, el de plazo más cercano y «+1». Vale para todas las columnas **y para las tarjetas del panel «Cerradas»**; el botón «Cerradas» del tablero muestra «· 1 paso» cuando alguna cerrada tiene pasos pendientes, para que no queden escondidos.

### 7.2 Ficha: el proceso

Sección **Proceso** arriba de la línea de tiempo: todos los pasos de la postulación en orden de `pedidoEn`, mezclados con los hitos del estado (postulada, entrevista, rechazada):
- pendientes con ○, descripción, detalle, plazo, «Abrir ↗», de dónde vino («Correo de Chiletrabajos, 23-nov» o «Daniel Cubillos por LinkedIn, 23-nov»), otras postulaciones que toca, y **Hecho**, **Descartar**, **Editar**;
- hechos con ✓, cuándo y quién («Marcado por tu IA»), y descartados atenuados.

Botón **+ Paso** para anotar uno a mano, pendiente o ya hecho.

### 7.3 Tablero, bandeja y textos

- Chip **«N pasos pendientes»** junto a los filtros: muestra solo las tarjetas con pasos, cerradas incluidas.
- Bandeja: «Asociar» acepta **varias** postulaciones, con las candidatas marcadas; «Pide: …» si hubo pedido.
- Textos en `es` y `en` (Transloco, D24).

## 8. API, MCP y eventos

**REST** (`/api/v1`):

| Ruta | Qué hace |
|---|---|
| `GET /pasos?estado=&postulacionId=` | Lista con sus postulaciones (empresa y cargo) |
| `POST /pasos` | `{postulacionIds, descripcion, detalle?, plazo?, enlace?, estado?, fuente?, contactoRedId?}` |
| `PATCH /pasos/:id` | Edita texto, plazo, enlace o postulaciones (`version`) |
| `POST /pasos/:id/resolver` | `{estado: hecho | descartado | pendiente, nota?, version}` |
| `POST /senales` | Suma `postulacionIds[]`, `paso?` y `pasosCumplidos?` (token `servicio`) |
| `POST /bandeja/:id/asociar` | Acepta `postulacionIds[]` |
| `GET /postulaciones?url=` | Busca por URL o id del aviso |
| `GET /postulaciones/tablero` y `/:id` | Suman `pasosPendientes` y, en el detalle, el proceso completo |

**MCP** (mismo caso de uso que su ruta):

| Herramienta | Para qué |
|---|---|
| `listar_pasos` | «¿Qué tengo pendiente?» |
| `registrar_paso` | Lo que Claude ve en un portal o en un mensaje: pendiente o ya hecho |
| `resolver_paso` | «Ya mandé el CV»: hecho, descartado o reabrir, con nota |
| `registrar_interaccion_red` | Suma `paso` opcional (LinkedIn) |
| `listar_postulaciones` | Suma el filtro `url` |
| `asociar_senal` | Acepta varias postulaciones |
| `ver_postulacion`, `resumen`, `exportar` | Incluyen el proceso |

**Eventos (outbox):** `paso.detectado` con **prioridad alta siempre** (J10), también para cerradas; `paso.resuelto` con prioridad baja. Las notificaciones de F3 los muestran: «Chiletrabajos te pide completar un test (Lanek)».

## 9. Pruebas

| Nivel | Qué | Dónde |
|---|---|---|
| Dominio núcleo | R15 a R20, cada una con un caso que pasa y uno que falla; paso en una postulación cerrada | Vitest, sin base |
| Casos de uso | Señal para 3 postulaciones (3 señales, 1 paso); cerrar con pasos pendientes (con y sin descartar); paso desde LinkedIn en las postulaciones del contacto | Vitest con repositorios en memoria |
| Persistencia | Migración sobre una copia de la base real; paso con dos postulaciones ida y vuelta | Vitest contra `brecha_pruebas` |
| REST y MCP | Una prueba por ruta y por herramienta, éxito y error; contrato regenerado | Vitest |
| Dominio IA | Id del aviso por plataforma (incluido `#3916453` contra `…-3916453` en una postulación rechazada), hilo, ATS de la empresa, verificación, enlaces | pytest |
| Aplicación IA | Clasificar con contexto (modelo falso); recordatorio no duplica; «gracias por completar» cierra; aviso de mensaje de LinkedIn crea «Leer el mensaje»; reprocesar no duplica | pytest |
| Consola | Tarjeta con barra (también en Cerradas), **Hecho** y **Deshacer**, proceso en la ficha, chip; axe sin violaciones | Vitest + Playwright |
| Evaluación | `correos.jsonl` con `postulaciones_esperadas` y `paso_esperado`; 4 correos inventados nuevos | `uv run ia evaluar` |

**Umbrales** (laxos, como D30): ≥ 80 % de los pasos esperados detectados, a lo más 1 paso inventado en el set, 100 % de asociación correcta con id del aviso, ≥ 75 % con varias postulaciones.

## 10. Fases con checkpoint

| Fase | Qué | Hecho cuando |
|---|---|---|
| **P0 · Plan** | Este documento y su artifact | Juan aprueba la versión 2 |
| **P1 · Núcleo** | Agregado `Paso`, R15 a R20, migración, señales en varias, bandeja con candidatas, REST, MCP (también LinkedIn y `url`), eventos, contrato | Pruebas en verde; desde Claude Code registras, listas y resuelves un paso en tu base, también desde un mensaje de LinkedIn |
| **P2 · Servicio con IA** | Candidatas por código, prompt v2, verificación, enlaces, LinkedIn (aviso de mensaje y liga a cerradas), `ia pasos reprocesar` | El correo de Lanek reprocesado se asocia solo y crea el paso; 5 correos reales bien a mano |
| **P3 · Consola** | Tarjeta B (también en Cerradas), proceso en la ficha, diálogo de cerrar con pasos, chip, bandeja con varias | Playwright y axe en verde; lo ves en la app con tus datos |
| **P4 · Evaluación y cierre** | Sets con pasos, umbrales, docs (PLAN D49+, `backend.md`, `ui.md`, `f2.md`), AIOS, PR hacia `f2` | Los sets pasan; CI verde; mergeas tú |

P1 va primero porque fija el contrato. P2 y P3 pueden ir en paralelo después.

## 11. Riesgos

- **Pasos inventados** por correos de marketing: ejemplos negativos, umbral en la evaluación y **Descartar** a un clic (lo descartado también es contexto).
- **Tarjetas cerradas con pasos viejos para siempre:** el diálogo de cerrar ofrece descartarlos (R17) y el chip los muestra todos para limpiarlos de una vez.
- **Un número que coincide por azar** con el id de un aviso: misma plataforma y 6 dígitos o más.
- **Más datos tuyos hacia OpenAI** (empresa, cargo, estado y pasos de hasta 8 candidatas): aceptado en P1; Conexiones lo dice en «qué sale de tu máquina».
- **Cambiar la unicidad de `referencia_externa`:** migración probada contra una copia de tu base.
- **Recompilar `brecha-ia`** hace que macOS vuelva a pedir el llavero: aviso antes.

## 12. Decisiones y autoría

| # | Decisión | Autor | Estado |
|---|---|---|---|
| J1 | Un correo se asocia a una o más postulaciones | Juan | Pedido |
| J2 | Un pedido resalta las tarjetas con un borde | Juan | Pedido |
| J3 | El paso se marca hecho a mano o pidiéndoselo a la IA por MCP | Juan | Pedido |
| J4 | Lo siguiente que llega se interpreta sabiendo qué pasos se hicieron | Juan | Pedido |
| J5 | Planificar primero, con checkpoints por fase | Juan | Pedido |
| J6 | Se asocia y se resalta **aunque la postulación esté cerrada** | Juan | Pedido (chat, 24-nov) |
| J7 | Los pasos son **texto libre**, sin tipos: cada proceso es distinto | Juan | Pedido (chat, 24-nov) |
| J8 | La ficha muestra **todo el proceso**: pasos pedidos y hechos, a medida que llegan y se completan; las columnas siguen siendo los estados | Juan | Pedido (chat, 24-nov) |
| J9 | Vale para **correo, LinkedIn y portales que Claude revisa con Chrome**, y reconoce la postulación aunque escriba una plataforma asociada y no la empresa | Juan | Pedido (chat, 24-nov) |
| J10 | Un paso nuevo **avisa** (notificación) | Juan | Pedido (chat, 24-nov) |
| P1 | Asociación híbrida: candidatas y reglas seguras por código, el modelo elige, el código verifica | Juan + Claude | Respondida |
| P2 | Tarjeta con barra lateral azul (opción B) | Juan + Claude | Respondida |
| P3 | Un correo puede cerrar un paso solo con confianza ≥ 0,9 | Juan + Claude | Respondida |
| P4 | Con varias postulaciones el estado sugerido queda como sugerencia | Juan + Claude | Respondida |
| P5 | Se guarda el enlace, sacado en local | Juan + Claude | Respondida |
| P6 | Rama `f2-pasos` desde `origin/f2`, PR hacia `f2` | Juan + Claude | Respondida |
| a | El paso es un agregado propio ligado a 1..n postulaciones | Claude | Propuesta |
| b | Un paso no cambia el estado ni la prioridad calculada; avisa aparte | Claude | Propuesta |
| c | Cerrar una postulación no descarta sus pasos, pero el diálogo ofrece hacerlo (R17) | Claude | Propuesta (cambia la v1 por J6) |
| d | El aviso por correo de un mensaje de LinkedIn de un contacto ligado crea «Leer el mensaje de X» | Claude | Propuesta |
| e | `registrar_interaccion_red` con `paso` y `listar_postulaciones` con `url` | Claude | Propuesta |
| f | Chip de filtro en el tablero; «Cerradas» muestra cuántos pasos esconde | Claude | Propuesta |
| g | Reprocesar los correos de los últimos 30 días (lo corres tú) | Claude | Propuesta |

## 13. Respuestas de Juan (artifact, 24-nov-2026, 14:05)

| Pregunta | Respuesta |
|---|---|
| P1 ¿Quién asocia? | Híbrido (recomendada) |
| P2 Estilo del borde | B, barra lateral (recomendada) |
| P3 ¿Un correo cierra un paso solo? | Sí, con confianza ≥ 0,9 (recomendada) |
| P4 Varias postulaciones con estado seguro | Solo se aplica si es una (recomendada) |
| P5 ¿Guardar el enlace? | Sí, sacado en local (recomendada) |
| P6 Rama | `f2-pasos` desde `origin/f2`, PR hacia `f2` (recomendada) |
