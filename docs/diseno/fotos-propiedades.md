# Plan: fotos de las propiedades (Arriendos)

Escrito el 25-nov-2026. **Estado: implementado (25-nov-2026), ver §11.** **Versión 1, validada por Juan el 25-nov-2026:** portada = primera foto (F-D2, sin reordenar arrastrando) y límites de F-D6 con la carpeta de F-D4. Rama `claude/fotos-propiedades-f09965`, desde `windows` en b4fe529 (versión 0.2.2). PR contra `windows`.

## 1. La tarea en simple

- **Qué pidió Juan:** que Brecha guarde las imágenes de los avisos de arriendo. Hoy el MCP no tiene dónde ponerlas: `crear_propiedad`, `editar_propiedad` y `agregar_publicacion` no traen ningún campo para imágenes.
- **Qué cambia:** cada propiedad tiene varias fotos, en orden y con una portada. Se agregan por URL (Brecha descarga la imagen y la guarda en tu equipo, porque los avisos se caen) o desde un archivo de tu equipo. La ficha muestra la galería y el tablero y la lista muestran la portada.
- **Sin nube (P-BRECHA-SIN-NUBE):** las fotos quedan en la carpeta de datos de la instancia. La única salida a internet es la descarga de la imagen que tú o tu IA le dan.

## 2. Fuentes leídas

| Fuente | Para qué |
|---|---|
| `docs/diseno/arriendos.md` | Dominio de arriendos, decisiones A-D1 a A-D20 |
| `services/nucleo/prisma/schema.prisma` y migraciones | La propiedad guarda casi todo en `datos` (JSON); la última migración es `20261129000000_perfil_empleo` |
| `services/nucleo/src/arriendos/**` | Casos de uso (`crear`, `unir`, `borrar`), repositorio Prisma, controlador REST y herramientas MCP |
| `services/nucleo/src/postulaciones/infraestructura/mcp/mcp.spec.ts` | La lista ordenada de herramientas MCP |
| `services/nucleo/src/app.ts`, `main.ts`, `compartido/infraestructura/{config,escritorio}.ts`, `acceso/acceso.guard.ts` | Parsers del cuerpo, `BRECHA_DIR`, `esDeLaApi` y el token Bearer que pide toda la API |
| `apps/escritorio/src/{main,servicios,plataforma,rutas}.ts` | `BRECHA_DATOS` cambia `userData`; el núcleo recibe `BRECHA_DIR = userData/instancia` |
| `apps/consola/src/app/funciones/arriendos/*`, `nucleo/api/arriendos.api.ts`, `nucleo/eventos/eventos.service.ts` | Ficha, tablero, lista y cómo la consola manda el token |

## 3. Decisiones

