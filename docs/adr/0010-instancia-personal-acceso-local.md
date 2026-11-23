# ADR 0010: Instancia personal autoalojada con acceso solo local

- **Estado:** Aceptada, ajustada por ADR 0019
- **Fecha:** 2026-11-23

## Contexto
Después del checkpoint de F0 (D8, 23-nov-2026), Juan definió que Brecha no va en un servidor ni tiene un frontend público: cada persona la levanta en su máquina, en segundo plano, con sus propias credenciales, y sus datos no pasan por ningún sistema nuestro. A lo más quiere una contraseña local. Esto reemplaza el ADR 0009 (login con JWT para un usuario).

## Decisión
- Una instancia, una persona. No hay registro, cuentas ni `usuarioId`.
- El núcleo y los puertos de `docker compose` escuchan solo en `127.0.0.1`.
- Clave local opcional: si se configura, se guarda su hash argon2id y la consola pide desbloquear; se emite un token de sesión local. Sin clave, la API responde a cualquier proceso local.
- El servidor MCP y los hooks usan un token propio generado al instalar, guardado en la carpeta de la instancia con permisos solo del usuario.
- Las credenciales de fuentes (correo, portales) y la llave del proveedor de IA van al llavero del sistema operativo, no a la base ni al repo.

## Consecuencias
- No hay datos de nadie en ningún servidor; la privacidad sale de la arquitectura y no de una promesa.
- Se siguen practicando guards e interceptors (con el token local), aunque no JWT con un proveedor de identidad.
- Cada persona instala y actualiza su propia copia: la instalación tiene que ser simple (F7).
- Los correos y avisos sí salen hacia el proveedor de IA que cada persona elija, salvo con un modelo local; la instalación lo dice claro.
