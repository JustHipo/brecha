# Plan detallado de la UI

Escrito el 23-nov-2026 sobre `docs/PLAN.md` v4 y `docs/diseno/backend.md` (aprobado). **Aprobado por Juan el 23-nov-2026** con la dirección visual D22 («Cálida», barra terracota). Las maquetas que mandan sobre los dibujos en texto de este documento están en https://claude.ai/artifact/XuQMrzncy3ysvrSx3yMZud, página «Maquetas v2». F1 va al detalle de pantallas, estados e interacciones; F2 y F3 a nivel de qué muestra cada pantalla. Lo visual (paleta, tipografía, claro u oscuro) sale de F1-00 (D21) y lo eliges tú; este plan define estructura y comportamiento, no colores.

## 1. Principios

- **Escritorio:** ventana de Electron, diseñada para 1280 a 1440 px de ancho y usable desde 1100 px. Sin versión de celular (D15).
- **Español e inglés:** todo texto visible sale de la capa de idioma, incluidos los mensajes de error por `codigo` (D16).
- **Spartan sobre Tailwind 4** (D20): los componentes se copian al repo (`libs/ui`) y se editan; el drag and drop usa Angular CDK.
- **La API manda:** la consola nunca decide si una transición vale. Muestra solo `transicionesPosibles` y, si la API rechaza algo, vuelve atrás y lo explica.
- **Nada silencioso:** si la IA no está disponible, si hay correos en cola o si un movimiento abrió una discrepancia, se ve.
- **Teclado primero:** todo lo que se hace arrastrando se puede hacer con el teclado (menú «Mover a…»), y hay paleta de comandos con ⌘K.

## 2. Arquitectura de la consola

```
apps/consola/src/app/
├── nucleo/                 (core) cliente de la API, interceptores, acceso, idioma, errores, flujo de eventos
│   ├── api/                tipos generados desde packages/contratos + servicios delgados por recurso
│   ├── acceso/             token, guard condicionado a la clave
│   ├── errores/            interceptor que traduce `codigo` a clave de idioma y toast
│   ├── eventos/            cliente SSE de /eventos/stream (F1); Socket.IO en F3
│   └── idioma/             configuración de Transloco, formato de fechas y montos
├── ui/                     componentes de Spartan copiados y ajustados (botón, diálogo, hoja lateral, select, tabla, toast, comando…)
├── compartido/             piezas propias: insignia de estado, punto de prioridad, tarjeta de postulación, línea de tiempo
└── funciones/              una carpeta por pantalla, cargada con lazy loading
    ├── acceso/             Desbloquear
    ├── tablero/            Tablero + TableroStore
    ├── lista/              Lista
    ├── postulacion/        Ficha, Nueva, diálogos
    ├── bandeja/ (F2) · avisos/ (F2) · preguntar/ (F2) · conexiones/ (F2)
    └── ajustes/ (F3) · notificaciones/ (F3)
```

- **Estado con signals:** un store por pantalla (`TableroStore`, `FichaStore`, `ListaStore`) con `signal` para el estado, `computed` para columnas y conteos, y métodos que llaman a la API. Sin NgRx: no hace falta para este tamaño.
- **Cliente de la API:** `HttpClient` tipado con los tipos de `openapi-typescript` (`paths`, `components`). Si el contrato cambia, la consola no compila.
- **Interceptores:** `tokenInterceptor` (pone el token), `erroresInterceptor` (convierte el cuerpo `{codigo, mensaje, campo}` en un `ErrorDeApi` tipado; los 401 mandan a Desbloquear si hay clave).
- **Actualización en vivo (F1):** el cliente SSE escucha `/eventos/stream`; cada store se refresca solo cuando llega un evento de una postulación que tiene en pantalla. En F3 se cambia por Socket.IO sin tocar los stores (mismo servicio `Eventos`).
- **Fechas y montos:** `Intl` con el idioma activo; luxon ya viene como dependencia de Spartan para el selector de fecha.

## 3. Rutas y estructura de la ventana

