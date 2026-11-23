# ADR 0004: Sin servicios de nube: app standalone en GitHub

- **Estado:** Aceptada
- **Fecha:** 2026-11-23

## Contexto
El plan v1 desplegaba todo en Google Cloud Run con Terraform. El 23-nov-2026 Juan decidió (D3): «vamos a dejar los servicios cloud fuera por más que lo pidan, quedará como una app standalone en GitHub». Antes se verificaron precios: Cloud SQL cuesta unos USD 7,7 al mes aunque no se use, y Atlas M0 no existe en Santiago.

## Decisión
Brecha corre completa en local con `docker compose` y `pnpm dev`. No se crean cuentas ni recursos en Google Cloud, Atlas en la nube ni Neon. Sale la fase F5 (Terraform) y con ella Pub/Sub. El CI usa GitHub Actions, que no es despliegue ni tiene gasto en un repo público.

## Consecuencias
- Gasto USD 0 y nada que mantener encendido.
- Google Cloud (5 ofertas) y Terraform (3) dejan de cubrirse.
- El puerto `BusDeEventos` se mantiene: si algún día se despliega, se agrega un adaptador sin tocar el dominio.
- El sitio público no queda publicado en internet salvo que la sesión de stack elija exportarlo estático a GitHub Pages.
