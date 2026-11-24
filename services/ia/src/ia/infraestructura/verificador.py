"""La API de IA valida el token de la consola preguntándole al núcleo (f2.md §6), con caché de 60 s."""

import time
from collections.abc import Callable

import httpx

CACHE_SEGUNDOS = 60


class VerificadorDeTokens:
    def __init__(
        self,
        nucleo_url: str,
        cliente: httpx.Client | None = None,
        reloj: Callable[[], float] = time.monotonic,
    ):
        self.cliente = cliente or httpx.Client(base_url=nucleo_url, timeout=5)
        self.reloj = reloj
        self._cache: dict[str, tuple[float, str | None]] = {}

    def tipo(self, token: str | None) -> str | None:
        """Tipo del token (`sesion`, `mcp`, `servicio`) o None si no es válido o el núcleo no responde."""
        if not token:
            return None
        ahora = self.reloj()
        guardado = self._cache.get(token)
        if guardado and ahora - guardado[0] < CACHE_SEGUNDOS:
            return guardado[1]
        try:
            r = self.cliente.get("/api/v1/acceso/verificar", headers={"Authorization": f"Bearer {token}"})
            tipo = r.json().get("tipo") if r.status_code == 200 else None
        except httpx.HTTPError:
            return None  # sin núcleo no se confía en nada; no se guarda en caché
        self._cache[token] = (ahora, tipo)
        return tipo