| # | Decisión | Autor | Por qué |
|---|---|---|---|
| F-D1 | **Tabla nueva `foto_propiedad`** (migración `20261130000000_fotos_propiedad`), no dentro de `datos` | Claude | Las fotos tienen archivo en disco, orden y portada; en una tabla se borran en cascada con la propiedad y se mueven al unir sin reescribir el JSON |
| F-D2 | **La portada es la primera foto** (orden 0). «Elegir portada» la pasa al frente y las demás conservan su orden | Claude | Una sola regla que no se puede romper (nunca dos portadas ni ninguna con fotos). Es como lo hacen los portales |
| F-D3 | El orden es el de llegada; no hay reordenar arrastrando en esta versión | Claude | Lo que pidió Juan es orden y portada; reordenar se agrega después si hace falta |
| F-D4 | Archivos en **`<instancia>/fotos/<idFoto>.<ext>`** (carpeta plana, nombre = UUID). En la app: macOS `~/Library/Application Support/Brecha/instancia/fotos`, Windows `%APPDATA%\Brecha\instancia\fotos`; con `BRECHA_DATOS`, dentro de esa carpeta | Claude | El núcleo ya recibe `BRECHA_DIR` (la instancia), que sigue a `BRECHA_DATOS`. Sin carpetas por propiedad, unir dos propiedades no mueve archivos. La base guarda solo `idFoto.ext`, sin separadores: la ruta se arma con `path.join` en cada sistema |
| F-D5 | Tipos **jpg, png y webp**, reconocidos por los **primeros bytes del archivo**, no por la extensión ni por el `Content-Type` | Claude | Un servidor puede mentir el tipo; los bytes no |
| F-D6 | Hasta **10 MB por foto**, **40 fotos por propiedad** y **20 por llamada** | Claude (Juan puede cambiar los números) | Una foto de portal pesa 100 a 400 KB; 10 MB deja pasar fotos de celular |
| F-D7 | **Descarga protegida contra SSRF:** solo `http`/`https`, puertos 80 y 443, sin usuario ni clave en la URL; se resuelve el nombre y se rechaza si **alguna** dirección es local o privada (loopback, 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10, multicast, reservadas, IPv6 `::1`, `fc00::/7`, `fe80::/10`, y las IPv4 escondidas en IPv6); se conecta a la dirección ya revisada (sin segunda consulta DNS); hasta 3 redirecciones, cada una revisada igual; 20 s de tiempo máximo; se corta al pasar los 10 MB | Claude | Pedido explícito. Conectar a la IP revisada evita el truco de cambiar el DNS entre la revisión y la conexión |
| F-D8 | La descarga va con un agente genérico (`Brecha/0.2`), sin datos de Juan | Claude | Privacidad |
| F-D9 | **Archivo local:** ruta absoluta (`/Users/...`, `C:\Users\...`, `~/...`) o `file://`. El núcleo la lee en el mismo equipo, revisa que sea un archivo normal, el tamaño y los primeros bytes | Claude | El MCP corre dentro del núcleo, en la máquina de Juan. Como solo acepta imágenes, no sirve para sacar otros archivos |
| F-D10 | **La misma foto dos veces** en una propiedad (mismo contenido, por SHA-256) no se duplica: responde «ya estaba» | Claude | Si la IA reintenta, no se llena de copias |
| F-D11 | **Agregar varias:** cada foto se resuelve por separado; una URL caída no impide las demás. La respuesta dice cuál entró, cuál ya estaba y cuál falló y por qué | Claude | Los avisos viejos tienen URLs muertas |
| F-D12 | La consola pide cada foto **con el token** y la muestra como `blob:`; el núcleo no abre una ruta sin token | Claude | Toda la API pide token (backend.md §6.1). Un `<img src>` no puede mandar la cabecera y poner el token en la URL lo filtraría |
| F-D13 | **Unir propiedades** mueve las fotos del duplicado a la que queda (al final, sin repetir contenido). **Borrar** una propiedad borra sus fotos y sus archivos | Claude | Las fotos son de la propiedad, no de la publicación |
| F-D14 | No hay miniaturas generadas: la consola reduce la imagen con CSS | Claude | Generar miniaturas pide una librería nativa (sharp), que complica el empaquetado en Windows. Con fotos de 100 a 400 KB no hace falta |

## 4. Núcleo

**Prisma (`FotoPropiedad`, tabla `foto_propiedad`):** `id` (uuid), `propiedad_id` (FK a `propiedad` con borrado en cascada), `orden`, `archivo` (`idFoto.ext`), `tipo` (`image/jpeg`, `image/png`, `image/webp`), `bytes`, `sha256`, `origen` (`url` o `archivo`), `url_origen`, `nombre_origen`, `creada_en`. Únicos: (`propiedad_id`, `sha256`). Índice: (`propiedad_id`, `orden`).

**Dominio (`arriendos/dominio/foto.ts`, sin Node ni Prisma):** reconocer el tipo por los primeros bytes, límites, distinguir URL de ruta (`C:\…` no es una URL con esquema `c:`), y el orden con la portada.

**Aplicación (`arriendos/aplicacion/fotos.ts`):** `CasosDeFotos` con `agregar(propiedadId, fuentes[])`, `agregarArchivo(propiedadId, bytes, nombre)` (consola), `listar`, `quitar`, `elegirPortada`, `abrir(idFoto)` (para servirla), y lo que usan `unir` y `borrar`. Puertos nuevos: `FotoRepositorio`, `AlmacenDeFotos` (disco), `DescargadorDeImagenes` (red) y `LectorDeArchivos` (disco local).

