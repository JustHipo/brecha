# ADR 0018: MCP por HTTP dentro del núcleo

- **Estado:** Aceptada (ajusta ADR 0012)
- **Fecha:** 2026-11-23

## Contexto
El ADR 0012 definía el servidor MCP con transporte stdio. Con stdio, Claude lanza un proceso aparte que abre su propia conexión a la base y no comparte el estado del núcleo. Juan aprobó el cambio C1 del plan de backend el 23-nov-2026.

## Decisión
El servidor MCP vive dentro del núcleo, en `/mcp` (Streamable HTTP del SDK oficial), sobre 127.0.0.1 y con un token de tipo `mcp` en la cabecera. Claude Code y Claude Desktop se conectan con la URL y la cabecera.

## Consecuencias
- Un solo proceso con acceso a la base.
- El MCP funciona siempre que Brecha corra, también en modo liviano.
- Las reglas de acceso y los registros son los mismos que para REST.