| Ruta | Pantalla | Fase |
|---|---|---|
| `/desbloquear` | Desbloquear | F1 (solo con clave) |
| `/tablero` (inicio) | Tablero | F1 |
| `/lista` | Lista | F1 |
| `/postulaciones/nueva` | Nueva postulación | F1 |
| `/postulaciones/:id` | Ficha | F1 |
| `/bandeja` · `/avisos` · `/avisos/:id` · `/preguntar` · `/conexiones` | Bandeja, Avisos, Preguntar, Conexiones | F2 |
| `/ajustes` | Ajustes | F3 |

**Marco de la ventana:**
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ◧ Brecha     [ Buscar o ejecutar…  ⌘K ]           ● IA lista  🔔 3   ES ▾      │  barra superior
├──────────────┬────────────────────────────────────────────────────────────────┤
│ Tablero      │                                                                │
│ Lista        │                     contenido de la ruta                       │
│ Bandeja  (2) │                                                                │
│ Avisos       │                                                                │
│ Preguntar    │                                                                │
│              │                                                                │
│ Ajustes      │                                                                │
└──────────────┴────────────────────────────────────────────────────────────────┘
```
- **Barra superior:** búsqueda y paleta de comandos (⌘K: ir a una postulación, crear, cambiar idioma), indicador del estado del sistema (modo completo, IA lista o no, correos en cola desde F2), campana (F3) e idioma.
- **Barra lateral:** navegación; los ítems de F2 y F3 aparecen cuando existen. Contador en Bandeja.

## 4. Pantallas de F1

### 4.1 Desbloquear
Solo si configuraste una clave. Un campo de clave y un botón. Con clave mala: «La clave no es correcta» (un solo mensaje). Enter envía. Sin clave configurada, esta ruta no existe y la consola abre en el Tablero.

### 4.2 Tablero
```
 Filtros: [Plataforma ▾] [Prioridad ▾] [Buscar…]                         [+ Nueva]
┌ Sin decidir 12 ┐┌ Por postular 8 ┐┌ Postulado 15 ┐┌ En proceso 3 ┐┌ Entrevista 2 ┐┌ Oferta 0 ┐┌ Cerradas 9 ▸ ┐
│ ● Kora         ││ ● Quantix      ││ ● Andes Lab  ││              ││ ● Pampa  ⚠   ││          ││ aceptada 0    │
│ Back-end NestJS││ Full Stack     ││ Full Stack   ││              ││ Backend      ││          ││ rechazado 3   │
│ GetOnBoard · 4d││ LinkedIn       ││ LinkedIn ✉1  ││              ││ trabajando   ││          ││ descartado 6  │
└────────────────┘└────────────────┘└──────────────┘└──────────────┘└──────────────┘└──────────┘└───────────────┘
```
- **Columnas:** los 6 estados abiertos, más «Cerradas» colapsada (aceptada, rechazado, descartado), que se abre como hoja lateral.
- **Tarjeta:** punto de prioridad, empresa, título, plataforma, días al cierre (resaltado si faltan 2 o menos), ícono con el número de señales nuevas, y borde y ⚠ si hay discrepancia abierta. Clic: abre la Ficha. Menú «⋯»: Mover a…, Abrir aviso, Agregar nota.
- **Orden dentro de cada columna:** prioridad, después cierre más cercano, después última actualización.
- **Arrastrar (flujo completo):**
  1. Al soltar, la tarjeta se mueve de inmediato en pantalla (actualización optimista).
  2. Si el destino pide datos (R2: fecha y canal para `postulado`; R5: motivo para `rechazado` y `descartado`), se abre el diálogo antes de llamar a la API. Si cancelas, la tarjeta vuelve.
  3. Se llama a la transición con `origen: 'tablero'` y la `version` de la tarjeta.
  4. **422** (`TRANSICION_INVALIDA`, `AVISO_CERRADO`): la tarjeta vuelve y sale un toast con el mensaje traducido.
  5. **409** (`CONFLICTO`): la tarjeta se recarga desde la API y sale «Esta postulación cambió en otro lado; revisa y vuelve a intentar».
  6. **Éxito con discrepancia nueva:** la tarjeta queda con ⚠ y sale un toast «Este movimiento no calza con el último correo» con botón «Ver».
- **Columnas destino válidas:** al empezar a arrastrar, las columnas que no están en `transicionesPosibles` de esa tarjeta se atenúan y no aceptan la tarjeta. Así el error 422 queda para casos raros.
- **Teclado:** con una tarjeta enfocada, Enter abre la Ficha y M abre «Mover a…» con solo los destinos posibles.
- **Estados:** cargando (columnas con tarjetas esqueleto), vacío (sin postulaciones: botón «Importar fichas» y «Nueva postulación»), error de red (aviso arriba con «Reintentar»).

### 4.3 Lista
Tabla de Spartan con columnas: prioridad, empresa, título, plataforma, estado, cierre, actualizada. Filtros por estado (varios), plataforma, prioridad y texto; orden por columna; paginación con `limit` y `offset` y el total. Fila: clic abre la Ficha. Es la vista para buscar y revisar, no para mover.

### 4.4 Ficha de postulación
```
 ← Tablero    Kora · Back-end Software Engineer NestJS               ● alta
 [Postulado ▾]   Acciones: [En proceso] [Entrevista] [Rechazada…] [Descartar…]
