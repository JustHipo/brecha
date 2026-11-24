import json
from pathlib import Path

from ia.aplicacion.casos.evaluar import (
    CasoDeCorreo,
    CasoDePregunta,
    EvaluarCorreos,
    EvaluarPreguntas,
    RespuestaEvaluada,
)
from ia.aplicacion.puertos import AvisoGuardado, Uso
from ia.dominio.asociacion import PostulacionConocida
from ia.dominio.aviso import Aviso
from ia.dominio.clasificacion import Clasificacion

SET = Path(__file__).resolve().parents[3] / "datos" / "ejemplo" / "eval" / "correos.json"


class ModeloQueLeeElSet:
    """Responde lo que dice el set (para probar la mecánica), salvo los casos que se le pide equivocar."""

    def __init__(self, casos: dict[str, dict[str, object]], equivocar: dict[str, str]) -> None:
        self.casos = casos
        self.equivocar = equivocar

    def clasificar_correo(
        self, remitente: str, asunto: str, fragmento: str, plataforma_detectada: str | None
    ) -> tuple[Clasificacion, Uso]:
        c = next(c for c in self.casos.values() if c["asunto"] == asunto)
        estado = self.equivocar.get(str(c["id"]), c["estado"])
        empresa = {
            "p-norte": "Norte Datos SpA",
            "p-lago": "Lago Software",
            "p-cumbre": "Cumbre Pagos",
            "p-rio": "Río Logística",
        }
        cargo = {
            "p-norte": "Desarrollador Backend NestJS",
            "p-lago": "Ingeniero de Software Full Stack",
            "p-cumbre": "Analista de Datos",
            "p-rio": "Desarrollador Python",
        }
        pid = c["postulacion"]
        es = pid is not None
        k = Clasificacion(
            es,
            plataforma_detectada or "otra",
            empresa.get(str(pid)) if pid else None,
            cargo.get(str(pid)) if pid else None,
            str(estado) if estado and es else None,
            "resumen",
            0.9,
        )
        return k, Uso("falso", 1, 1, 1)


def _set() -> tuple[list[PostulacionConocida], list[CasoDeCorreo], dict[str, dict[str, object]]]:
    d = json.loads(SET.read_text(encoding="utf-8"))
    conocidas = [
        PostulacionConocida(p["id"], p["empresa"], p["titulo"], p["plataforma"], p["activa"])
        for p in d["postulaciones"]
    ]
    casos = [
        CasoDeCorreo(c["id"], c["remitente"], c["asunto"], c["texto"], c["estado"], c["postulacion"])
        for c in d["casos"]
    ]
    return conocidas, casos, {c["id"]: c for c in d["casos"]}


def test_el_set_inventado_pasa_con_un_modelo_que_acierta() -> None:
    conocidas, casos, crudos = _set()
    r = EvaluarCorreos(ModeloQueLeeElSet(crudos, {}), conocidas).ejecutar(casos)
    assert r.casos == 10 and r.pasa, r.fallos


def test_dos_falsos_rechazos_no_pasan_aunque_el_resto_acierte() -> None:
    conocidas, casos, crudos = _set()
    r = EvaluarCorreos(
        ModeloQueLeeElSet(crudos, {"c01": "rechazado", "c03": "rechazado"}), conocidas
    ).ejecutar(casos)
    assert r.falsos_rechazos == 2 and r.tasa_estado == 0.8
    assert not r.pasa


def test_preguntas_recall_y_citas_inventadas() -> None:
    def g(url: str) -> AvisoGuardado:
        return AvisoGuardado(url, Aviso(url, "t", "e", "otra", "remoto", "manual", "x"), None, None, None)

    respuestas = {
        "a": RespuestaEvaluada([g("https://x.test/1")], 0),
        "b": RespuestaEvaluada([g("https://x.test/2")], 1),
    }
    casos = [
        CasoDePregunta("q1", "a", ("https://x.test/1",)),
        CasoDePregunta("q2", "b", ("https://x.test/2", "https://x.test/3")),
    ]
    r = EvaluarPreguntas(lambda p: respuestas[p]).ejecutar(casos)
    assert r.recall == 2 / 3
    assert r.tasa_citas_validas == 2 / 3
    assert not r.pasa
    assert any("inventadas" in f for f in r.fallos)
