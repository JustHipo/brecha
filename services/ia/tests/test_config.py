"""Configuración desde el código (lee el .env del repo) y empaquetada (solo el entorno que pasa la app)."""

import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from ia.infraestructura import config
from ia.infraestructura.config import ConfigInvalida, cargar_config, esta_empaquetado

URL = "postgresql+psycopg://ia:clave@127.0.0.1:5433/brecha_pruebas"


@pytest.fixture
def empaquetado(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "frozen", True, raising=False)


def test_desde_el_codigo_no_esta_empaquetado() -> None:
    assert esta_empaquetado() is False
    assert (config.RAIZ / "services" / "ia" / "pyproject.toml").is_file()


@pytest.mark.skipif(not (config.RAIZ / ".env").is_file(), reason="sin .env en la raíz del repo")
def test_desde_el_codigo_lee_el_env_del_repo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("IA_DATABASE_URL", raising=False)
    assert cargar_config().ia_database_url  # viene del .env


def test_desde_el_codigo_la_carpeta_relativa_cuelga_de_la_raiz(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("IA_DATABASE_URL", URL)
    monkeypatch.setenv("BRECHA_DIR", ".brecha")
    assert cargar_config().carpeta_instancia == config.RAIZ / ".brecha"


def test_desde_el_codigo_no_exige_brecha_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("IA_DATABASE_URL", URL)
    monkeypatch.delenv("BRECHA_DIR", raising=False)
    assert cargar_config().carpeta_instancia.is_absolute()


@pytest.mark.usefixtures("empaquetado")
def test_empaquetado_se_reconoce() -> None:
    assert esta_empaquetado() is True


@pytest.mark.usefixtures("empaquetado")
def test_empaquetado_no_lee_el_env_del_repo(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("IA_DATABASE_URL", raising=False)
    monkeypatch.setenv("BRECHA_DIR", str(tmp_path))
    with pytest.raises(ValidationError, match="ia_database_url"):
        cargar_config()


@pytest.mark.usefixtures("empaquetado")
def test_empaquetado_usa_lo_que_pasa_la_app(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("IA_DATABASE_URL", URL)
    monkeypatch.setenv("BRECHA_DIR", str(tmp_path))
    monkeypatch.setenv("NUCLEO_URL", "http://127.0.0.1:4399")
    monkeypatch.setenv("CONSOLA_ORIGEN", "http://127.0.0.1:4399")
    monkeypatch.setenv("IA_PUERTO", "4499")
    cfg = cargar_config()
    assert cfg.ia_database_url == URL
    assert cfg.carpeta_instancia == tmp_path
    assert cfg.nucleo_url == "http://127.0.0.1:4399"
    assert cfg.consola_origen == "http://127.0.0.1:4399"
    assert cfg.ia_puerto == 4499


@pytest.mark.usefixtures("empaquetado")
def test_empaquetado_exige_brecha_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("IA_DATABASE_URL", URL)
    monkeypatch.delenv("BRECHA_DIR", raising=False)
    with pytest.raises(ConfigInvalida, match="Falta BRECHA_DIR"):
        cargar_config()


@pytest.mark.usefixtures("empaquetado")
def test_empaquetado_exige_brecha_dir_absoluta(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("IA_DATABASE_URL", URL)
    monkeypatch.setenv("BRECHA_DIR", "./.brecha")
    with pytest.raises(ConfigInvalida, match="absoluta"):
        cargar_config()