┌─ ⚠ Este movimiento no calza: moviste a Entrevista el 23-nov y el 21-nov llegó un rechazo ─┐
│                                            [Mantener mi movimiento] [Corregir estado…]     │
└────────────────────────────────────────────────────────────────────────────────────────────┘
┌ Línea de tiempo ───────────────────────────┐ ┌ Aviso ──────────────────────────────────┐
│ 23-nov  Movida a Entrevista (tablero)      │ │ Get on Board · remoto · cierra 30-nov   │
│ 21-nov  ✉ Correo: «No continuaremos…»      │ │ Abrir aviso ↗                           │
│         sugiere Rechazado · 0,92 [Aplicar] │ ├ Postulación ───────────────────────────┤
│ 15-nov  Postulada (formulario) · portal    │ │ Canal: portal · Sueldo: USD 3.000/mes   │
│ 10-nov  Creada (importación)               │ ├ Contactos ──────────────────── [+]     │
│ ─────────────────────────────              │ ├ Entrevistas ─────────────────── [+]    │
│ [Escribir una nota…]          [Agregar]    │ └────────────────────────────────────────┘
└────────────────────────────────────────────┘
```
- **Encabezado:** empresa y título, prioridad, estado actual y botones solo para `transicionesPosibles` (cada uno abre el diálogo que su regla pide).
- **Discrepancias abiertas:** banda arriba con «Mantener mi movimiento» (confirmar) y «Corregir estado…» (elige entre los destinos válidos).
- **Línea de tiempo:** mezcla cambios de estado (con su origen: tablero, formulario, IA, señal, importación), señales (con fuente, resumen, estado sugerido, confianza y botón «Aplicar» si no está aplicada), entrevistas y notas, del más nuevo al más antiguo. Abajo, el campo para una nota.
- **Panel derecho:** aviso (con enlace), postulación (canal, fecha, sueldo pretendido; editable en línea con versión), contactos y entrevistas (con resultado editable).
- **Señal a mano (F1):** botón «Registrar señal» en la línea de tiempo: fuente, resumen, estado sugerido y confianza. Sirve para probar R11 y R13 antes de F2.

### 4.5 Nueva postulación
Formulario reactivo tipado: título, empresa, URL, plataforma, modalidad, ubicación, cierre (opcional), estado inicial (por defecto «Sin decidir»), sueldo pretendido (opcional). Validación en vivo (URL válida, campos obligatorios). Si la API responde `YA_EXISTE`: «Ya sigues este aviso» con enlace a esa postulación.

### 4.6 Diálogos
| Diálogo | Se abre al | Campos |
|---|---|---|
| Postular | Mover a `postulado` | Fecha de postulación (por defecto hoy, no futura), canal (tipo y valor) |
| Cerrar | Mover a `rechazado` o `descartado` | Motivo (obligatorio). En `descartado`, aviso: «Si llega algo de esta postulación te avisaré con prioridad baja» |
| Entrevista | Agendar | Fecha y hora, tipo, con quién |
| Contacto | Agregar contacto | Nombre, rol, correo o LinkedIn (al menos uno) |
| Señal | Registrar señal | Fuente, resumen, estado sugerido, confianza |
| Corregir estado | Resolver discrepancia | Destino entre los válidos y, si corresponde, los campos de Postular o Cerrar |

Todos validan en el cliente lo que el dominio exige (para no hacer viajes de más), pero el error final siempre viene de la API y se muestra en el campo indicado por `campo`.

### 4.7 Avisos y toasts
- Toast para el resultado de cada acción y para los errores de la API (mensaje por `codigo`, traducido).
- Errores de red: banda persistente arriba con reintento, no un toast que se pierde.

## 5. Pantallas de F2 y F3 (qué muestran)

| Pantalla | Qué muestra | Acciones |
|---|---|---|
| Bandeja (F2) | Señales sin postulación: remitente, asunto, resumen, empresa y cargo detectados, confianza | Asociar a una postulación (buscador), crear postulación nueva con los datos, descartar la señal |
| Conexiones (F2) | Correo, proveedor de IA (OpenAI o local) y Get on Board: estado, última revisión, qué sale de tu máquina y hacia dónde | Conectar, probar, desconectar |
| Avisos (F2) | Avisos con calce, brechas y herramientas pedidas | Filtrar, «Seguir» (crea la postulación) |
| Preguntar (F2) | Chat con respuestas que citan avisos | Abrir el aviso citado |
| Notificaciones (F3) | Campana con dos grupos: prioridad alta y el resto | Ir a la postulación, marcar como vista |
| Ajustes (F3) | Clave local, aplicar señales seguras y umbral, frecuencia del vigía, hooks, resumen diario, idioma, tokens de MCP y del vigía (regenerar) | Guardar |

Indicador de estado del sistema en la barra superior desde F2: «IA lista», «IA no disponible: 12 correos en cola» o «Modelo local: se clasifica con la app abierta».

### 5.1 Pasos pendientes (24-nov-2026, D51)
- **Tarjeta:** barra azul de 4 px a la izquierda (opción B) y un bloque en `acento-suave` con el paso de plazo más cercano, el plazo (naranja si vence hoy o mañana), «+N» si hay más y **Hecho** (toast con **Deshacer**). También en las tarjetas del panel «Cerradas».
- **Tablero:** chip «N pasos pendientes» que filtra las tarjetas con pasos; el botón «Cerradas» dice cuántas cerradas esconden uno.
- **Ficha:** sección **Proceso** (componente `b-proceso`) con los pasos pedidos y hechos en orden, mezclados con los cambios de estado; **Hecho**, **Descartar**, **Editar**, **Reabrir**, **Abrir ↗** y **+ Paso** (pendiente o ya hecho).
- **Cerrar:** el diálogo de rechazado o descartado lista los pasos pendientes con «Descartar estos pasos» marcado.
- **Bandeja:** «Pide: …» y asociar a varias postulaciones, con las sugeridas por la IA marcadas.

## 6. Idioma

- **Transloco 8.4** (D24, decidido el 23-nov): cambia de idioma sin recompilar, que es lo que se necesita para elegirlo en Ajustes. La alternativa integrada de Angular compila una versión por idioma.
- Archivos `assets/i18n/es.json` y `en.json`, con claves por pantalla (`tablero.columnas.sin_decidir`) y una sección `errores.<CODIGO>`.
- Los nombres de los estados y plataformas se traducen en la consola; la API solo manda claves.
- El CI revisa que `es.json` y `en.json` tengan las mismas claves.

## 7. Tema visual (D22, «Cálida» con barra terracota)

Referencias de Refero elegidas por Juan: 2 Marathon (tarjetas y columnas vacías), 4 Fibery (etiqueta de plataforma y filas de datos), 5 y 9 Homerun (barra lateral, títulos gruesos, botones en píldora, banda de aviso, etapas apiladas, panel de actividad), 6 Teal (embudo de etapas en flechas).

| Token | Valor | Uso |
|---|---|---|
| `fondo` | `#FFFFFF` | Fondo de la ventana y de las tarjetas |
| `superficie` | `#F7F5F2` | Campos, bloque de etapas, columnas vacías |
| `superficie-panel` | `#FAF8F5` | Panel de actividad de la ficha |
| `linea` | `#E7E2DA` | Bordes y divisores |
| `tinta` | `#26211E` | Texto principal |
| `tinta-suave` | `#6B645E` | Texto secundario |
| `acento` | `#3D63DD` (hover `#2A4BB5`) | Botón principal, etapa actual, selección |
| `barra` | degradé `#BF5A2F` → `#873719` | Solo la barra lateral, con texto blanco y secundario `#F7D6C6` |
| `aviso-fondo` / `aviso-borde` / `aviso-tinta` | `#FFF6D6` / `#F1DF9B` / `#7A5300` | Discrepancias y avisos |
| `prioridad-alta` / `media` / `baja` | `#E2622B` / `#D9A21B` / `#A8A19A` | Punto de prioridad (siempre con texto al lado) |
| `ok` | `#2F9E6B` | Etapas hechas, estado de la IA |
| Plataformas (fondo / texto) | LinkedIn `#E7EEF9`/`#1E4E95`, Get on Board `#EFE8F8`/`#5B3593`, trabajando `#FBEBDD`/`#9A4207`, Computrabajo `#E3F2E8`/`#1D6638`, otras `#EEEEEC`/`#4A4743` | Etiqueta en mayúsculas de cada tarjeta |

