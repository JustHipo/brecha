# ADR 0012: Núcleo operable por IA con un servidor MCP

- **Estado:** Aceptada, ajustada por ADR 0018
- **Fecha:** 2026-11-23

## Contexto
Juan quiere que todo sea manejable por IA, para hacer hooks y automatizaciones. En una arquitectura hexagonal, una IA es otro actor que entra por un adaptador, igual que la consola por REST.

## Decisión
El núcleo expone un servidor MCP (transporte stdio, SDK oficial de TypeScript) en `infraestructura/mcp/`, con herramientas que llaman a los mismos casos de uso que REST: listar, ver, crear, cambiar estado (origen `ia`), anotar, registrar señales, resolver discrepancias y un resumen por prioridad. Los errores devuelven los mismos códigos. Los hooks (F3) se configuran en `brecha.hooks.yaml` y reaccionan a los eventos del outbox.

## Consecuencias
- Desde F1 la IA del usuario puede operar Brecha y, combinando su propio MCP de correo, registrar señales antes de que exista el servicio con IA.
- Es la mejor demostración de la arquitectura: tres adaptadores de entrada (REST, MCP, eventos) sobre el mismo dominio, sin duplicar reglas.
- Los cambios hechos por IA quedan marcados con su origen y pasan por la misma validación (R13).
