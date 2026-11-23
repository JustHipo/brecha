# ADR 0014: Modo liviano en segundo plano y modo completo al abrir la app

- **Estado:** Aceptada
- **Fecha:** 2026-11-23

## Contexto
Brecha corre todo el día en la máquina de cada persona para vigilar el correo y avisar (D8). Con todos los servicios encendidos pesaría varios GB de RAM. Juan propuso el 23-nov-2026 (D9) que en segundo plano corra solo lo liviano y que lo pesado se levante al abrir la app.

## Decisión
- **Liviano, siempre:** núcleo (REST y MCP), PostgreSQL, el vigía del servicio con IA (lector de correo y tareas programadas) y los avisos del sistema operativo. Si el proveedor de IA es por API, el vigía clasifica ahí mismo; con un modelo local, deja los correos en cola.
- **Completo, con la app abierta:** además la API del servicio con IA, RabbitMQ, notificaciones en vivo, la consola y Panorama.
- Un **supervisor** arranca con el equipo, mantiene el modo liviano y levanta o baja el completo al abrir y cerrar la app.
- Los eventos del modo liviano esperan en el outbox del núcleo y se publican al arrancar el modo completo.

## Consecuencias
- La memoria en segundo plano queda en el núcleo, PostgreSQL y un proceso Python chico.
- RabbitMQ no está siempre: lo que necesite reaccionar en segundo plano lo hace el núcleo o el vigía directamente.
- Docker Desktop en macOS ocupa memoria por sí solo; si el modo liviano corre en contenedores, deja de ser liviano. Cómo se empaqueta queda como decisión aparte (PLAN 6.3).