- **Tipografía:** títulos en Plus Jakarta Sans 800 (27 a 28 px en páginas, 20 px en diálogos); texto en Inter 13,5 px; etiquetas en mayúsculas de 10,5 px con espaciado.
- **Forma:** radios de 12 px en tarjetas, 16 px en diálogos, botones en píldora (999 px); sombras muy suaves en tarjetas.
- **Modo oscuro:** no en F1 (D23); los tokens quedan listos para sumarlo.
- Los tokens se escriben como variables CSS con `@theme` de Tailwind 4, con los nombres que usan los estilos de Spartan.

## 8. Accesibilidad

- Foco visible en todo; orden de tabulación natural.
- Arrastrar siempre tiene alternativa con teclado («Mover a…»).
- El estado y la prioridad no dependen solo del color: llevan texto o ícono.
- Prueba automática con axe en la Playwright de F1-15.

## 9. Pruebas de la consola

| Qué | Cómo |
|---|---|
| Stores (TableroStore: movimiento optimista y vuelta atrás con 422 y 409) | Vitest con la API simulada |
| `erroresInterceptor` (cada `codigo` a su mensaje) | Vitest |
| Tarjeta y diálogos (campos que pide cada regla) | Pruebas de componente |
| Flujo completo de F1-14 y chequeo de accesibilidad | Playwright contra el núcleo real con datos de ejemplo |
| Claves de idioma iguales en `es` y `en` | Script en el CI |

## 10. Ajustes a las tareas de F1 (PLAN §15)

| Tarea | Ajuste |
|---|---|
| F1-00 | Entrega también las maquetas de Tablero, Ficha y Desbloquear con los estados de 4.2 y 4.4 |
| F1-12 | Estructura de la sección 2, Transloco (si se confirma), Spartan inicializado con su CLI, cliente SSE |
| F1-13 | Tablero con columnas atenuadas al arrastrar, flujo de 4.2 completo, «Mover a…» con teclado, estados de carga, vacío y error |
| F1-14 | Ficha con línea de tiempo y banda de discrepancias, Nueva, los 6 diálogos de 4.6 |
| F1-15 | Suma axe y el chequeo de claves de idioma |
