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
    openai_modelo: str | None = None  # se elige al empezar F2 (docs/diseno/f2.md §4)
    openai_modelo_embeddings: str = "text-embedding-3-small"

    @property
    def carpeta_instancia(self) -> Path:
        return self.brecha_dir if self.brecha_dir.is_absolute() else RAIZ / self.brecha_dir


def cargar_config() -> Config:
    return Config()  # type: ignore[call-arg]