**Infraestructura:**
- `prisma-fotos.ts`, `almacen-de-fotos.ts` (escribe a un nombre temporal y renombra; si la base falla, borra el archivo) y `descargador.ts` (F-D7).
- **REST** (todo bajo `/api/v1`, con token):
  - `GET /arriendos/propiedades/:id/fotos`
  - `POST /arriendos/propiedades/:id/fotos` con `{ fuentes: string[] }`
  - `POST /arriendos/propiedades/:id/fotos/archivo` con el archivo en el cuerpo (`image/*` u `application/octet-stream`, hasta 10 MB; parser solo en esa ruta, como el del CSV)
  - `POST /arriendos/propiedades/:id/fotos/:fotoId/portada`
  - `DELETE /arriendos/propiedades/:id/fotos/:fotoId`
  - `GET /arriendos/fotos/:fotoId` devuelve la imagen, con `Content-Type` guardado, `X-Content-Type-Options: nosniff` y caché privada larga (el id no cambia)
- **Vistas:** `VistaPropiedad` suma `portada` (id de la foto o `null`) y `cantidadFotos`; el detalle suma `fotos` en orden.
- Cada cambio avisa en vivo (`propiedad.actualizada`) para que la consola recargue.
- `config.ts`: `fotosDir = <dir>/fotos`.
- Contrato OpenAPI regenerado.

## 5. MCP

| Herramienta | Qué hace |
|---|---|
| `crear_propiedad` | Nuevo campo `fotos`: lista de URL o rutas. Se agregan después de crear; la respuesta dice cuáles entraron |
| `agregar_fotos` | `{ id, fotos: string[], portada?: número }`: agrega a una propiedad que ya existe; `portada` dice cuál de la lista va de portada |
| `listar_fotos` | `{ id }`: orden, cuál es la portada, origen, tipo y tamaño |
| `quitar_foto` | `{ id, fotoId }` |
| `elegir_portada` | `{ id, fotoId }` |

`ver_propiedad` muestra las fotos y `listar_propiedades` cuántas tiene cada una. Las instrucciones del servidor suman una línea: «Cuando agregues una propiedad desde un aviso, pasa las URL de sus fotos en `fotos`». La lista ordenada de `mcp.spec.ts` suma las cuatro nuevas.

## 6. Consola

- **Ficha:** sección «Fotos» con la portada grande y las demás en miniatura. Tocar una la muestra grande. Por foto: «Usar como portada» y «Quitar» (con confirmación). Para agregar: un campo para pegar una o varias URL y un botón para elegir archivos de tu equipo (varios a la vez). Errores en palabras («La imagen pesa más de 10 MB», «Esa dirección es local o privada»).
- **Tablero y lista:** la portada en miniatura en cada tarjeta o fila; sin fotos, nada (no un ícono vacío).
- Una directiva `brFoto` pide la imagen con el token y guarda el `blob:` en memoria mientras dure la sesión.
- i18n en `es` y `en`, con las claves bajo `arriendos.fotos.*`. Estilo y accesibilidad como el resto (texto alternativo «Foto 2 de 5 de Departamento 2D en Ñuñoa»).

## 7. App de escritorio

- No cambia el supervisor: el núcleo ya recibe `BRECHA_DIR` (la instancia), que sigue a `BRECHA_DATOS`, y crea `fotos` adentro la primera vez.
- La foto se sirve desde la API (`/api/...`), así que `esDeLaApi` la deja pasar en los dos sistemas y nunca cae en el `index.html` de la consola. Se agrega el caso a `escritorio.spec.ts`.
- En la base solo va `idFoto.ext`; ninguna ruta de disco viaja a la consola ni a la base. Prueba unitaria con rutas de Windows (`C:\…`, `file:///C:/…`) para distinguir archivo de URL.
- La prueba de humo del escritorio sube una foto y la vuelve a leer, si cabe sin alargarla mucho.

## 8. Pruebas

| Dónde | Qué |
|---|---|
| Núcleo, dominio | Tipos por bytes (y un `.jpg` que en verdad es HTML), límites, URL o ruta (macOS y Windows), orden y portada |
| Núcleo, descarga | Direcciones privadas y locales (v4, v6, IPv4 dentro de IPv6), puertos, esquemas, redirección hacia una dirección privada, corte a los 10 MB, tiempo máximo. Contra un servidor local con la revisión de direcciones reemplazada solo en la prueba |
| Núcleo, API y MCP | Agregar por URL y por archivo, la misma foto dos veces, portada, quitar, servir la imagen, unir y borrar; `crear_propiedad` con `fotos`; lista de herramientas en `mcp.spec.ts` |
| Consola, unitarias | La directiva `brFoto` y el store |
| Consola, e2e | Crear una propiedad, subir dos fotos desde archivo, ver la galería, cambiar la portada, verla en el tablero y quitar una. Con axe |
| De punta a punta (a mano, por mí) | El núcleo de esta rama con su consola: crear una propiedad con **2 fotos por URL** reales de Portal Inmobiliario, mirar la ficha, cambiar la portada y quitar una |

