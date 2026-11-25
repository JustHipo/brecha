# Brecha

Seguimiento personal de postulaciones de empleo. Juntas en un tablero las postulaciones de todas las plataformas, registras la evidencia que llega (correos, cambios en los portales) como **señales**, y Brecha te avisa cuando un movimiento del tablero no calza con esa evidencia (**discrepancias**). Una IA (Claude Code, Claude Desktop u otra) puede operarla por **MCP**.

Brecha se instala y corre en tu máquina: no hay servidor central, cuentas ni nube. Tus datos no salen de tu equipo.

## 

> Estado: **fase F1** (núcleo, consola y MCP). Las fuentes automáticas (lector de correo, IA) llegan en F2 y la app de escritorio en F3. El plan completo está en [`docs/PLAN.md`](docs/PLAN.md) y las decisiones en [`docs/adr/`](docs/adr/).

## Cómo está hecho

```
 ┌──────────────────────── tu máquina (127.0.0.1) ────────────────────────┐
 │                                                                         │
 │  Consola Angular ──REST──▶  Núcleo NestJS  ◀──MCP (HTTP)── tu IA       │
 │  tablero, ficha,            hexagonal + DDD        (Claude Code…)       │
 │  discrepancias ◀──SSE──     Prisma 7 ─▶ PostgreSQL 17 (pgvector)        │
 │                                                                         │
 └─────────────────────────────────────────────────────────────────────────┘
```

- **Núcleo** (`services/nucleo`): NestJS 12 con arquitectura hexagonal. El dominio (`postulaciones/dominio`) no importa NestJS ni Prisma; lo hace cumplir dependency-cruiser en el CI. Tres adaptadores de entrada sobre los mismos casos de uso: REST (consola), MCP (IA) y, desde F2, el servicio de fuentes. Los eventos se guardan en un outbox en la misma transacción que el agregado.
- **Consola** (`apps/consola`): Angular 22 (standalone, signals), Spartan sobre Tailwind 4, Transloco (español e inglés) y Angular CDK para arrastrar y soltar. Los tipos de la API salen del contrato OpenAPI (`packages/contratos`): si el contrato cambia, la consola no compila.
- **Seguridad local** (ADR 0010 y 0019): el núcleo escucha solo en `127.0.0.1`, siempre pide token, rechaza un `Host` o un `Origin` ajenos y admite una clave local opcional (argon2id).

## Correrlo

Requisitos: Node 22.22 o más, pnpm 11 y Docker (solo para PostgreSQL en desarrollo).

```bash
cp .env.example .env
pnpm install
docker compose --profile liviano up -d --wait
pnpm --filter nucleo db:migrar
pnpm --filter nucleo importar datos/ejemplo/artifact-export.json
pnpm dev
```

- Consola: http://localhost:4200 · API: http://127.0.0.1:4300/api/v1 · OpenAPI: http://127.0.0.1:4300/docs
- El último paso de importación carga 5 postulaciones inventadas. Con datos reales, deja tu export en `datos/privado/` (está en `.gitignore`) y corre `pnpm --filter nucleo importar`.
- PostgreSQL queda en `127.0.0.1:5433` para no chocar con otra instancia local.

### Clave local (opcional)

```bash
pnpm --filter nucleo clave
```

Pide la clave y la guarda con argon2id. Reinicia el núcleo: la consola pedirá desbloquear. `pnpm --filter nucleo clave -- --quitar` la quita.

### Conectar tu IA por MCP

Con el núcleo corriendo, el token de MCP está en `.brecha/token-mcp` (permisos 0600). En Claude Code:

```bash
claude mcp add --transport http --scope local brecha http://127.0.0.1:4300/mcp --header "Authorization: Bearer $(cat .brecha/token-mcp)"
```

Herramientas: `listar_postulaciones`, `ver_postulacion`, `crear_postulacion`, `cambiar_estado`, `editar_postulacion`, `agregar_nota`, `agregar_contacto`, `agendar_entrevista`, `registrar_senal`, `aplicar_senal`, `listar_discrepancias`, `resolver_discrepancia`, `resumen` y `exportar`. Lo que haga la IA queda con origen `ia` y pasa por las mismas reglas que la consola.

## Pruebas

```bash
pnpm turbo run lint typecheck test build   # lo mismo que corre el CI
pnpm turbo run e2e                          # Playwright del flujo principal, con axe
```

- Dominio: las 81 transiciones de estado y las reglas R1 a R14, sin base de datos.
- Persistencia, API y MCP: contra la base `brecha_pruebas` del mismo `docker compose`.
- Consola: stores, guard e interceptores con Vitest; el flujo completo con Playwright contra el núcleo real.

## Estructura

```
apps/consola          Angular 22 + Spartan + Tailwind 4
services/nucleo       NestJS 12 hexagonal + Prisma 7 + MCP
packages/contratos    openapi.json y tipos generados
packages/config       tsconfig y ESLint compartidos
datos/ejemplo         datos inventados para probar
docs/                 plan, diseño y decisiones (ADR)
```

## Datos y privacidad

El repositorio es público y no contiene datos personales: los datos reales van a `datos/privado/` y a la base local (ADR 0008).
