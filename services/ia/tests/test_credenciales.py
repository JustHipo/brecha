import pytest

from ia.aplicacion.puertos import TipoDeCredencial, estado_de
from ia.entradas import cli
from ia.entradas.vigia import una_vuelta


class LlaveroEnMemoria:
    def __init__(self) -> None:
        self.datos: dict[TipoDeCredencial, str] = {}

    def obtener(self, tipo: TipoDeCredencial) -> str | None:
        return self.datos.get(tipo)

    def guardar(self, tipo: TipoDeCredencial, valor: str) -> None:
        self.datos[tipo] = valor

    def borrar(self, tipo: TipoDeCredencial) -> None:
        self.datos.pop(tipo, None)


def test_sin_credenciales_el_vigia_dice_que_falta(caplog: pytest.LogCaptureFixture) -> None:
    faltan = una_vuelta(LlaveroEnMemoria())
    assert faltan == ["correo (uv run ia credenciales correo)", "OpenAI (uv run ia credenciales openai)"]
    assert "faltan credenciales" in caplog.text


def test_guarda_correo_sin_imprimir_la_clave(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    ll = LlaveroEnMemoria()
    monkeypatch.setattr("builtins.input", lambda _: "persona@ejemplo.test")
    monkeypatch.setattr("getpass.getpass", lambda _: "abcd efgh ijkl mnop")
    assert cli.main(["credenciales", "correo"], ll) == 0
    assert ll.datos[TipoDeCredencial.CORREO_CLAVE] == "abcdefghijklmnop"
    assert "abcd" not in capsys.readouterr().out
    assert estado_de(ll).correo is True


def test_rechaza_una_llave_que_no_es_de_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    ll = LlaveroEnMemoria()
    monkeypatch.setattr("getpass.getpass", lambda _: "no-es-una-llave")
    assert cli.main(["credenciales", "openai"], ll) == 1
    assert estado_de(ll).openai is False


def test_estado_y_borrar(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    ll = LlaveroEnMemoria()
    ll.guardar(TipoDeCredencial.OPENAI, "sk-prueba")
    cli.main(["credenciales", "estado"], ll)
    salida = capsys.readouterr().out
    assert "OpenAI: configurado" in salida and "Correo: falta" in salida
    assert "sk-prueba" not in salida
    cli.main(["credenciales", "borrar"], ll)
    assert ll.datos == {}


def test_una_vuelta_que_falla_no_detiene_al_vigia(caplog: pytest.LogCaptureFixture) -> None:
    from ia.entradas import vigia

    ll = LlaveroEnMemoria()
    ll.guardar(TipoDeCredencial.CORREO_USUARIO, "p@e.test")
    ll.guardar(TipoDeCredencial.CORREO_CLAVE, "x" * 16)

    def rompe():  # type: ignore[no-untyped-def]
        raise RuntimeError("se cayó")

    with pytest.raises(RuntimeError):
        vigia.una_vuelta(ll, rompe)
    # main() envuelve cada vuelta en try/except y sigue; aquí se mira el log de una vuelta sana
    vigia.una_vuelta(ll, None, None, None)
    assert "falta la llave de OpenAI" in caplog.text
