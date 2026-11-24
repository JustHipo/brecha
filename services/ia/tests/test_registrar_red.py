import os
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from ia.aplicacion.casos.registrar_red import RegistrarRed
from ia.aplicacion.casos.sincronizar_correo import ingresar
from ia.aplicacion.puertos import AvisoRedPorEnviar, NucleoNoDisponible
from ia.dominio.asociacion import PostulacionConocida
from ia.dominio.correo import CorreoLeido
from ia.dominio.linkedin import AvisoDeLinkedin
from ia.infraestructura.config import cargar_config
from ia.infraestructura.postgres.correos import RepositorioPostgresDeCorreos
from ia.infraestructura.postgres.motor import crear_motor

AHORA = datetime(2026, 11, 24, 12, tzinfo=UTC)
ANA = AvisoDeLinkedin(
    "mensaje_recibido",
    "Ana Ficticia",
    "https://www.linkedin.com/in/ana",
    "Recruiter at Norte Datos",
    "Norte Datos",
)
LUIS = AvisoDeLinkedin("solicitud_aceptada", "Luis Ejemplo", "https://www.linkedin.com/in/luis", None, None)


class NucleoFalso:
    def __init__(self, cae: bool = False) -> None:
        self.cae = cae
        self.contactos: dict[str, str] = {}
        self.interacciones: list[tuple[str, str, str]] = []
        self.ligados: list[tuple[str, str]] = []

    def postulaciones(self) -> list[PostulacionConocida]:
        if self.cae:
            raise NucleoNoDisponible("ConnectError")
        return [
            PostulacionConocida("p1", "Norte Datos SpA", "Backend", "linkedin", True),
            PostulacionConocida("p2", "Lago", "Frontend", "linkedin", True),
        ]

    def registrar_contacto_red(
        self, nombre: str, perfil_url: str, titular: str | None, empresa: str | None
    ) -> str:
        return self.contactos.setdefault(perfil_url, f"c{len(self.contactos) + 1}")

    def registrar_interaccion_red(
        self, contacto_id: str, tipo: str, resumen: str, ocurrida_en: datetime, referencia: str
    ) -> bool:
        if any(r == referencia for _, _, r in self.interacciones):
            return False
        self.interacciones.append((contacto_id, tipo, referencia))
        return True

    def vincular_contacto_red(self, contacto_id: str, postulacion_id: str) -> None:
        self.ligados.append((contacto_id, postulacion_id))


class ColaFalsa:
    def __init__(self, avisos: list[AvisoDeLinkedin]) -> None:
        self.pendientes = [AvisoRedPorEnviar("<m1>", i, AHORA, a) for i, a in enumerate(avisos)]
        self.marcados: list[tuple[str, int, str, str | None]] = []

    def guardar_avisos_red(
        self, message_id: str, recibido_en: datetime, avisos: list[AvisoDeLinkedin]
    ) -> int:
        return 0

    def avisos_red_por_enviar(self, limite: int) -> list[AvisoRedPorEnviar]:
        hechos = {(m, i) for m, i, _, _ in self.marcados}
        return [p for p in self.pendientes if (p.message_id, p.indice) not in hechos][:limite]

    def marcar_aviso_red_enviado(
        self, message_id: str, indice: int, contacto_id: str, postulacion_id: str | None
    ) -> None:
        self.marcados.append((message_id, indice, contacto_id, postulacion_id))


def test_registra_en_la_red_y_liga_por_empresa() -> None:
    nucleo, cola = NucleoFalso(), ColaFalsa([ANA, LUIS])
    r = RegistrarRed(nucleo, cola).ejecutar()
    assert (r.registrados, r.nuevos, r.ligados) == (2, 2, 1)
    assert nucleo.ligados == [("c1", "p1")]
    assert cola.marcados == [("<m1>", 0, "c1", "p1"), ("<m1>", 1, "c2", None)]
    assert RegistrarRed(nucleo, cola).ejecutar().registrados == 0


def test_nucleo_caido_no_marca_nada() -> None:
    cola = ColaFalsa([ANA])
    r = RegistrarRed(NucleoFalso(cae=True), cola).ejecutar()
    assert r.error is not None and cola.marcados == []


@pytest.fixture
def repo() -> RepositorioPostgresDeCorreos:
    url = os.environ.get("IA_DATABASE_URL_PRUEBAS") or cargar_config().ia_database_url.replace(
        "/brecha", "/brecha_pruebas"
    )
    motor = crear_motor(url)
    with motor.begin() as c:
        c.execute(text("TRUNCATE ia.correo, ia.aviso_red, ia.estado_vigia, ia.clasificacion CASCADE"))
    return RepositorioPostgresDeCorreos(motor)


def test_el_vigia_guarda_los_avisos_de_linkedin_aparte(repo: RepositorioPostgresDeCorreos) -> None:
    texto = "You have 1 new message\n\nAna Ficticia (Recruiter at Norte Datos)\n(https://www.linkedin.com/comm/in/ana?x=1)\n"
    c = CorreoLeido(
        7,
        "<m9@linkedin.com>",
        "messaging-digest-noreply@linkedin.com",
        "",
        "Ana just messaged you",
        AHORA,
        texto,
        True,
    )
    assert ingresar(repo, c) == ("red", "linkedin")
    assert ingresar(repo, c) == ("repetido", None)
    pendientes = repo.avisos_red_por_enviar(10)
    assert [(p.message_id, p.aviso.nombre, p.aviso.empresa) for p in pendientes] == [
        ("<m9@linkedin.com>", "Ana Ficticia", "Norte Datos")
    ]
    assert repo.guardar_avisos_red("<m9@linkedin.com>", AHORA, [ANA]) == 0  # ya estaba
    repo.marcar_aviso_red_enviado("<m9@linkedin.com>", 0, "c1", "p1")
    assert repo.avisos_red_por_enviar(10) == []