## 9. Riesgos

| Riesgo | Cómo se maneja |
|---|---|
| Un portal bloquea la descarga sin `Referer` o con agente genérico | La respuesta dice el código HTTP; se prueba con `mlstatic` en la validación. Si falla, se ajusta el agente (sin datos de Juan) |
| La carpeta `fotos` crece | Solo lo que agregas; borrar la propiedad borra sus fotos |
| Respaldo y exportar | Esta versión no mete las fotos en `exportar` ni en el CSV; quedan en la carpeta. Se anota como pendiente |
| Choque con otras ramas en `schema.prisma` o `mcp.spec.ts` | Cambios al final del archivo; la migración se renombra si otra entra antes |

## 10. Respuestas de Juan (25-nov-2026)

1. Portada = primera foto (F-D2), sin reordenar todas por ahora.
2. 10 MB por foto, 40 por propiedad y 20 por llamada (F-D6), en `instancia/fotos` (F-D4).

## 11. Implementación (25-nov-2026)

Commits en la rama `claude/fotos-propiedades-f09965`: núcleo y MCP, consola, prueba de humo del escritorio y esta sección.

**Hecho como estaba planeado:** tabla `foto_propiedad` con su migración; descarga con F-D7 (IP fijada, redirecciones revisadas, 80 y 443, 10 MB, 20 s); archivos locales con F-D9; portada = primera; deduplicación por contenido; unir y borrar con sus archivos; REST, contrato OpenAPI y 4 herramientas MCP más `fotos` en `crear_propiedad`; galería en la ficha y portada en el tablero y la lista, con textos en `es` y `en`.

**Cambió respecto del plan:**
| Qué | Por qué |
|---|---|
| La foto grande va en proporción 4:3 (hasta 420 px de alto) y no con alto fijo | Con alto fijo, en una ventana angosta quedaba mucho espacio vacío arriba y abajo |
| La prueba de humo del escritorio sube una foto y revisa que quede en `instancia/fotos` dentro de la carpeta con espacio y tildes | Es la forma de probar las rutas en Windows sin cambiar el supervisor; la corre la sesión «windows» al empaquetar |

**Verificado ejecutando:**
- Núcleo: lint (con dependency-cruiser), tipos y 559 pruebas (68 nuevas de dominio y descarga, 7 de API y MCP, y el caso de `esDeLaApi`), contra una base de pruebas propia de este worktree.
- Consola: lint (claves iguales en `es` y `en`), tipos, build, 122 unitarias y las 29 e2e (1 nueva de fotos, con axe).
- Escritorio: sus 23 pruebas.
- **De punta a punta**, con el núcleo de esta rama sirviendo la consola como en la app, con la instancia en una carpeta `Brecha Pérez ñ`:
  - `crear_propiedad` por MCP con **2 fotos por URL reales** de Portal Inmobiliario (`http2.mlstatic.com/D_NQ_NP_…-O.webp`): las dos entraron como webp de 500×375.
  - Por MCP se rechazaron `169.254.169.254`, `localhost:4361` y `localtest.me` (un nombre público que apunta a 127.0.0.1), y entró la variante `-F` de la misma foto (1200×900).
  - En la ficha: galería con las 3, cambio de portada a la segunda y quitar la tercera; `listar_fotos` confirma el orden y el archivo quitado ya no está en disco.
  - En el tablero se ve la portada en la tarjeta.
  - La foto se sirve desde `/api/...` con su tipo; sin token responde 401 y no el `index.html` de la consola.

**No verificado:** Windows (la prueba de humo nueva corre cuando la sesión «windows» empaquete) y fotos de Yapo (no tenía una URL de imagen a mano; el camino es el mismo).

**Para quien cargue fotos de Portal Inmobiliario:** la variante `-F-<texto>.webp` es la grande (1200×900) y la `-O.webp` la chica (500×375). Conviene usar una sola por foto: tienen distinto contenido, así que Brecha no las toma como la misma.

**Pendiente (fuera de esta versión):** las fotos no van en `exportar` ni en el CSV (§9); reordenar arrastrando (F-D3).
