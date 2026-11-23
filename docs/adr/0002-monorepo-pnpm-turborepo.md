# ADR 0002: Monorepo con pnpm y Turborepo

- **Estado:** Aceptada
- **Fecha:** 2026-11-23

## Contexto
Hay 3 a 5 servicios y 2 frontends que comparten contratos (OpenAPI y eventos). Separarlos en varios repos obligaría a publicar paquetes para compartir tipos. Turborepo aparece en las ofertas y pnpm es el gestor de paquetes conocido.

## Decisión
Un solo repo con pnpm workspaces y Turborepo: `apps/` (consola, sitio), `services/` (nucleo, ia, notificaciones, ingesta), `packages/` (contratos, config). Los servicios que no son Node (Python, Java) viven en el mismo repo y exponen sus tareas a turbo con un `package.json` de solo scripts.

## Consecuencias
- Un cambio de contrato y sus consumidores van en la misma PR.
- turbo cachea build y pruebas; el CI corre solo lo afectado.
- pnpm 11 o más pide aprobar los build scripts de las dependencias: se declaran en `pnpm-workspace.yaml`.
- Despliegue independiente por servicio sigue siendo posible: cada uno tiene su Dockerfile.
