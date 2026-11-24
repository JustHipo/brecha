from datetime import UTC, datetime

from ia.aplicacion.casos.registrar_senales import RegistrarSenales
from ia.aplicacion.puertos import (
    ClasificadoPorEnviar,
    NucleoNoDisponible,
    RespuestaDelNucleo,
    SenalParaNucleo,
)
from ia.dominio.asociacion import PostulacionConocida
from ia.dominio.clasificacion import Clasificacion

FECHA = datetime(2026, 11, 20, tzinfo=UTC)


def item(
    mid: str, empresa: str | None, cargo: str | None, estado: str | None = "rechazado"
) -> ClasificadoPorEnviar:
    return ClasificadoPorEnviar(
        mid, Clasificacion(True, "sitio_empresa", empresa, cargo, estado, "r", 0.95), "a@b.test", "s", FECHA
    )


class NucleoFalso:
    def __init__(self, cae: bool = False) -> None:
        self.enviadas: list[SenalParaNucleo] = []
        self.cae = cae

    def postulaciones(self) -> list[PostulacionConocida]:
        if self.cae:
            raise NucleoNoDisponible("ConnectError")
        return [PostulacionConocida("p1", "Ficticia", "Backend", "sitio_empresa", True)]

    def registrar_senal(self, s: SenalParaNucleo) -> RespuestaDelNucleo:
        self.enviadas.append(s)
        if s.referencia_externa == "<rep@x>":
            return RespuestaDelNucleo("repetida", False, None)
        if s.postulacion_id is None:
            return RespuestaDelNucleo("bandeja", False, None)
        return RespuestaDelNucleo("postulacion", True, "rechazado")


class ColaFalsa:
    def __init__(self, items: list[ClasificadoPorEnviar]) -> None:
        self.items = items
        self.enviados: dict[str, tuple[str, ...]] = {}

    def por_enviar(self, limite: int) -> list[ClasificadoPorEnviar]:
        return [i for i in self.items if i.message_id not in self.enviados][:limite]

    def marcar_enviado(self, message_id: str, postulacion_ids: tuple[str, ...]) -> None:
        self.enviados[message_id] = postulacion_ids


ITEMS = [
    item("<1@x>", "Ficticia", "Backend"),
    item("<2@x>", "Desconocida", "X"),
    item("<rep@x>", "Ficticia", "Backend"),
]


def test_en_seco_no_envia_ni_marca() -> None:
    nucleo, cola = NucleoFalso(), ColaFalsa(list(ITEMS))
    r = RegistrarSenales(nucleo, cola, en_seco=True).ejecutar()
    assert nucleo.enviadas == [] and cola.enviados == {}
    assert len(r.detalle) == 3 and "→ Ficticia · Backend" in r.detalle[0] and "→ bandeja" in r.detalle[1]


def test_envia_asocia_y_cuenta() -> None:
    nucleo, cola = NucleoFalso(), ColaFalsa(list(ITEMS))
    r = RegistrarSenales(nucleo, cola).ejecutar()
    assert (r.a_postulacion, r.aplicadas, r.a_bandeja, r.repetidas) == (1, 1, 1, 1)
    assert cola.enviados == {"<1@x>": ("p1",), "<2@x>": (), "<rep@x>": ("p1",)}
    assert (
        nucleo.enviadas[0].referencia_externa == "<1@x>" and nucleo.enviadas[0].estado_sugerido == "rechazado"
    )
    assert RegistrarSenales(nucleo, cola).ejecutar().a_postulacion == 0


def test_nucleo_caido_no_marca_nada() -> None:
    cola = ColaFalsa(list(ITEMS))
    r = RegistrarSenales(NucleoFalso(cae=True), cola).ejecutar()
    assert r.error == "núcleo no disponible: ConnectError" and cola.enviados == {}
