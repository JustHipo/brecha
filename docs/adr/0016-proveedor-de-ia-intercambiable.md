# ADR 0016: Proveedor de IA intercambiable: OpenAI o modelo local

- **Estado:** Aceptada
- **Fecha:** 2026-11-23

## Contexto
Cada persona trae su IA (D8). Juan decidió el 23-nov-2026 (D13) una interfaz que acepte OpenAI y un modelo local, para que quien no quiera mandar sus correos afuera pueda usar Brecha igual.

## Decisión
El servicio con IA define dos puertos: `ModeloDeLenguaje` (clasificar, extraer, responder) y `ModeloDeEmbeddings`. Hay un adaptador para la API de OpenAI y uno para un modelo local compatible (Ollama u otro con API compatible con OpenAI; se elige en F2). El proveedor se elige en Ajustes; la llave va al llavero del sistema operativo. Los embeddings guardan con qué modelo se calcularon, y al cambiar de modelo se recalculan.

## Consecuencias
- Con modelo local, nada sale de la máquina, pero el modo liviano no clasifica (ADR 0014) y hace falta más RAM con la app abierta.
- Las pruebas de clasificación corren contra los dos adaptadores.
- Sumar otro proveedor (por ejemplo Anthropic) es un adaptador más.
