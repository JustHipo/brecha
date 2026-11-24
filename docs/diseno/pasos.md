# Pasos pendientes: correos que piden hacer algo

Escrito el 24-nov-2026 sobre la rama `f2` (PR borrador #5, `origin/f2` en `6f24183`). Pedido de Juan: que la IA asocie cada correo a una o más postulaciones, detecte cuándo pide un paso a seguir, resalte esas tarjetas con un borde, le deje marcar el paso como hecho (a mano o por MCP) y use eso como contexto para el siguiente correo. Estado: **propuesta, esperando la aprobación de Juan.** Las decisiones abiertas están en la sección 13; al aprobarse pasan a `docs/PLAN.md` como D49 en adelante.

## 1. Qué cambia para ti

- Llega un correo que pide algo (un test, un formulario, agendar una llamada, mandar documentos, responder). Brecha lo asocia a la postulación correcta, **o a varias** si toca más de una, y crea un **paso pendiente**: «Completar test de personalidad · vence el 30-nov».
- En el tablero, esas tarjetas tienen un **borde propio** (distinto del amarillo de discrepancia) y una línea con el paso y el botón **Hecho**. La ficha tiene una sección «Pasos» con Hecho, Descartar y Reabrir.
- Le puedes decir a tu IA «ya hice el test de Lanek» y ella lo marca por MCP (`resolver_paso`). Queda registrado quién lo cerró: tú, tu IA, un correo o el sistema.
- Cuando llega **el siguiente correo** de esa postulación, el clasificador recibe sus pasos abiertos y los cerrados hace poco. Así un recordatorio del test ya hecho no crea otro paso, y «gracias por completar el test» cierra el paso solo (si lo apruebas, pregunta 3).
- Arriba del tablero, un chip **«N pasos pendientes»** filtra las tarjetas que esperan algo de ti.

**Hecho de esta función:** un correo como el de Chiletrabajos «Continua tu Postulacion #3916453» (sin empresa en el texto) se asocia solo a la postulación correcta por el id del aviso, crea el paso y la tarjeta se resalta; al marcarlo hecho por MCP el borde se va; un recordatorio posterior no crea otro paso.

## 2. Qué pasa hoy y por qué falló el caso de Lanek

Revisado en el código de `origin/f2` y en tu base el 24-nov-2026:

1. **El lector, el clasificador y el registro ya existen** (F2-05 a F2-08 hechas en `f2`): `sincronizar_correo` → `clasificar_pendientes` (OpenAI, `gpt-6-luna`, D34) → `registrar_senales` (asociación sin IA) → `POST /api/v1/senales`. La ficha del AIOS que dice «F2 en pausa tras F2-04» está desactualizada.
2. **La asociación solo mira empresa y cargo** (`services/ia/src/ia/dominio/asociacion.py`). `PostulacionConocida` ya trae la `url` del aviso, pero nadie la usa.
3. El correo de Chiletrabajos del 23-nov no traía la empresa y su cargo no alcanzó para una coincidencia única, así que cayó a la bandeja. El asunto traía `#3916453`, el mismo número que termina la URL de la postulación (`…-ia-3916453`). **Con una regla por id del aviso se habría asociado sin dudas.** Después se asoció a mano.
4. La clasificación sugirió `en_proceso` con confianza 0,95 y el resumen decía «te piden completar un test de personalidad», pero **ese pedido no queda guardado como algo por hacer**: vive solo en el texto del resumen y en una nota que escribió tu IA.
5. Esa misma tarde Lanek respondió por LinkedIn que el puesto estaba ocupado y la postulación pasó a `rechazado`. La nota dice «Ya no hace falta el test». Es el caso de un **paso que se vuelve innecesario porque la postulación se cerró** (regla R17).
6. En la bandeja está «Bienvenido a Connect by Tenpo»: Tenpo tiene 4 postulaciones tuyas y el correo es de su base de talentos, no de un cargo. Es el caso de **un correo que puede tocar varias o ninguna**.
7. `senal.referencia_externa` es **única en toda la tabla**: hoy un mismo correo no puede quedar como señal en dos postulaciones. Hay que cambiarlo (sección 4.2).

## 3. Dónde encaja

Es un bloque nuevo encima de F2, como el de CSV (`f2-csv`): rama **`f2-pasos`** desde `origin/f2` y PR hacia `f2` (pregunta 6). No reabre D25 a D29 ni D34: el lector, el filtro, el modelo y el umbral 0,9 de D27 siguen iguales. Toca el clasificador (F2-06) y la asociación (F2-07), que ya existen, y suma una entidad al núcleo.

## 4. Modelo de datos

### 4.1 El paso es una entidad propia (agregado `Paso`), no un campo de la señal

| Opción | A favor | En contra |
|---|---|---|
| Campos en la señal (`accion`, `plazo`, `accionHecha`) | Simple; una tabla menos | Un correo de varias postulaciones daría varias copias del paso y marcarlo hecho obliga a sincronizarlas. Tu IA no podría crear un paso sin inventar una señal |
| **Agregado `Paso` ligado a una o más postulaciones** (recomendado) | Un paso, un estado, un cierre, aunque toque 3 postulaciones. Se puede crear desde un correo, desde tu IA o a mano. Se lista y filtra solo | Una tabla de unión y un caso de uso que coordina dos agregados al cerrar una postulación |

**Agregado `Paso`** (contexto Seguimiento, `services/nucleo/src/pasos/` con las mismas capas):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID v7 | |
| `postulacionIds` | `string[]` (1 o más) | Las postulaciones que esperan este paso |
| `tipo` | `test`, `formulario`, `agendar`, `documentos`, `responder`, `otro` | Para el ícono y para que la IA no confunda pasos |
| `descripcion` | texto, 3 a 120 caracteres | Lo que se ve en la tarjeta: «Completar test de personalidad» |
| `plazo` | fecha, opcional | Si el correo lo dice. «Vencido» se calcula, no se guarda |
| `enlace` | URL, opcional | Solo si pasa la regla de la pregunta 4 |
| `estado` | `pendiente`, `hecho`, `descartado` | |
| `origen` | `correo`, `ia`, `persona` | Quién lo creó |
| `referenciaExterna` | Message-ID, opcional, único | El correo que lo pidió; evita crear el mismo paso dos veces |
| `cierre` | `{por, en, nota?, referenciaExterna?}` | `por`: `persona`, `ia`, `correo` o `sistema`. `referenciaExterna`: el correo que lo dio por hecho |
| `creadoEn`, `actualizadoEn`, `version` | | Bloqueo optimista como en Postulación (R10) |

Un paso **no cambia el estado** de la postulación. La regla del núcleo («registrar una señal nunca cambia el estado por sí sola», R11 con D27) queda igual: el estado sugerido sigue su camino de siempre y el paso es aparte.

### 4.2 Señal en varias postulaciones

- Una señal sigue siendo parte del agregado `Postulacion`. Un correo de 3 postulaciones queda como **3 señales**, una en cada una, con la misma `referenciaExterna`.
- Migración: `senal.referencia_externa` deja de ser única en toda la tabla y pasa a ser única **por postulación** (`@@unique([postulacionId, referenciaExterna])`). La deduplicación de `POST /senales` revisa por postulación, y la bandeja sigue revisando la referencia en las dos tablas.
- **D27 con varias postulaciones:** pregunta 4.

### 4.3 Bandeja

`senal_pendiente` suma `candidatas uuid[]` (las postulaciones que la IA propuso sin certeza, para preseleccionarlas al asociar) y `paso_propuesto jsonb` (el paso que pidió el correo, si pidió uno). Al asociarla a una o varias postulaciones, el paso propuesto se crea ligado a ellas. En la bandeja, un correo con paso propuesto muestra «Pide: completar test» para que no se te pase.

### 4.4 Tablas nuevas y cambios (Prisma, una migración `20261127000000_pasos`)

| Tabla | Columnas |
|---|---|
| `paso` | `id`, `tipo`, `descripcion`, `plazo date null`, `enlace null`, `estado`, `origen`, `referencia_externa null unique`, `cerrado_por null`, `cerrado_en null`, `nota_cierre null`, `referencia_cierre null`, `version`, `creado_en`, `actualizado_en`; índice por `estado` |
| `paso_postulacion` | `paso_id`, `postulacion_id` (clave doble; borrar la postulación borra el vínculo) ; índice por `postulacion_id` |
| `senal` | quitar `@unique` de `referencia_externa`; agregar `@@unique([postulacion_id, referencia_externa])` |
| `senal_pendiente` | `candidatas uuid[] default '{}'`, `paso_propuesto jsonb null` |

Esquema `ia` (Alembic): `correo` suma `en_respuesta_a`, `hilo` (primer id de `References`) y `enlaces jsonb` (sección 5.4); `clasificacion.postulacion_id` pasa a `postulacion_ids text[]`, copiando el valor de hoy.

## 5. Del correo al paso

```
filtro (igual) ─▶ fragmento + enlaces ─▶ candidatas por código ─▶ modelo con contexto ─▶ verificación por código ─▶ núcleo
                  (los enlaces quedan      id del aviso, hilo,       elige postulaciones,    ids dentro de las          señales en 1..n,
                   en tu máquina)          remitente, empresa,       detecta el paso,         candidatas, reglas         paso nuevo o
                                           cargo                     cierra pasos hechos      seguras mandan             pasos cerrados
```

### 5.1 Candidatas por código (antes del modelo)

`dominio/asociacion.py` pasa de «una o la bandeja» a **una lista de candidatas con su motivo**, en este orden:

| Regla | Qué compara | Tipo |
|---|---|---|
| **Id del aviso** | Números de 6 o más dígitos y URLs de avisos del asunto y del fragmento contra el id de la URL de cada postulación (Chiletrabajos `…-3916453`, Teamtailor `/jobs/8632917-…`, LinkedIn `/jobs/view/…`, trabajando, Computrabajo, Get on Board), con la misma plataforma | **Segura** |
| **Mismo hilo** | `In-Reply-To` o `References` contra un correo ya asociado | **Segura** |
| Remitente personal | La dirección de una persona (no `noreply`, no una plataforma) que ya mandó señales a una postulación | Candidata |
| Empresa, dominio y cargo | Lo de hoy, pero devuelve hasta 8 candidatas con puntaje en vez de una sola | Candidata |

Se consideran todas las postulaciones, también las cerradas: un correo de una postulación rechazada se asocia igual (R12 ya lo baja de prioridad).

### 5.2 Clasificación con contexto (prompt v2)

El modelo recibe lo de hoy (dominio, plataforma detectada, asunto, fragmento) **más** las candidatas, cada una con:
- un id corto (`p1`, `p2`…; los UUID no salen), empresa, cargo, estado actual;
- sus pasos pendientes (id corto, tipo, descripción, plazo);
- sus pasos cerrados en los últimos 30 días (descripción, cómo y cuándo se cerró);
- sus 3 últimas señales (fecha y resumen).

Devuelve lo de hoy más:

| Campo | Qué es |
|---|---|
| `postulaciones` | Ids cortos de las candidatas a las que corresponde el correo (puede ir vacío) |
| `paso` | `null` o `{tipo, descripcion, plazo, enlace, mismo_que}`. `mismo_que` = el id de un paso pendiente si el correo solo lo recuerda (no se crea otro; se actualiza el plazo si cambió) |
| `pasos_cumplidos` | Ids de pasos pendientes que este correo da por hechos («recibimos tu test»), cada uno con su confianza |

El prompt trae ejemplos negativos: «completa tu perfil para destacar», alertas de empleo y boletines **no** son pasos. Costo: unas 600 fichas (tokens) más por correo; con `gpt-6-luna` sigue siendo menos de un centavo de dólar al mes.

### 5.3 Verificación por código (el modelo propone, el código decide, IAAPP-008)

1. Si hubo una regla segura, **esas postulaciones mandan**; el modelo puede sumar otras solo si también son candidatas con empresa coincidente.
2. Sin regla segura, se aceptan las que eligió el modelo **solo si** están entre las candidatas y su empresa coincide (puntaje de empresa ≥ 0,8). Si eligió una que no cumple o no eligió ninguna, va a la bandeja con las candidatas preseleccionadas.
3. Los ids que no estaban en la lista se descartan y quedan en la traza (como las citas de Preguntar).
4. El paso se registra solo si `es_postulacion` es verdadero.

### 5.4 Enlaces sin sacar tokens de tu máquina

Los enlaces de un correo de un portal suelen traer un token personal. Si se aprueba guardar enlaces (pregunta 5): el lector saca los `href` del HTML **en local**, guarda solo los de dominios del remitente o de plataformas conocidas en `ia.correo.enlaces`, y en el fragmento los reemplaza por `[enlace 1]`, `[enlace 2]`. El modelo responde `enlace: 1` y el código pone la URL real. El token nunca va a OpenAI.

### 5.5 Correos ya leídos

`uv run ia pasos reprocesar --dias 30` vuelve a clasificar con el prompt v2 los correos guardados de postulaciones **abiertas** (el fragmento ya está en `ia.correo`) y solo crea pasos; no vuelve a registrar señales. Lo corres tú, una vez, al terminar la fase P2.

## 6. Reglas nuevas del núcleo

| Id | Regla | Efecto |
|---|---|---|
| R15 | Un paso tiene al menos una postulación; `descripcion` de 3 a 120 caracteres; `tipo` de la lista | `VALIDACION` |
| R16 | Un paso se resuelve a `hecho` o `descartado` y se puede **reabrir** a `pendiente`; nunca se borra. Cada cambio guarda `por`, `en` y la nota | evento `paso.resuelto` |
| R17 | Al pasar una postulación a un estado terminal, sus pasos pendientes que **solo** tocan postulaciones terminales pasan a `descartado` con `por: sistema` y la nota «la postulación se cerró». Reabrir la postulación no reabre sus pasos | mismo caso de uso y misma transacción que `cambiar_estado` |
| R18 | Un paso que llega para postulaciones que ya están todas cerradas se guarda directo como `descartado` (queda como contexto, no se resalta) | |
| R19 | Un mismo correo crea a lo más un paso (`referencia_externa` única); si el modelo dice `mismo_que`, se actualiza el plazo del existente | `YA_EXISTE` se ignora en silencio solo para el servicio con IA |
| R20 | Un correo posterior puede cerrar un paso (`por: correo`) si la confianza es ≥ 0,9 (pregunta 3). Si no, queda como sugerencia «Este correo parece decir que ya lo hiciste» con un botón | evento `paso.resuelto` |

Un paso pendiente **no cambia la prioridad** de la postulación (R12 queda igual): su urgencia ya se ve en el borde y en el plazo.

## 7. Consola

### 7.1 Tarjeta del tablero

Se muestra **solo en tarjetas abiertas** (las de «Cerradas» no tienen pasos pendientes por R17 y R18). Si hay más de un paso, se ve el de plazo más cercano y «+1». El estilo del borde lo eliges tú (pregunta 2); las tres opciones están dibujadas en el artifact:

| Opción | Cómo se ve | Con discrepancia a la vez |
|---|---|---|
| A · Borde azul y franja | Borde de 1,5 px en `acento` y una franja abajo en `acento-suave` con el ícono del tipo, la descripción, el plazo y **Hecho** | La franja amarilla de discrepancia va arriba de la azul; el borde queda azul |
| B · Barra lateral | Barra de 4 px en `acento` a la izquierda (el borde de siempre no cambia) y una línea del paso dentro de la tarjeta con **Hecho** | Conviven sin competir: amarillo abajo, azul a la izquierda |
| C · Anillo y etiqueta | Anillo doble en `acento-suave` con borde `acento` y una etiqueta «Paso pendiente» arriba a la derecha; **Hecho** dentro | Igual que A |

Azul porque en «Cálida» (D22) el azul es el color de las acciones y el amarillo es de avisos y discrepancias; el terracota queda solo para la barra lateral. Un plazo de hoy o mañana usa `prioridad-alta`, igual que el cierre del aviso. El botón **Hecho** marca el paso con `por: persona` y sale un toast con **Deshacer**.

### 7.2 Ficha

Sección **Pasos** arriba de la línea de tiempo: pendientes primero (tipo, descripción, plazo, enlace «Abrir ↗», de qué correo vino, otras postulaciones a las que toca) con **Hecho**, **Descartar** y **Editar**; los cerrados abajo, plegados, con quién y cuándo. La línea de tiempo suma «Paso pedido» y «Paso hecho (tu IA)». Botón **+ Paso** para crear uno a mano.

### 7.3 Tablero, bandeja y barra lateral

- Chip **«N pasos pendientes»** al lado de los filtros: lo activas y el tablero muestra solo las tarjetas con pasos.
- Bandeja: «Asociar» permite elegir **varias** postulaciones, con las candidatas ya marcadas; si el correo pidió un paso, se ve «Pide: …».
- Textos en `es` y `en` (Transloco, D24).

## 8. API y MCP

**REST** (`/api/v1`, mismo filtro de errores y mismos códigos):

| Ruta | Qué hace |
|---|---|
| `GET /pasos?estado=&postulacionId=` | Lista de pasos con sus postulaciones (empresa y cargo) |
| `POST /pasos` | Crea uno a mano o desde tu IA: `{postulacionIds, tipo, descripcion, plazo?, enlace?}` |
| `PATCH /pasos/:id` | Edita descripción, plazo, enlace o postulaciones (`version`) |
| `POST /pasos/:id/resolver` | `{estado: hecho | descartado | pendiente, nota?, version}` |
| `POST /senales` | Suma `postulacionIds[]` (se mantiene `postulacionId`), `paso?` y `pasosCumplidos?` (token `servicio`) |
| `POST /bandeja/:id/asociar` | Acepta `postulacionIds[]` |
| `GET /postulaciones/tablero` y `/:id` | Suman `pasosPendientes` (los de la tarjeta) y, en el detalle, todos los pasos |

**MCP** (cada herramienta llama al mismo caso de uso que su ruta; origen `ia`):

| Herramienta | Para qué |
|---|---|
| `listar_pasos` | «¿Qué tengo pendiente?» con filtros de estado y postulación |
| `registrar_paso` | Tu IA crea un paso que vio fuera del correo (por ejemplo, en un mensaje de LinkedIn) |
| `resolver_paso` | «Ya hice el test de Lanek»: hecho, descartado o reabrir, con nota |
| `asociar_senal` | Acepta varias postulaciones |
| `ver_postulacion`, `resumen`, `exportar` | Incluyen los pasos |

Las instrucciones del servidor MCP suman una línea: cuando la persona diga que completó algo que una postulación pedía, usa `resolver_paso`.

**Eventos (outbox):** `paso.detectado` (prioridad alta si alguna postulación está abierta) y `paso.resuelto`. Las notificaciones de F3 los toman sin cambios en su forma.

## 9. Pruebas

| Nivel | Qué | Dónde |
|---|---|---|
| Dominio núcleo | R15 a R20, cada una con un caso que pasa y uno que falla; R17 con un paso de dos postulaciones donde solo una se cierra | Vitest, sin base |
| Casos de uso | Recibir una señal para 3 postulaciones (3 señales, 1 paso); dedupe por postulación; cerrar postulación descarta pasos en la misma transacción | Vitest con repositorios en memoria |
| Persistencia | Migración aplicada a una copia de la base real (señales con la misma referencia en dos postulaciones); paso con dos postulaciones ida y vuelta | Vitest contra `brecha_pruebas` |
| REST y MCP | Una prueba por ruta y por herramienta, éxito y error; contrato regenerado | Vitest |
| Dominio IA | Id del aviso por plataforma (incluido `#3916453` contra `…-3916453`), hilo, verificación de ids del modelo, enlaces reemplazados | pytest |
| Aplicación IA | Clasificar con contexto usando un modelo falso; núcleo caído deja el correo en cola; reprocesar no duplica | pytest |
| Consola | Store del tablero y de pasos; Playwright: una tarjeta con paso muestra el borde, **Hecho** lo quita y **Deshacer** lo devuelve; axe sin violaciones | Vitest + Playwright |
| Evaluación | `correos.jsonl` suma `postulaciones_esperadas` y `paso_esperado`; 4 correos inventados nuevos en `datos/ejemplo/` (test con id, recordatorio, «gracias por completar», boletín con «completa tu perfil») | `uv run ia evaluar` |

**Umbrales nuevos** (laxos, como D30): ≥ 80 % de los pasos esperados detectados, a lo más 1 paso inventado en el set, 100 % de asociación correcta en los correos que traen id del aviso, ≥ 75 % en los de varias postulaciones.

## 10. Fases con checkpoint

| Fase | Qué | Hecho cuando |
|---|---|---|
| **P0 · Plan** | Este documento y su artifact | Juan aprueba y responde las preguntas |
| **P1 · Núcleo** | Agregado `Paso`, R15 a R20, migración, señales en varias postulaciones, bandeja con candidatas, REST, MCP, eventos, contrato | Pruebas por nivel en verde; desde Claude Code: `registrar_paso`, `listar_pasos` y `resolver_paso` contra tu base |
| **P2 · Servicio con IA** | Candidatas por código (id del aviso, hilo, remitente), prompt v2 con contexto, verificación, enlaces, Alembic, `ia pasos reprocesar` | El correo de Lanek reprocesado se asocia solo y crea el paso; 5 correos reales bien clasificados a mano |
| **P3 · Consola** | Tarjeta con el estilo elegido, sección Pasos en la ficha, chip del tablero, bandeja con varias, `es` y `en` | Playwright y axe en verde; lo ves en la app con tus datos |
| **P4 · Evaluación y cierre** | Sets con pasos, umbrales, docs (PLAN D49+, `backend.md`, `ui.md`, `f2.md`), AIOS, PR hacia `f2` | Los sets pasan; CI verde; mergeas tú |

P1 va primero porque fija el contrato. P2 y P3 pueden ir en paralelo cuando P1 esté en `f2-pasos`.

## 11. Riesgos

- **Pasos inventados** por correos de marketing («completa tu perfil»): ejemplos negativos en el prompt, umbral de pasos inventados en la evaluación y **Descartar** a un clic (lo descartado también entra como contexto).
- **Un número del correo que coincide por azar** con el id de un aviso: se exige la misma plataforma y 6 o más dígitos.
- **Más datos tuyos hacia OpenAI:** empresa, cargo, estado y pasos de hasta 8 candidatas por correo (pregunta 1). Conexiones lo dice en «qué sale de tu máquina».
- **Cambiar la unicidad de `referencia_externa`** toca la deduplicación de hoy: la migración se prueba contra una copia de tu base antes de aplicarla a la real.

## 12. Decisiones y autoría

| # | Decisión | Autor | Estado |
|---|---|---|---|
| J1 | Un correo se asocia a una **o más** postulaciones | Juan | Pedido |
| J2 | Un correo que pide algo resalta las tarjetas con **un borde** | Juan | Pedido |
| J3 | El paso se marca hecho **a mano o pidiéndoselo a la IA** por MCP | Juan | Pedido |
| J4 | El siguiente correo se interpreta **sabiendo qué pasos se hicieron** | Juan | Pedido |
| J5 | Planificar primero, con checkpoints por fase | Juan | Pedido |
| a | El paso es un agregado propio ligado a 1..n postulaciones, no un campo de la señal (4.1) | Claude | Propuesta |
| b | Un paso no cambia ni el estado ni la prioridad; R11 y D27 quedan como están | Claude | Propuesta |
| c | Reglas seguras por id del aviso y por hilo antes del modelo; el código verifica lo que elige el modelo (5.1, 5.3) | Claude | Propuesta |
| d | Al cerrar una postulación sus pasos se descartan solos (R17), por el caso de Lanek | Claude | Propuesta |
| e | Pasos también a mano (`+ Paso`) y por MCP (`registrar_paso`), no solo desde correos | Claude | Propuesta |
| f | Chip de filtro en el tablero en vez de una pantalla nueva | Claude | Propuesta |
| g | Reprocesar los correos de los últimos 30 días de postulaciones abiertas | Claude | Propuesta |

## 13. Preguntas para Juan

1. **¿Quién asocia?** (a) Híbrido: el código arma candidatas y aplica las reglas seguras, el modelo elige entre ellas con el contexto y el código lo verifica (**recomendado**); (b) solo código, y el modelo solo detecta el paso de la postulación ya asociada (menos datos a OpenAI, pero «Tenpo, varios cargos» seguiría cayendo a la bandeja).
2. **Estilo del borde:** A, B o C (sección 7.1 y dibujos en el artifact). Recomiendo **B**, porque convive mejor con la franja de discrepancia.
3. **¿Un correo puede cerrar un paso solo?** (a) Sí, con confianza ≥ 0,9, como D27, y se puede reabrir (**recomendado**); (b) no, solo sugerirlo.
4. **Correo de varias postulaciones con estado sugerido seguro:** (a) se aplica solo si es **una** postulación; con varias queda como sugerencia (**recomendado**); (b) se aplica en cada una donde el salto es válido.
5. **¿Guardar el enlace del paso** (por ejemplo, al test)? (a) Sí, sacado en local y sin mandar el token a OpenAI (5.4) (**recomendado**); (b) no, se abre desde el correo.
6. **Rama:** `f2-pasos` desde `origin/f2` con PR hacia `f2`, como el CSV (**recomendado**), u otra.
