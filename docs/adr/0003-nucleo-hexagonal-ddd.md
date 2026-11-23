# ADR 0003: Núcleo en NestJS con arquitectura hexagonal y DDD

- **Estado:** Aceptada
- **Fecha:** 2026-11-23

## Contexto
Varias ofertas piden DDD y arquitectura hexagonal con NestJS. El dominio (postulaciones y sus estados) tiene reglas reales que conviene probar sin base de datos. Aquí se practica lo distinto al NestJS clásico por módulos.

## Decisión
`services/nucleo` se divide en `dominio/`, `aplicacion/` e `infraestructura/` por contexto. El dominio y la aplicación no importan NestJS, Prisma ni nada de infraestructura; los repositorios, el reloj, el generador de ids y el bus de eventos son puertos (interfaces) con adaptadores en infraestructura. Los casos de uso son clases simples conectadas con `useFactory`. La regla se hace cumplir con dependency-cruiser en el CI.

## Consecuencias
- Las reglas del agregado `Postulacion` se prueban con Vitest en milisegundos y sin Docker.
- Cambiar RabbitMQ por otro bus, o Prisma por otro ORM, no toca el dominio. Es lo que se demuestra en F3.
- Más archivos y mappers que en un CRUD; es el costo que se acepta para aprender el patrón.
- La regla de dependencias no queda a la buena voluntad: rompe el CI.
