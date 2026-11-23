# Decisiones de arquitectura (ADR)

| ADR | Decisión | Estado |
|---|---|---|
| [0001](0001-registrar-decisiones.md) | Registrar las decisiones de arquitectura con ADR | Aceptada |
| [0002](0002-monorepo-pnpm-turborepo.md) | Monorepo con pnpm y Turborepo | Aceptada |
| [0003](0003-nucleo-hexagonal-ddd.md) | Núcleo en NestJS con arquitectura hexagonal y DDD | Aceptada |
| [0004](0004-sin-nube-standalone.md) | Sin servicios de nube: app standalone en GitHub | Aceptada |
| [0005](0005-servicios-y-eventos-outbox.md) | Servicios separados con eventos y outbox desde F1 | Aceptada |
| [0006](0006-rest-openapi-contrato.md) | REST con OpenAPI como contrato del núcleo | Aceptada |
| [0007](0007-mongodb-local-vector-search.md) | MongoDB con Vector Search en local para el contexto Mercado | Rechazada (D10) |
| [0008](0008-datos-personales-fuera-del-repo.md) | Datos personales fuera del repo público | Aceptada |
| [0009](0009-auth-jwt-un-usuario.md) | Login propio con JWT y argon2id para un solo usuario | Reemplazada por 0010 |
| [0010](0010-instancia-personal-acceso-local.md) | Instancia personal autoalojada con acceso solo local | Aceptada, ajustada por 0019 |
| [0011](0011-fuentes-correo-primero.md) | Seguimiento por señales, con el correo como fuente principal | Reemplazada por 0015 |
| [0012](0012-mcp-adaptador-de-entrada.md) | Núcleo operable por IA con un servidor MCP | Aceptada, ajustada por 0018 |
| [0013](0013-postgresql-pgvector-servicio-ia.md) | PostgreSQL con pgvector para el servicio con IA | Aceptada |
| [0014](0014-modo-liviano-y-completo.md) | Modo liviano en segundo plano y modo completo al abrir la app | Aceptada |
| [0015](0015-senales-lector-propio-y-mcp.md) | Señales desde un lector de correo propio y desde la IA del usuario | Aceptada |
| [0016](0016-proveedor-de-ia-intercambiable.md) | Proveedor de IA intercambiable: OpenAI o modelo local | Aceptada |
| [0017](0017-app-escritorio-electron.md) | App de escritorio con Electron | Aceptada |
| [0018](0018-mcp-por-http-en-el-nucleo.md) | MCP por HTTP dentro del núcleo | Aceptada (ajusta ADR 0012) |
| [0019](0019-token-siempre-y-origen-local.md) | Token siempre y validación de Host y Origin | Aceptada (ajusta ADR 0010) |
