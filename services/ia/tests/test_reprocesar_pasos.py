from datetime import UTC, datetime

from ia.aplicacion.casos.reprocesar_pasos import ReprocesarPasos
from ia.aplicacion.puertos import CorreoPorClasificar, PasoParaNucleo, Traza, Uso
from ia.dominio.asociacion import PostulacionConocida
from ia.dominio.clasificacion import Clasificacion, PasoDetectado
from ia.dominio.pasos import CandidataParaModelo, ContextoDePostulacion

AHORA = datetime(2026, 11, 24, tzinfo=UTC)
LANEK = PostulacionConocida(
    "lanek",
    "Lanek",
    "Backend & IA",
    "chiletrabajos",
    False,
    "https://www.chiletrabajos.cl/trabajo/ingeniero-de-software-backend-ia-3916453",
)


class Nucleo:
    def __init__(self) -> None:
        self.pasos: list[tuple[list[str], str, str | None]] = []

    def postulaciones(self) -> list[PostulacionConocida]:
        return [LANEK]

    def contexto(self, ids: list[str]) -> list[ContextoDePostulacion]:
        return [ContextoDePostulacion("lanek", "Lanek", "Backend & IA", "rechazado")]

    def registrar_paso(
        self,
        postulacion_ids: list[str],
        paso: PasoParaNucleo,
        fuente: str,
        referencia: str | None,
        pedido_en: datetime | None,
        contacto_red_id: str | None = None,
    ) -> bool:
        nuevo = all(r != referencia for _, _, r in self.pasos)
        if nuevo:
            self.pasos.append((postulacion_ids, paso.descripcion, referencia))
        return nuevo


class Correos:
    def clasificados_desde(self, desde: datetime) -> list[CorreoPorClasificar]:
        return [
            CorreoPorClasificar(
                "<test@ct>",
                "info@chiletrabajos.cl",
                "Juan. Continua tu Postulacion #3916453 [23/11/2026]",
                "Completa el test de personalidad",
                "chiletrabajos",
                0,
                recibido_en=datetime(2026, 11, 23, 10, 3, tzinfo=UTC),
            )
        ]

    def del_hilo(self, message_ids: tuple[str, ...]) -> tuple[str, ...]:
        return ()


class Modelo:
    def clasificar_correo(
        self,
        remitente: str,
        asunto: str,
        fragmento: str,
        plataforma: str | None,
        candidatas: list[CandidataParaModelo] | None = None,
        hoy: str | None = None,
    ) -> tuple[Clasificacion, Uso]:
        k = Clasificacion(
            True,
            "chiletrabajos",
            None,
            None,
            "en_proceso",
            "Te piden un test",
            0.95,
            (),
            PasoDetectado("Completar el test de personalidad"),
        )
        return k, Uso("gpt-prueba", 900, 80, 10)


class Trazas:
    def __init__(self) -> None:
        self.t: list[Traza] = []

    def registrar(self, traza: Traza) -> None:
        self.t.append(traza)


def caso(nucleo: Nucleo, en_seco: bool = False) -> ReprocesarPasos:
    return ReprocesarPasos(Modelo(), nucleo, Correos(), Trazas(), lambda: AHORA, (0.1, 0.5), en_seco)


def test_el_correo_de_lanek_reprocesado_se_asocia_solo_y_crea_el_paso_una_vez() -> None:
    nucleo = Nucleo()
    seco = caso(nucleo, en_seco=True).ejecutar(30)
    assert seco.revisados == 1 and nucleo.pasos == [] and seco.detalle[0].startswith("crearía")
    r = caso(nucleo).ejecutar(30)
    assert r.pasos_nuevos == 1
    assert nucleo.pasos == [(["lanek"], "Completar el test de personalidad", "<test@ct>")]
    assert caso(nucleo).ejecutar(30).ya_estaban == 1
