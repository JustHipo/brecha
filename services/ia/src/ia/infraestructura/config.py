"""Configuración del servicio, cargada y validada al arrancar (igual que el núcleo).

Dos modos:
- desde el código (desarrollo): lee las variables de entorno y el `.env` de la raíz del repo;
- empaquetado con PyInstaller dentro de la app de escritorio (`sys.frozen`): lee solo las variables
  de entorno que le pasa la app, y `BRECHA_DIR` es obligatoria y absoluta (no hay repo a mano).
"""

import os
import sys
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def esta_empaquetado() -> bool:
    """True cuando corre como el ejecutable de PyInstaller (`brecha-ia`), no desde el código."""
    return bool(getattr(sys, "frozen", False))


def _raiz() -> Path:
    if esta_empaquetado():  # sin repo: la carpeta del ejecutable, solo para no fallar al importar
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[5]


RAIZ = _raiz()


class ConfigInvalida(ValueError):
    """Falta o está mal una variable de entorno que el servicio empaquetado necesita."""


class Config(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=RAIZ / ".env", env_file_encoding="utf-8", extra="ignore", case_sensitive=False
    )

    ia_database_url: str = Field(description="PostgreSQL con el usuario `ia` (esquema `ia`)")
    ia_puerto: int = 4400
    nucleo_url: str = "http://127.0.0.1:4300"
    consola_origen: str = "http://localhost:4200"
    brecha_dir: Path = Path(".brecha")
    vigia_minutos: int = Field(default=15, ge=1, le=1440)  # D29
    dias_primera_sincronizacion: int = Field(default=60, ge=1, le=365)  # D33
    # Elegido en F2-06 con la página oficial de precios (developers.openai.com/api/docs/pricing, 2026-11-24).
    openai_modelo: str = "gpt-6-luna"
    openai_precio_entrada: float = 0.10  # USD por millón de tokens
    openai_precio_salida: float = 0.50
    openai_modelo_embeddings: str = "text-embedding-3-small"
    openai_precio_embeddings: float = 0.02  # USD por millón de tokens (página oficial, 2026-11-24)
    # Búsquedas guardadas de Get on Board que repite el vigía.
    # En el .env van en JSON: GETONBOARD_BUSQUEDAS=["nestjs"].
    getonboard_busquedas: list[str] = Field(default_factory=list)
    getonboard_cada_horas: int = Field(default=24, ge=1, le=720)

    @property
    def carpeta_instancia(self) -> Path:
        return self.brecha_dir if self.brecha_dir.is_absolute() else RAIZ / self.brecha_dir


def _brecha_dir_del_entorno() -> Path:
    valor = next((v for k, v in os.environ.items() if k.upper() == "BRECHA_DIR"), "").strip()
    if not valor:
        raise ConfigInvalida("Falta BRECHA_DIR: la app debe pasar la carpeta de la instancia")
    ruta = Path(valor).expanduser()
    if not ruta.is_absolute():
        raise ConfigInvalida(f"BRECHA_DIR debe ser una ruta absoluta (llegó {valor!r})")
    return ruta


def cargar_config() -> Config:
    if esta_empaquetado():
        # Solo el entorno: nada de un .env que no es de esta instalación.
        return Config(_env_file=None, brecha_dir=_brecha_dir_del_entorno())  # type: ignore[call-arg]
    return Config()  # type: ignore[call-arg]
