# ADR 0008: Datos personales fuera del repo público

- **Estado:** Aceptada
- **Fecha:** 2026-11-23

## Contexto
El repo es público. Las 46 fichas del artifact incluyen correos y nombres de reclutadores, notas de Juan, sueldos pedidos y estados de sus postulaciones.

## Decisión
Los datos reales viven en `datos/privado/` (en `.gitignore`) y en la base local. Al repo solo van fixtures inventados en `datos/ejemplo/`. El sitio público muestra solo agregados de avisos (herramientas, modalidad, rangos publicados), nunca datos de postulaciones ni de personas. Las capturas del README se toman con los datos de ejemplo.

## Consecuencias
- Un clon del repo funciona con los datos de ejemplo.
- Antes de cada PR se revisa que no entre nada de `datos/privado/` (lo cubre el `.gitignore`; el CI puede buscar correos reales como chequeo extra).
