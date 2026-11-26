# ADR 0020: Arriendos como segundo contexto dentro de Brecha

- **Estado:** Aceptada
- **Fecha:** 2026-11-24

## Contexto
Juan pidió cambiar, con un selector donde dice «Brecha», a otra app que funcione parecido pero para encontrar arriendo: seguir propiedades por estado, juntar la evidencia del correo y de WhatsApp, medir la brecha contra lo que busca y operarlo con su IA por MCP. Respondió las 11 preguntas del plan el 24-nov-2026 (`docs/diseno/arriendos.md` §2).

## Decisión
- **Misma instancia, segundo contexto acotado** (`services/nucleo/src/arriendos`), no una app aparte ni un motor genérico de «seguimiento con estados configurables». Comparte con empleo la base, el supervisor de la barra de menú, el vigía del correo, las credenciales, el MCP, el outbox y los hooks; no comparte tablas de dominio.
- dependency-cruiser hace cumplir que `arriendos` no importe `postulaciones`, `red` ni `csv`.
- El **foco** (Empleo o Arriendos) es solo de la consola y sale de la URL: empleo sigue sin prefijo y arriendos vive en `/arriendos/...`.
- El vigía lee el correo una sola vez; el filtro sin IA decide si un correo es de arriendo (dominio de un canal o palabras) antes de que salga de la máquina.
- El **calce** de arriendos se calcula en el núcleo, por código, contra las reglas duras y blandas del perfil de búsqueda. La IA solo clasifica y extrae datos de textos.
- El mapa usa MapLibre GL JS (BSD-3), el fondo de OpenFreeMap (sin cuenta) y Nominatim para direcciones, con caché, un pedido por segundo y un ajuste para apagarlo.

## Consecuencias
- Una sola instalación y un solo token de MCP para los dos focos; las herramientas MCP de arriendos tienen nombres propios.
- Dos dominios que crecen por separado: cambiar empleo no rompe arriendos y al revés.
- La consola carga más código (lazy por ruta: MapLibre solo baja al abrir un mapa).
- Una dirección de un aviso sale hacia OpenStreetMap si el ajuste está prendido; nunca datos de la persona.
