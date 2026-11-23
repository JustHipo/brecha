# ADR 0001: Registrar las decisiones de arquitectura con ADR

- **Estado:** Aceptada
- **Fecha:** 2026-11-23

## Contexto
Brecha es un proyecto para aprender y para mostrar en entrevistas. Lo que más vale contar es por qué se eligió cada cosa, y eso se pierde si solo queda en el chat.

## Decisión
Cada decisión de arquitectura va en `docs/adr/NNNN-titulo.md` con este formato: contexto, decisión, consecuencias y estado (Propuesta, Aceptada, Reemplazada por NNNN). Un ADR aceptado no se reescribe: si cambia la decisión, se escribe uno nuevo que lo reemplaza.

## Consecuencias
- El README enlaza los ADR; en una entrevista sirven de guion.
- Cuesta unos minutos por decisión.
