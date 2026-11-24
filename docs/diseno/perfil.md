# Perfil de búsqueda: reglas de Empleo y de Arriendos

Escrito el 24-nov-2026 sobre la rama `windows` (`142cb67`, que ya junta f2, pasos pendientes y Arriendos). Pedido de Juan: un ajuste editable en cada foco con reglas duras, reglas blandas con prioridad, etiquetas libres en cada regla e historial con motivo; que Claude lo lea por MCP antes de buscar y le pregunte antes de cambiarlo.

**Estado:** plan aprobado por Juan el 24-nov-2026 en el artifact «Plan del perfil de búsqueda» (https://claude.ai/artifact/NTxqBA3tWYyiFxAtCX53fx), con las 7 respuestas guardadas ahí (todas las opciones recomendadas). Rama `perfil` desde `origin/windows`, PR hacia `windows`. Decisiones PB-D1 a PB-D14 (numeradas aparte para no chocar con las D de otras ramas).

## 1. Qué cambia para ti

- Cada foco tiene una página **Perfil** en la barra lateral. En Arriendos reemplaza a «Tu búsqueda».
- Una regla es un **texto tuyo** («Santiago solo híbrido o remoto»), **dura** o **blanda con prioridad** (P1 pesa más), con **etiquetas** libres (`ubicacion`, `santiago`). Algunas además tienen un **chequeo** que el código revisa contra cada postulación o propiedad; las demás las aplica Claude leyéndolas.
- La página agrupa por etiqueta, filtra tocando una y ordena las blandas con flechas. Cada cambio pide un motivo y queda en el historial.
- En Empleo, una postulación que choca con una regla dura muestra **«choca con tu perfil»** en la tarjeta y en la ficha. **Nunca cambia su estado**: las ya enviadas siguen abiertas.
- Claude, antes de buscar ofertas o arriendos, lee el perfil con `ver_perfil`. Si le pides otra cosa («busca también en Concepción presencial»), te pregunta si la agrega al perfil; con tu sí la agrega con `editar_perfil` y el motivo.

## 2. Qué había

- **Arriendos** (`services/nucleo/src/arriendos/dominio/busqueda.ts`): reglas con un `criterio` de un enum fijo (13 criterios), valor según el criterio, dura o blanda con prioridad, historial con motivo y datos de la persona (renta, aval, mascota). Guardado como JSON en `busqueda_arriendo` (una fila). MCP `ver_busqueda` y `editar_busqueda` (reemplaza la lista entera). La base de Juan tenía dos reglas: renta exigida y aval.
- **Empleo**: sin reglas. El «perfil» del servicio con IA (`services/ia/src/ia/dominio/perfil.py`) son las herramientas y años del CV para el calce de avisos, otra cosa. Las preferencias vivían fuera de la app (AIOS: P-CV-DATOS-POSTULAR, COR-20261124-0100-cv, COR-20261124-1730-cv).

## 3. Modelo

### 3.1 La regla (común a los dos focos, `compartido/dominio/perfil.ts`)

```ts
interface Regla<C extends string> {
  id: string;
  texto: string;          // en palabras de la persona; con criterio y sin texto, se describe solo
  criterio?: C;           // chequeo que el código revisa; sin él, la aplica Claude
  valor?: unknown;        // el valor del chequeo (cada foco lo valida)
  dura: boolean;
  prioridad?: number;     // solo blandas, 1 es la más importante, siempre seguidas (1, 2, 3…)
  etiquetas: string[];    // minúsculas, sin tildes, hasta 10 por regla
}
```

Cambios, todos con motivo y en una sola entrada del historial:

- `agregar`: reglas nuevas. Una blanda con prioridad N entra en N y corre las demás.
- `cambiar`: por `id`, solo lo que se manda (texto, criterio y valor, dura, prioridad, etiquetas).
- `quitar`: por `id`.
- `ordenar`: los `id` de las blandas en el orden nuevo (P1 primero).
- `reglas`: reemplaza la lista entera (lo usa la consola al guardar); las que traen `id` lo conservan.

El historial guarda fecha, origen (consola o ia), motivo y cómo quedaron las reglas en una línea cada una; hasta 200 entradas.

### 3.2 Arriendos

La búsqueda pasa a este modelo sin migración SQL: al leer, una regla vieja sin `texto` ni `etiquetas` recibe su descripción («Renta exigida que cumples») y una lista vacía. El `criterio` sigue siendo uno de los 13; ahora también se puede escribir una regla sin criterio («cerca del metro»), que el calce no cuenta y Claude aplica. Los datos de la persona, la UF y Nominatim quedan igual.

### 3.3 Empleo (`postulaciones/dominio/perfil.ts`, tabla `perfil_empleo`)

Chequeos (el código los revisa sobre el aviso de cada postulación):

| Criterio | Valor | Qué revisa |
|---|---|---|
| `titulo` | `{ incluir: string[], excluir: string[] }` | El título. Choca si trae una palabra excluida y ninguna incluida. Si hay `incluir` y no trae ninguna de las dos, queda «sin dato» (lo decide Claude). |
| `modalidad_por_region` | `{ valparaiso, santiago, otra: Modalidad[], noIndicaEsPresencialEn: Plataforma[] }` | Modalidad y ubicación. La región sale de una tabla de comunas de Valparaíso y Metropolitana. Remoto cumple siempre. «No indica» cuenta como presencial en las plataformas listadas (trabajando.cl, por «Jornada Completa»). Lo que no se ubica queda «sin dato». |
| `sueldo_publicado` | `{ minimo?: number }` | El sueldo publicado: falta o (si se lee un número) queda bajo el mínimo. |

Datos (no descartan; Claude los usa al llenar formularios): `rentaPretendida`, `disponibleDesde`, `notas`.

Cada postulación del tablero, la lista y la ficha trae `perfil: { cumpleDuras, choques[], sinDato[] }`. `cumpleDuras` es falso si choca con una dura. Nada de esto cambia el estado.

## 4. MCP

- `ver_perfil { foco }`: reglas con id, etiquetas y si las revisa el código; datos; últimos cambios; criterios disponibles.
- `editar_perfil { foco, motivo, agregar?, cambiar?, quitar?, ordenar?, datos? }`. `datos` es la persona en Arriendos y renta, disponibilidad y notas en Empleo.
- Se quitan `ver_busqueda` y `editar_busqueda`.
- Instrucciones del servidor: antes de buscar o proponer ofertas o arriendos, lee el perfil; las duras descartan, las blandas ordenan; si la persona pide algo que el perfil no dice o que choca, pregúntale si lo agrega al perfil o es solo esta vez; con su sí, `editar_perfil` con el motivo; nunca cambies el perfil sin preguntar; un choque nunca es razón para cambiar el estado de una postulación ya enviada.
- `crear_postulacion` y `listar_postulaciones` lo recuerdan en su descripción, y la línea de cada postulación dice «choca con tu perfil: …».

## 5. Consola

Página `/perfil` (Empleo) y `/arriendos/perfil` (Arriendos), mismo componente con lo propio de cada foco:

- Filtro por etiqueta (chips) y reglas agrupadas por su primera etiqueta; las sin etiqueta al final.
- Cada regla: texto, dura o blanda, prioridad con flechas ↑ ↓, etiquetas (chips con ✕ y un campo para agregar), y el chequeo opcional con su valor (formulario según el criterio).
- Tus datos del foco, motivo obligatorio y Guardar; historial abajo.
- Empleo: la tarjeta del tablero y la ficha muestran «choca con tu perfil» con el texto de la regla.

## 6. Semilla de Juan

`datos/privado/perfil-empleo.json` (nunca en el repo; `datos/ejemplo/perfil-empleo.json` es un ejemplo inventado). Se carga con `pnpm --filter nucleo perfil cargar <archivo>` contra el núcleo que esté corriendo (REST con el token de la instancia); cargarla dos veces deja lo mismo. Juan la carga en la app instalada cuando la actualice (respuesta 6).

## 7. Decisiones

| N° | Decisión | Autor |
|---|---|---|
| PB-D1 | Perfil por foco: duras, blandas con prioridad, etiquetas libres, historial con motivo | Juan |
| PB-D2 | Claude lee el perfil antes de buscar y pregunta antes de agregar o cambiar; con el sí lo cambia por MCP con motivo | Juan |
| PB-D3 | Reglas de Empleo: texto libre más chequeo opcional (respuesta 2) | Juan |
| PB-D4 | Un choque se muestra en tarjeta y ficha y nunca cambia el estado (respuesta 3) | Juan |
| PB-D5 | Página Perfil en la barra de cada foco (respuesta 4) | Juan |
| PB-D6 | Organizar: agrupar y filtrar por etiqueta, flechas para las blandas (respuesta 5) | Juan |
| PB-D7 | Semilla y comando; la carga en la app instalada la hace Juan al actualizar (respuesta 6) | Juan |
| PB-D8 | Renta y disponibilidad son datos; regla blanda P1 de sueldo publicado (respuesta 7) | Juan |
| PB-D9 | Rama `perfil` desde `windows`, PR hacia `windows` (respuesta 1) | Juan |
| PB-D10 | Una forma de regla común en `compartido`; cada foco guarda su perfil en su tabla y valida sus criterios | Claude |
| PB-D11 | Las reglas viejas de Arriendos se convierten al leer, sin migración SQL | Claude |
| PB-D12 | Cambios de a una (agregar, cambiar, quitar, ordenar) además del reemplazo entero | Claude |
| PB-D13 | `ver_perfil` y `editar_perfil` con foco reemplazan a `ver_busqueda` y `editar_busqueda` | Claude |
| PB-D14 | Etiquetas normalizadas como las de postulaciones (minúsculas, sin tildes) | Claude |

## 8. Fases

| Fase | Qué | Pruebas |
|---|---|---|
| P1 | Regla común y Arriendos | Dominio sin base; conversión de reglas viejas; API de Arriendos |
| P2 | Perfil de Empleo en el núcleo | Chequeos (Jornada Completa en Santiago, Viña es Valparaíso, frontend puro, sueldo bajo la renta); API |
| P3 | MCP | Herramientas contra la base de pruebas; las instrucciones dicen leer antes y preguntar antes de cambiar |
| P4 | Consola | Stores; Playwright de agregar con etiqueta, filtrar, subir una blanda e historial; axe |
| P5 | Semilla y cierre | Cargar dos veces deja lo mismo; README, PLAN, PR y AIOS |
