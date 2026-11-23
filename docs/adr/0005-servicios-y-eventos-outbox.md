# ADR 0005: Servicios separados con eventos y outbox desde F1

- **Estado:** Aceptada
- **Fecha:** 2026-11-23

## Contexto
Cinco ofertas piden microservicios y tres piden colas o eventos. Con equipos chicos, un monolito modular suele ser lo correcto. Aquí cada servicio necesita un motivo para estar separado (sección 3 del plan): otro lenguaje, otra base, otra forma de escalar o un trabajo programado que puede caerse sin afectar al resto.

## Decisión
Los servicios solo se comunican por REST (consultas) y por eventos de integración (cambios). Los eventos tienen un sobre común con `id`, `tipo`, `version`, `ocurridoEn`, `origen`, `correlacionId` y `datos`, y su esquema en JSON Schema en `packages/contratos`. El núcleo escribe sus eventos en una tabla `outbox` en la misma transacción que el cambio desde F1; en F3 un publicador la vacía hacia RabbitMQ. Los consumidores son idempotentes por `id`.

## Consecuencias
- No se pierden eventos si RabbitMQ está caído: quedan en el outbox.
- Consistencia eventual: el puntaje de calce de una postulación puede tardar en llegar.
- Más piezas que un monolito; se acepta porque practicar esto es el objetivo.
