# ADR 0007: MongoDB con Vector Search en local para el contexto Mercado

- **Estado:** Rechazada (D10, 23-nov-2026): se usa PostgreSQL con pgvector, ADR 0013
- **Fecha:** 2026-11-23

## Contexto
El servicio con IA guarda avisos de portales distintos, con campos distintos, y busca por similitud para el RAG. Cinco ofertas piden MongoDB y cuatro bases vectoriales. Con D3 no hay Atlas en la nube.

## Decisión
Usar la imagen oficial `mongodb/mongodb-atlas-local` en `docker compose`, que trae Search y Vector Search en un nodo único y su propio healthcheck (verificado el 23-nov-2026 en la documentación de MongoDB). Se fija un tag (8.x estable o 9.0) y no se mezclan, porque sus volúmenes no son compatibles.

## Consecuencias
- Pide al menos 2 GB de RAM y 2 núcleos libres.
- La generación automática de embeddings de la imagen necesita una llave de Voyage; el proveedor de embeddings se decide en la sesión de stack.
- La documentación no lista diferencias con Atlas en la nube; si aparece alguna, se anota en el repo.
