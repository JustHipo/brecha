# ADR 0015: Señales desde un lector de correo propio y desde la IA del usuario

- **Estado:** Aceptada
- **Fecha:** 2026-11-23

## Contexto
Reemplaza el ADR 0011. Juan decidió el 23-nov-2026 que Brecha traiga su propio lector de correo (D11), que la IA del usuario también pueda registrar señales por MCP, y que las plataformas sin API (LinkedIn, trabajando) las revise la IA del usuario desde su navegador, por fuera de Brecha (D14). Las condiciones de uso de LinkedIn prohíben automatizar su sitio.

## Decisión
- Todo lo que llega de afuera entra como **señal** y nunca cambia el estado por sí sola (R11).
- **Lector propio:** el vigía lee el correo en solo lectura (el protocolo se decide en F2) y la IA clasifica cada correo relevante en una señal o lo deja en la bandeja.
- **Por MCP:** la IA del usuario (Claude Code, Claude Desktop, Claude en Chrome) puede registrar señales, editar postulaciones y armar sus propios artifacts con `exportar` (D12).
- **Brecha no automatiza navegadores.** Revisar un portal es algo que hace el usuario con su IA, y lo que encuentre entra por MCP.
- Get on Board se lee por su API pública.

## Consecuencias
- Brecha no incumple las condiciones de ningún portal por sí sola.
- Las dos vías (lector y MCP) usan el mismo caso de uso `registrar-senal` y la misma deduplicación por referencia externa.
- La calidad de la clasificación se mide en F2 con correos reales anonimizados.
