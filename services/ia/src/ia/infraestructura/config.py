"""Configuración del servicio, cargada y validada al arrancar (igual que el núcleo)."""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ = Path(__file__).resolve().parents[5]


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


def cargar_config() -> Config:
    return Config()  # type: ignore[call-arg]
