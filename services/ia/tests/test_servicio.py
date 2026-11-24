"""El ejecutable `brecha-ia`: reparte los subcomandos y encuentra las migraciones en ambos modos."""

import sys
from pathlib import Path

import pytest

from ia.entradas import cli, servicio


def test_la_ayuda_lista_todos_los_subcomandos(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as salida:
        servicio.main(["--help"])
    assert salida.value.code == 0
    ayuda = capsys.readouterr().out
    for comando in ("api", "vigia", "migrar", "comprobar", *servicio.COMANDOS_DE_LA_CLI):
        assert comando in ayuda


@pytest.mark.parametrize("comando", servicio.COMANDOS_DE_LA_CLI)
def test_los_comandos_de_la_cli_van_a_la_cli(monkeypatch: pytest.MonkeyPatch, comando: str) -> None:
    recibido: list[list[str] | None] = []
    monkeypatch.setattr(cli, "main", lambda argv=None, llavero=None: recibido.append(argv) or 0)
    assert servicio.main([comando, "estado"]) == 0
    assert recibido == [[comando, "estado"]]


def test_todo_subcomando_de_la_cli_se_puede_usar_desde_el_ejecutable(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Si la CLI suma un comando y el ejecutable no lo deja pasar, la app instalada no lo puede correr."""
    import re

    with pytest.raises(SystemExit):
        cli.main(["--help"])
    opciones = re.search(r"\{([a-z,-]+)\}", capsys.readouterr().out)
    assert opciones is not None
    assert set(opciones.group(1).split(",")) == set(servicio.COMANDOS_DE_LA_CLI)


def test_desde_el_codigo_las_migraciones_estan_en_services_ia() -> None:
    base = servicio.carpeta_de_migraciones()
    assert (base / "alembic.ini").is_file()
    assert list((base / "alembic" / "versions").glob("*.py"))


def test_empaquetado_las_migraciones_estan_dentro_del_ejecutable(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    assert servicio.carpeta_de_migraciones() == tmp_path / "migraciones"


def test_comprobar_desde_el_codigo(capsys: pytest.CaptureFixture[str]) -> None:
    assert servicio.main(["comprobar"]) == 0
    assert "brecha-ia completo (desde el código)" in capsys.readouterr().out


def test_sin_configuracion_sale_con_ex_config(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.delenv("BRECHA_DIR", raising=False)
    assert servicio.main(["vigia"]) == servicio.SALIDA_CONFIG_INVALIDA
    assert "Falta BRECHA_DIR" in capsys.readouterr().err


def test_la_salida_queda_en_utf8() -> None:
    import io
    import sys

    from ia.entradas import servicio

    antes = sys.stdout, sys.stderr
    try:
        sys.stdout = io.TextIOWrapper(io.BytesIO(), encoding="cp1252")
        sys.stderr = io.TextIOWrapper(io.BytesIO(), encoding="cp1252")
        servicio.salida_en_utf8()
        assert sys.stdout.encoding == "utf-8" and sys.stderr.encoding == "utf-8"
        print("vigía en marcha")
        sys.stdout.flush()
        assert "vigía".encode() in sys.stdout.buffer.getvalue()  # type: ignore[attr-defined]
    finally:
        sys.stdout, sys.stderr = antes
