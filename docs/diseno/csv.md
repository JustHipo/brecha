# Importar y exportar CSV, etiquetas y stack con calce

Escrito el 24-nov-2026 sobre la rama `f2` (PR borrador #5). Pedido de Juan a través de la sesión «tami practica»: Tamara va a instalar una Brecha nueva y cargarle un CSV de prácticas y otro de contactos de LinkedIn. Estado: **aprobado** el 24-nov-2026 (artifact «Plan CSV de Brecha», respuestas en §9).

## 1. Qué se hace

1. **Importar postulaciones** desde un CSV (consola, línea de comandos y MCP). Idempotente por URL del aviso: si la URL ya está, la fila queda como «ya estaba» y no se toca nada.
2. **Importar contactos** de LinkedIn desde un CSV, con el mismo caso de uso que `registrar_contacto_red` (idempotente por perfil) y ligados a la postulación de `url_postulacion`.
3. **Etiquetas** en la postulación (objeto de valor), con filtro en Lista, Tablero, API y MCP.
4. **Stack con calce**: las filas con `stack` o `requisitos` crean su aviso en el servicio con IA, ligado a la postulación; la ficha y la tarjeta de Avisos muestran cada herramienta, en rojo las que faltan en el perfil.
5. **Exportar** postulaciones y contactos al mismo formato (consola y MCP). Exportar e importar en una Brecha vacía deja lo mismo (§6).
6. **Plantillas** de los dos CSV descargables desde la consola.

## 2. Formato (decidido por Juan)

Coma, UTF-8, con encabezado. Campos con coma, comilla o salto de línea van entre comillas dobles (RFC 4180). Listas dentro de una celda separadas por `;`.

**`postulaciones.csv`**

| Columna | Obligatoria | Valores | Va a |
|---|---|---|---|
| `titulo`, `empresa`, `url` | sí | texto; URL http(s) | `AvisoResumen` |
| `plataforma` | no (se deduce de la URL) | linkedin, trabajando, getonboard, computrabajo, chiletrabajos, indeed, sitio_empresa, otra | `AvisoResumen.plataforma` |
| `modalidad` | no (`no_indica`) | remoto, hibrido, presencial, no_indica | `AvisoResumen.modalidad` |
| `ubicacion` | no | texto | `AvisoResumen.ubicacion` |
| `cierre` | no | AAAA-MM-DD | `AvisoResumen.cierre` |
| `estado` | no (`sin_decidir`) | los 9 estados del núcleo (decisión de Juan, 24-nov) | se crea directo en ese estado con origen `importacion`, sin pasar por los intermedios ni abrir discrepancias |
| `prioridad` | no (la calcula el núcleo) | alta, media, baja | `prioridadFijada` (ver P2) |
| `fecha_postulacion` | desde `postulado` en adelante (ver P8 para rechazado y descartado) | AAAA-MM-DD | `fechaPostulacion` |
| `canal_tipo`, `canal_valor` | desde `postulado` en adelante | portal, email, formulario, referido | `Canal` (por dónde YA postuló, R2) |
| `correo_postulacion` | no | correo válido | `Contacto` de la postulación con rol «Postulación por correo» (no es el canal) |
| `sueldo_publicado` | no | texto libre del aviso | `AvisoResumen.sueldoPublicado` (no es `sueldoPretendido`) |
| `stack` | no | herramientas separadas por `;` | `AvisoResumen.stack` y aviso en Mercado |
| `requisitos` | no | texto libre | `AvisoResumen.requisitos` y aviso en Mercado |
| `etiquetas` | no | separadas por `;` | `Etiquetas` |
| `notas` | no | texto | una `Nota` por bloque (§6) |
| `motivo` (P3, opcional, columna 19) | no | texto | motivo del estado para `rechazado` y `descartado` (R5); si falta, «Importado desde CSV» |

**`contactos.csv`**

| Columna | Obligatoria | Va a |
|---|---|---|
| `nombre`, `perfil_url` | sí | `ContactoDeRed` (idempotente por perfil normalizado) |
| `titular`, `empresa` | no | `ContactoDeRed` |
| `url_postulacion` | no | liga el contacto a la postulación de esa URL; si no existe, se importa igual y la fila queda como **advertencia** |
| `correo`, `motivo`, `mensaje_sugerido` | no | notas del contacto, en líneas con etiqueta (§6) |

Encabezado: se aceptan las columnas en cualquier orden y sin distinguir mayúsculas; una columna obligatoria que falta corta la importación entera con un error claro (no hay filas que procesar); una columna desconocida es advertencia. Se quita el BOM si viene (Excel lo pone).

## 3. Resultado de una importación

```ts
interface ResultadoCsv {
  tipo: 'postulaciones' | 'contactos';   // reconocido por el encabezado si no se indica
  creadas: number;
  yaEstaban: number;      // misma URL (postulaciones), o mismo contacto sin cambios
  actualizadas: number;   // solo contactos: se le ligó otra postulación o se completaron datos
  errores: number;
  conAdvertencias: number;
  advertencias: string[]; // del archivo entero (columnas que no se usan)
  filas: { fila: number; resultado: 'creada' | 'ya_estaba' | 'actualizada' | 'error'; clave: string; id?: string;
           advertencias: string[]; codigo?: string; campo?: string; mensaje?: string }[];
}
```

`fila` es la línea del archivo donde empieza la fila (el encabezado es la 1), para que la persona la encuentre en su planilla; `campo` es la columna del CSV. Una advertencia no impide importar la fila. Una fila mala nunca corta las demás; cada fila se guarda en su propia transacción.

## 4. Cambios en el núcleo

### 4.1 Dominio (`postulaciones/dominio`)

- **`Etiquetas`** (objeto de valor, `objetos-valor/etiquetas.ts`): lista sin repetidos, cada una normalizada (minúsculas, sin tildes, espacios simples, 1 a 40 caracteres), máximo 20 por postulación. Ver P1.
- **`AvisoResumen`** suma `stack: string[]` (máx. 40, cada una hasta 60 caracteres), `requisitos?: string` (hasta 5.000) y `sueldoPublicado?: string` (hasta 200). Es la foto del aviso: el núcleo sigue sin leer la base `ia`.
- **`prioridadFijada?: Prioridad`** (P2). `calcularPrioridad` la usa solo en estados abiertos; los terminales siguen en `baja` (R12 no cambia para descartadas).
- `Postulacion.crear` acepta `etiquetas`, `prioridadFijada`; `editar` acepta `etiquetas` y `prioridad` (`null` vuelve a la calculada). Evento `postulacion.editada` no existe hoy: se reusa el guardado sin evento, como `editar` actual.

### 4.2 Persistencia

Una migración `20261126000000_csv_etiquetas` (con `migrate diff --script`, PRISMA-ARGOS-06): columnas `etiquetas text[] default '{}'`, `prioridad_fijada text null`, `aviso_stack text[] default '{}'`, `aviso_requisitos text null`, `aviso_sueldo_publicado text null`, e índice GIN sobre `etiquetas`. Las filas existentes quedan con listas vacías: no hace falta migración de datos.

### 4.3 Aplicación (`postulaciones/aplicacion/csv/`)

El módulo vive en `src/csv/` porque cruza postulaciones y red.
- `csv/aplicacion/formato.ts`: columnas (una sola constante para importar, exportar y la plantilla), puerto `LectorCsv`, fila → `FichaImportable`, notas de contactos con etiquetas y los ejemplos de la plantilla.
- `csv/infraestructura/lector-csv.ts`: adaptador con `csv-parse` 7.0.3 y `csv-stringify` 6.9.0 (P6). Corrige el número de línea porque csv-parse cuenta dos líneas por cada `\r\n` dentro de una celda.
- `ImportarPostulacionesCsv`: valida cada fila y llama a lo mismo que `ImportarFichas` (que se amplía con etiquetas, prioridad, stack, requisitos, sueldo publicado, correo de postulación y varias notas).
- `ImportarContactosCsv`: por fila, busca la postulación por URL (`repo.idPorUrl`) y llama a `RegistrarContacto` del módulo de red. Las notas se completan solo si el contacto no tenía (§6).
- **Contactos sin LinkedIn** (decisión de Juan del 24-nov, checkpoint de C1): `ContactoDeRed.perfilUrl` pasa a ser opcional (migración `20261126010000_red_sin_perfil`). Sin perfil, el contacto se reconoce por nombre y empresa (sin distinguir mayúsculas); la fila sale con advertencia. Una URL que no es de LinkedIn queda en las notas como «Página: …». El perfil se puede completar después (`PATCH /red/:id` o `editar_contacto_red` con `perfilUrl`), pero no cambiar por otro.
- `ExportarCsv`: arma los dos archivos desde `ConsultasDePostulaciones.exportar()` y `RedRepositorio.todos()`.
- `ConsultasDePostulaciones.listar` y `tablero` aceptan `etiqueta` (una o varias, todas deben estar).

### 4.4 Entradas

| Entrada | Qué |
|---|---|
| `POST /api/v1/csv/importar` | `{ csv: string, tipo? }` (hasta 5 MB; esa ruta acepta cuerpos de 6 MB) → `ResultadoCsv` |
| `GET /api/v1/csv/exportar/{tipo}` | Descarga `text/csv; charset=utf-8` con BOM y `Content-Disposition` |
| `GET /api/v1/csv/plantillas/{tipo}` | Encabezado más 2 filas de ejemplo inventadas |
| `GET /postulaciones?etiqueta=` · `GET /postulaciones/tablero?etiqueta=` | Filtro |
| `PATCH /postulaciones/:id` | Suma `etiquetas` y `prioridad` |
| `GET /api/v1/postulaciones/etiquetas` | Etiquetas en uso con su conteo (para el filtro) |
| MCP `exportar_csv {tipo}` · `importar_csv {csv, tipo?}` (P5) · `listar_etiquetas` | Mismos casos de uso |
| MCP `listar_postulaciones` (`etiqueta`), `editar_postulacion` (`etiquetas`, `prioridad`), `crear_postulacion` (`etiquetas`) | |
| `pnpm --filter nucleo importar archivo.csv [--contactos]` | Si la extensión es `.csv` usa el importador nuevo; `.json` sigue con el del artifact |

El contrato (`packages/contratos/openapi.json`) se regenera; el CI lo revisa.

## 5. Servicio con IA: stack con calce

El núcleo no llama al servicio con IA (hoy es al revés y así se queda). El servicio con IA ya lista las postulaciones del núcleo en cada vuelta (`VincularConPostulaciones`); se agrega un paso antes:

1. **`TraerAvisosDelNucleo`**: por cada postulación sin aviso en Mercado con esa URL (P4: todas entran al inventario), crea un `Aviso` con origen nuevo `importado_csv` (cita «Importado desde CSV»), `stack` de la columna y `texto` = requisitos (o el stack si no hay requisitos). Idempotente por URL.
2. **Requisitos** (P4): las herramientas del `stack` entran directo como requisitos obligatorios sin años, sin llamar al modelo; si además hay `requisitos` en texto y hay llave de OpenAI, el análisis de hoy los completa (deseables y años) y se juntan, mandando lo que escribió la persona.
3. El calce y el vínculo con la postulación siguen igual (`calcular_calce`, `VincularConPostulaciones`, `PATCH …/aviso`).
4. La consola, después de importar, llama `POST /api/ia/avisos/procesar` (nuevo, sin esperar el resultado) para que no haya que esperar la vuelta del vigía. Si la API de IA no responde, el vigía lo hace en su vuelta siguiente.

`NucleoHttp.postulaciones()` lee `aviso.stack` y `aviso.requisitos` de la lista (se suman a la vista de lista del núcleo).

## 6. Ida y vuelta (exportar e importar)

Qué se preserva: aviso completo (título, empresa, URL, plataforma, modalidad, ubicación, cierre, sueldo publicado, stack, requisitos), estado, fecha y canal de postulación, prioridad fijada (vacía si es la calculada), etiquetas, notas, correo de postulación; contactos con nombre, perfil, titular, empresa, postulaciones ligadas y sus notas.

Qué no viaja (a propósito, el CSV es para pasarle a otra persona sus postulaciones, no un respaldo): historial de cambios, señales, discrepancias, entrevistas, sueldo pretendido, contactos de la postulación que no son el de correo, interacciones de LinkedIn y seguimientos. El respaldo completo es `exportar` del MCP (JSON).

- **Varias notas**: se exportan en una celda separadas por una línea `---`; al importar se vuelven a separar en varias notas.
- **Notas de contactos**: la importación escribe `Correo: …`, `Motivo: …` y `Mensaje sugerido: …` en líneas propias. La exportación las vuelve a leer a sus columnas; el texto libre que no tenga etiqueta va a `motivo`.
- **Un contacto ligado a varias postulaciones** se exporta en una fila por postulación (el mismo perfil); al importar, el segundo y siguientes solo agregan el vínculo.
- **Contacto que ya existe**: se actualizan nombre, titular y empresa si vienen, se agrega el vínculo y las notas se escriben solo si estaban vacías. Si no cambió nada, «ya estaba».

**Prueba de ida y vuelta** (e2e del núcleo): base vacía → importar los CSV de ejemplo → exportar → base vacía → importar lo exportado → exportar de nuevo: los dos exportes son iguales byte a byte (salvo el orden, que se fija por URL y perfil).

## 7. Consola

- **Importar** (diálogo desde Lista, Tablero vacío y la paleta ⌘K): elegir archivo; el tipo se detecta por el encabezado; resultado con conteos y una tabla de filas con advertencia o error (número de fila, campo, mensaje). Enlaces a las dos plantillas.
- **Exportar**: botón en Lista que baja los dos archivos.
- **Etiquetas**: filtro en Lista y Tablero (selector con las etiquetas en uso), chips en la tarjeta y la fila, edición en la ficha (agregar y quitar).
- **Prioridad**: en la ficha, «Automática» o fijar alta, media o baja.
- **Stack** en la ficha: lista de herramientas pedidas. Las que faltan van con el token `brecha` (P7), un ícono ✕ y el texto «falta»; las que tienes, con ✓; las que tienes con menos años, «1 de 3 años». Sin perfil o sin análisis: la lista sin colores y un aviso de por qué. Lo mismo en la tarjeta de Avisos (máximo 8 herramientas y «+N»).
- Textos en `es.json` y `en.json`.

## 8. Pruebas y «hecho»

| Capa | Qué |
|---|---|
| Dominio | `Etiquetas` (normalización, límites, repetidos), `prioridadFijada` con estados abiertos y terminales, `AvisoResumen` nuevo |
| CSV | lector (comillas, saltos de línea, BOM, CRLF), filas válidas y cada error por campo |
| Aplicación | importar dos veces deja lo mismo; filas malas no cortan; contacto sin postulación es advertencia; ida y vuelta |
| API | cada ruta nueva, éxito y error; filtro por etiqueta; contrato |
| MCP | `importar_csv`, `exportar_csv`, filtro y edición de etiquetas |
| IA (pytest) | `TraerAvisosDelNucleo` idempotente; requisitos desde el stack; calce con perfil |
| Consola (Vitest) | store de importación y de etiquetas |
| e2e (Playwright) | importar los CSV de ejemplo, ver el informe, filtrar por etiqueta, ver el stack en la ficha, exportar |
| App instalada | Brecha vacía al lado (`BRECHA_PUERTOS` y otra carpeta de instancia): importar los CSV de Tamara dos veces, exportar, reimportar en otra vacía |

**Hecho cuando:** importar dos veces deja lo mismo; las filas malas se informan sin cortar; la ida y vuelta coincide; dominio, API y e2e en verde; funciona en la app instalada.

## 9. Decisiones de Juan (24-nov-2026, respuestas del artifact)

| # | Pregunta | Respuesta |
|---|---|---|
| P1 | Normalizar etiquetas | Sí: se comparan en minúsculas y sin tildes (`investigación` = `investigacion`) |
| P2 | Prioridad fijada | Sí: manda en los estados abiertos; las cerradas siguen en baja; editable en ficha y MCP |
| — | Estados | Los 9 (vía «tami practica»): desde `postulado` en adelante se exigen fecha y canal; se crean directo con origen `importacion`, sin discrepancias |
| P3 | Motivo de rechazado y descartado | Columna opcional `motivo` (la 19); si falta, «Importado desde CSV» |
| P8 | Descartado sin postular | `rechazado` exige fecha y canal; `descartado` no, pero si trae uno pide el otro |
| P4 | Stack como requisitos | Directo, sin modelo; el modelo solo completa con el texto de `requisitos`. **Comentario de Juan:** las importadas por CSV tienen que quedar con seguimiento igual que las demás (correo y su IA por MCP) y entrar al inventario de avisos. Por eso `TraerAvisosDelNucleo` crea el aviso para **toda** postulación sin aviso en Mercado, traiga o no stack (sin stack queda sin calce) |
| P5 | Importar por MCP | Sí, `importar_csv` |
| P6 | Lector de CSV | `csv-parse` y `csv-stringify` |
| P7 | Rojo de las brechas | Opción A: token `brecha` `#B42318` sobre `brecha-fondo` `#FDECEA` (5,8:1) |

## 10. Fases

| Fase | Qué | Checkpoint |
|---|---|---|
| C1 | Dominio y datos: etiquetas, prioridad fijada, aviso con stack, requisitos y sueldo publicado; migración; filtros en API y MCP | ✓ |
| C2 | CSV en el núcleo: lector, importar postulaciones y contactos, exportar, plantillas; REST, MCP y CLI; ida y vuelta | ✓ |
| C3 | Servicio con IA: traer avisos del núcleo, requisitos desde el stack, `procesar` | ✓ |
| C4 | Consola: importar, exportar, plantillas, etiquetas, prioridad, Stack en ficha y Avisos; e2e | ✓ |
| C5 | App instalada con los CSV de Tamara, docs y PR hacia `f2` | ✓ |
