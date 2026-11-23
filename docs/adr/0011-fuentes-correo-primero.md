# ADR 0011: Seguimiento por señales, con el correo como fuente principal

- **Estado:** Reemplazada por 0015 (D11 y D14, 23-nov-2026)
- **Fecha:** 2026-11-23

## Contexto
Juan quiere ver si llegaron correos o si una postulación cambió de estado en las plataformas donde postuló (LinkedIn, trabajando, Get on Board y otras), a partir de MCP o API con IA. LinkedIn y trabajando no tienen una API pública de postulaciones, y las condiciones de uso de LinkedIn prohíben automatizar o extraer datos de su sitio. Todas las plataformas, en cambio, mandan correos cuando una postulación avanza o se cierra.

## Decisión
- Todo lo que llega de afuera entra como **señal** (fuente, plataforma, resumen, estado sugerido, confianza, referencia externa) y nunca cambia el estado por sí sola (R11).
- Fuente principal: el correo de la persona, en solo lectura (IMAP o API de Gmail con OAuth local, a decidir en la sesión de stack). La IA clasifica cada correo relevante y lo asocia a una postulación; si no puede, va a la bandeja.
- Get on Board: su API pública.
- Plataformas sin API: opción explícita para que la IA del usuario revise el portal en su propio navegador (por ejemplo, con un MCP de navegador), apagada por defecto y bajo responsabilidad del usuario. Las condiciones de cada portal se revisan al empezar F2.
- Desde F1 la persona o su IA pueden registrar señales a mano o por MCP.

## Consecuencias
- Funciona con cualquier plataforma que mande correos, sin depender de APIs que no existen.
- La calidad depende de la clasificación de la IA: se mide con un set de correos reales anonimizados (F2).
- Las señales quedan como evidencia en la línea de tiempo, útiles también para la validación de movimientos (R13).
