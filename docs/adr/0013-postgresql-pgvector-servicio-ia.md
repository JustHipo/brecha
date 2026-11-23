# ADR 0013: PostgreSQL con pgvector para el servicio con IA

- **Estado:** Aceptada
- **Fecha:** 2026-11-23

## Contexto
El ADR 0007 proponía MongoDB con Vector Search en local para avisos, correos y señales. Juan decidió el 23-nov-2026 (D10) usar FastAPI con PostgreSQL. La app corre en la máquina de cada persona y en segundo plano (D9), así que cada base extra pesa: MongoDB local pide al menos 2 GB de RAM.

## Decisión
El servicio con IA (FastAPI) usa la misma instancia de PostgreSQL que el núcleo, pero en su propio esquema `ia`, con su propio usuario de base y sin leer el esquema del núcleo (cada servicio es dueño de sus datos). Los embeddings van en columnas `vector` de pgvector, con índice HNSW. La imagen es `pgvector/pgvector:pg17`. La extensión se crea solo en el esquema `ia`; el núcleo (Prisma) no la declara, para evitar el drift que generan las extensiones declaradas en dos lugares.

## Consecuencias
- Una base menos y menos memoria en segundo plano.
- MongoDB (5 ofertas) deja de cubrirse en el proyecto; RAG con base vectorial (4) sigue cubierto.
- Los avisos de portales distintos se guardan como `jsonb` para los campos que varían.
- Separar en dos instancias más adelante es cambiar una cadena de conexión.
