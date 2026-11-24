"""Hotfix del 24-nov-2026: la invitación de Google Calendar de FullStack quedó en el filtro.

Un dominio que ya escribió por una postulación pasa el filtro y lleva a esa postulación; las invitaciones
de calendario cuentan como palabra débil; y se pueden releer los correos filtrados de los últimos días.
"""

from collections.abc import Iterable
from datetime import UTC, date, datetime

from ia.aplicacion.casos.sincronizar_correo import ReleerFiltrados
from ia.aplicacion.puertos import CorreoGuardado
from ia.dominio.asociacion import PostulacionConocida
from ia.dominio.correo import EstadoDeCorreo
from ia.dominio.filtro import filtrar
from ia.dominio.pasos import candidatas, decidir
from tests.fabrica import correo

INVITACION = correo(
    remitente="jcorrea@fullstacklabs.co",
    asunto="Invitation: Intro call Juan / Jose @ Thu Nov 26, 2026 2:30pm - 3pm (GMT-3)",
    texto="Jose Correa has invited you to this event. Join with Google Meet: meet.google.com/abc-defg-hij",
    uid=9,
)
SIN_PALABRAS = correo(remitente="jcorrea@fullstacklabs.co", asunto="Hola", texto="¿Nos vemos el jueves?")
FULLSTACK = PostulacionConocida("fs", "FullStack", "Junior Forward Deployed AI Engineer", "otra", True)


def test_un_dominio_que_ya_escribio_por_una_postulacion_pasa_aunque_no_traiga_palabras() -> None:
    assert not filtrar(SIN_PALABRAS).pasa
    f = filtrar(SIN_PALABRAS, frozenset({"fullstacklabs.co"}))
    assert f.pasa and f.motivo == "remitente que ya escribió por una postulación"
    masivo = correo(remitente="news@fullstacklabs.co", asunto="Newsletter", texto="x", masivo=True)
    assert not filtrar(masivo, frozenset({"fullstacklabs.co"})).pasa


def test_una_invitacion_pasa_solo_si_el_remitente_o_el_texto_confirman_una_empresa_tuya() -> None:
    # No todas las reuniones son de postulaciones: sin empresa confirmada no sale de la máquina.
    assert not filtrar(INVITACION).pasa
    assert filtrar(INVITACION).motivo == "invitación de calendario sin relación con tus postulaciones"
    f = filtrar(INVITACION, empresas_conocidas=frozenset({"fullstack"}))
    assert f.pasa and f.motivo == "invitación de calendario de fullstack"  # por el dominio fullstacklabs.co
    dentista = correo(
        remitente="agenda@clinica-sonrisa.cl",
        asunto="Invitation: Control dental @ Fri Nov 27",
        texto="Join with Google Meet",
    )
    assert not filtrar(dentista, empresas_conocidas=frozenset({"fullstack", "lanek"})).pasa
    desde_gmail = correo(
        remitente="jose.correa@gmail.com",
        asunto="Invitation: Llamada con Lanek @ Thu Nov 26",
        texto="Conversemos sobre el cargo. Join with Google Meet",
    )
    assert filtrar(desde_gmail, empresas_conocidas=frozenset({"lanek"})).pasa  # la empresa está en el asunto


def test_el_dominio_lleva_a_su_postulacion_y_con_varias_elige_el_modelo() -> None:
    una = candidatas(
        empresa=None,
        cargo=None,
        plataforma=None,
        dominio_remitente="fullstacklabs.co",
        textos=(INVITACION.asunto,),
        conocidas=[FULLSTACK],
        del_dominio=("fs",),
    )
    assert una[0].segura and una[0].motivo == "mismo dominio que un correo de esa postulación"
    assert decidir(una, []).postulacion_ids == ("fs",)

    otra = PostulacionConocida("fs2", "FullStack", "Data Engineer", "otra", True)
    varias = candidatas(
        empresa=None,
        cargo=None,
        plataforma=None,
        dominio_remitente="fullstacklabs.co",
        textos=("x",),
        conocidas=[FULLSTACK, otra],
        del_dominio=("fs", "fs2"),
    )
    assert {c.id for c in varias} == {"fs", "fs2"} and not any(c.segura for c in varias)
    assert decidir(varias, ["fs2"]).postulacion_ids == ("fs2",)


class Lector:
    def nuevos(self, desde_uid: int | None, desde_fecha: date) -> Iterable:  # type: ignore[type-arg]
        assert desde_uid is None
        return [INVITACION, SIN_PALABRAS]


class Repo:
    def __init__(self) -> None:
        self.estados = {INVITACION.message_id: "filtrado", SIN_PALABRAS.message_id: "clasificado"}
        self.reabiertos: list[CorreoGuardado] = []

    def dominios_conocidos(self) -> frozenset[str]:
        return frozenset({"fullstacklabs.co"})

    def empresas_conocidas(self) -> frozenset[str]:
        return frozenset()

    def estado_de(self, message_id: str) -> str | None:
        return self.estados.get(message_id)

    def reabrir(self, g: CorreoGuardado) -> bool:
        self.reabiertos.append(g)
        return True

    # Lo demás de RepositorioDeCorreos no se usa al releer.
    def punto_de_lectura(self):  # type: ignore[no-untyped-def]
        raise AssertionError

    def existe(self, message_id: str) -> bool:
        raise AssertionError

    def guardar(self, correo: CorreoGuardado) -> None:
        raise AssertionError

    def registrar_revision(self, punto, cuando, error) -> None:  # type: ignore[no-untyped-def]
        raise AssertionError

    def en_cola(self) -> int:
        raise AssertionError


def test_releer_vuelve_a_la_cola_solo_los_filtrados_que_ahora_pasan() -> None:
    repo = Repo()
    r = ReleerFiltrados(Lector(), repo, lambda: datetime(2026, 11, 24, tzinfo=UTC)).ejecutar(2)  # type: ignore[arg-type]
    assert (r.leidos, r.reabiertos) == (2, 1)
    [g] = repo.reabiertos
    assert g.estado == EstadoDeCorreo.PENDIENTE and g.asunto == INVITACION.asunto
    assert "meet.google.com" in (g.fragmento or "")  # sin http, no es un enlace: queda como texto
