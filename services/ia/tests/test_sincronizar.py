from collections.abc import Iterable
from datetime import UTC, date, datetime

from ia.aplicacion.casos.sincronizar_correo import SincronizarCorreo
from ia.aplicacion.puertos import CorreoGuardado, PuntoDeLectura
from ia.dominio.correo import CorreoLeido, EstadoDeCorreo
from tests.fabrica import correo

AHORA = datetime(2026, 11, 24, 12, tzinfo=UTC)


class LectorFalso:
    def __init__(self, correos: list[CorreoLeido], validez: int = 7, falla: bool = False) -> None:
        self.correos = correos
        self.validez = validez
        self.falla = falla
        self.pedidos: list[tuple[int | None, date]] = []

    def uidvalidity(self) -> int:
        if self.falla:
            raise ConnectionError("sin red")
        return self.validez

    def nuevos(self, desde_uid: int | None, desde_fecha: date) -> Iterable[CorreoLeido]:
        self.pedidos.append((desde_uid, desde_fecha))
        return [c for c in self.correos if not desde_uid or c.uid > desde_uid]


class RepoEnMemoria:
    def __init__(self) -> None:
        self.correos: dict[str, CorreoGuardado] = {}
        self.punto = PuntoDeLectura(None, None)
        self.errores: list[str | None] = []

    def punto_de_lectura(self) -> PuntoDeLectura:
        return self.punto

    def existe(self, message_id: str) -> bool:
        return message_id in self.correos

    def guardar(self, correo: CorreoGuardado) -> None:
        self.correos[correo.message_id] = correo

    def registrar_revision(self, punto: PuntoDeLectura, cuando: datetime, error: str | None) -> None:
        self.punto = punto
        self.errores.append(error)

    def en_cola(self) -> int:
        return sum(1 for c in self.correos.values() if c.estado == EstadoDeCorreo.PENDIENTE)


CORREOS = [
    correo(uid=1),
    correo(
        uid=2, remitente="jobs-noreply@linkedin.com", asunto="Empleos recomendados", message_id="<alerta@x>"
    ),
    correo(
        uid=3,
        remitente="no-reply@trabajando.com",
        asunto="Tu proceso",
        texto="No continuaremos con tu postulación",
    ),
]


def caso(lector: LectorFalso, repo: RepoEnMemoria) -> SincronizarCorreo:
    return SincronizarCorreo(lector, repo, lambda: AHORA, dias_primera_vez=60)


def test_primera_vez_lee_60_dias_filtra_y_guarda_solo_el_fragmento_de_lo_que_pasa() -> None:
    lector, repo = LectorFalso(list(CORREOS)), RepoEnMemoria()
    r = caso(lector, repo).ejecutar()
    assert lector.pedidos == [(None, date(2026, 9, 25))]
    assert (r.leidos, r.filtrados, r.pendientes, r.en_cola) == (3, 1, 2, 2)
    assert r.por_plataforma == {"linkedin": 1, "trabajando": 1}
    filtrado = repo.correos["<alerta@x>"]
    assert (
        filtrado.estado == EstadoDeCorreo.FILTRADO and filtrado.fragmento is None and filtrado.asunto is None
    )
    assert repo.correos["<3@ejemplo.test>"].fragmento == "No continuaremos con tu postulación"
    assert repo.punto == PuntoDeLectura(7, 3)


def test_la_siguiente_vuelta_retoma_desde_el_ultimo_uid() -> None:
    lector, repo = LectorFalso(list(CORREOS)), RepoEnMemoria()
    caso(lector, repo).ejecutar()
    lector.correos.append(correo(uid=4, message_id="<4@x>", asunto="Entrevista técnica"))
    r = caso(lector, repo).ejecutar()
    assert lector.pedidos[-1][0] == 3
    assert (r.leidos, r.pendientes) == (1, 1)
    assert repo.punto.ultimo_uid == 4


def test_si_cambia_el_uidvalidity_vuelve_a_la_fecha_y_no_duplica() -> None:
    lector, repo = LectorFalso(list(CORREOS)), RepoEnMemoria()
    caso(lector, repo).ejecutar()
    lector.validez = 8
    r = caso(lector, repo).ejecutar()
    assert lector.pedidos[-1][0] is None
    assert (r.leidos, r.repetidos, r.pendientes) == (3, 3, 0)


def test_un_error_de_la_fuente_queda_visible_y_no_mueve_el_punto() -> None:
    repo = RepoEnMemoria()
    r = caso(LectorFalso(list(CORREOS), falla=True), repo).ejecutar()
    assert r.error == "ConnectionError: sin red"
    assert repo.errores == ["ConnectionError: sin red"]
    assert repo.punto == PuntoDeLectura(None, None)
