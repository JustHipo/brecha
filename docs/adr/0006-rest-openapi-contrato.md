# ADR 0006: REST con OpenAPI como contrato del núcleo

- **Estado:** Aceptada
- **Fecha:** 2026-11-23

## Contexto
La mayoría de las ofertas usan REST. Un riesgo conocido: si el contrato no es ejecutable, los frontends terminan programando contra mocks con formas inventadas.

## Decisión
El núcleo expone REST en `/api/v1` documentado con `@nestjs/swagger`. El `openapi.json` se exporta a `packages/contratos` y de ahí se generan los tipos de la consola con `openapi-typescript`. El CI falla si el `openapi.json` del código no coincide con el commiteado. Los errores tienen la forma `{codigo, mensaje, campo?}` con códigos estables y una tabla HTTP fija.

## Consecuencias
- La consola no puede usar un campo que no existe: no compila.
- La consola arranca cuando existe el contrato (F1-10a), no cuando el núcleo está terminado.
- Sin versionado por cabecera; `/api/v1` basta para un proyecto de un usuario.
