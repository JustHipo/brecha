# ADR 0019: Token siempre y validación de Host y Origin

- **Estado:** Aceptada (ajusta ADR 0010)
- **Fecha:** 2026-11-23

## Contexto
El ADR 0010 dejaba la API abierta a cualquier proceso local si no había clave. Escuchar en 127.0.0.1 no protege de las páginas web abiertas en el navegador, que pueden mandar pedidos a ese puerto, ni del DNS rebinding. Juan aprobó el cambio C2 del plan de backend el 23-nov-2026.

## Decisión
- Siempre se exige un token. Sin clave local, la ventana de Brecha lo recibe sola al abrir; con clave, al desbloquear.
- Tres tipos de token: `sesion` (consola), `mcp` (IA del usuario) y `servicio` (vigía y API de IA), de 32 bytes aleatorios, comparados en tiempo constante y guardados con permisos 0600.
- Se rechaza todo pedido con `Host` distinto de 127.0.0.1 o localhost y todo `Origin` distinto del de la consola.

## Consecuencias
- Una página web cualquiera no puede leer ni mover postulaciones.
- La clave local sigue siendo opcional: protege de otra persona frente al equipo, no de otros programas.
