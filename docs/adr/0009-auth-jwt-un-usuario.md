# ADR 0009: Login propio con JWT y argon2id para un solo usuario

- **Estado:** Reemplazada por 0010 (D8, 23-nov-2026)
- **Fecha:** 2026-11-23

## Contexto
La app es de uso personal, pero las ofertas piden JWT, guards e interceptors. Login propio con argon2id y JWT es un patrón conocido.

## Decisión
Un usuario creado por una semilla con correo y contraseña de `.env`. Login con argon2id, JWT sin refresh con expiración corta, guard global en Nest y un solo mensaje para cualquier fallo de login. Toda consulta filtra por `usuarioId` y una postulación de otro usuario responde `NO_ENCONTRADO`. Sin registro público.

## Consecuencias
- Practica guards, interceptors y el flujo de token en Angular.
- Pasar a varios usuarios no exige reescribir el dominio.
