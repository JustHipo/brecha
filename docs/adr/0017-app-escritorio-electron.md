# ADR 0017: App de escritorio con Electron

- **Estado:** Aceptada
- **Fecha:** 2026-11-23

## Contexto
Brecha corre en la máquina de cada persona con un modo liviano siempre y un modo completo al abrir la app (ADR 0014). En macOS, Docker Desktop mantiene una máquina virtual encendida que ocupa memoria por sí sola, así que un modo liviano en contenedores no ahorra RAM. Juan quiere además que, si no es muy complicado, funcione en Windows como Anytype (D17). Eligió Electron el 23-nov-2026 (D19).

## Decisión
- `apps/escritorio` es una app Electron. Su proceso principal es el **supervisor**: arranca con el equipo, vive en la barra de menú, lanza el núcleo, PostgreSQL y el vigía como procesos hijos (modo liviano) y levanta la API de IA, RabbitMQ y las notificaciones al abrir la ventana (modo completo).
- La ventana carga la consola Angular. Los avisos del sistema operativo salen de Electron.
- `docker compose` se usa solo para desarrollar y en el CI.
- La distribución de binarios de PostgreSQL y del vigía en Python por sistema se elige en F3.

## Consecuencias
- El modo liviano no depende de Docker.
- Windows queda al alcance: la interfaz y el supervisor ya son multiplataforma; lo caro es empaquetar PostgreSQL y Python para Windows, y se evalúa al cerrar F3.
- F1 no cambia: se desarrolla con Docker y la consola corre en el navegador hasta que exista la app.
- Electron suma un proceso de unos cientos de MB con la ventana cerrada; se mide en F3.
