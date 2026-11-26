from datetime import UTC, datetime

from ia.aplicacion.casos.clasificar_pendientes import ClasificarPendientes
from ia.aplicacion.puertos import CorreoPorClasificar, ErrorDeModelo, Traza, Uso
from ia.dominio.clasificacion import Clasificacion

AHORA = datetime(2026, 11, 24, tzinfo=UTC)


def clasif(estado: str | None = "rechazado", es: bool = True) -> Clasificacion:
    return Clasificacion(es, "trabajando", "Ficticia", "Backend", estado, "No continúan", 0.95)


class ModeloFalso:
    def __init__(self, respuestas: list[Clasificacion | ErrorDeModelo]) -> None:
        self.respuestas = respuestas
        self.llamadas = 0

    def clasificar_correo(
        self, remitente: str, asunto: str, fragmento: str, plataforma: str | None
    ) -> tuple[Clasificacion, Uso]:
        r = self.respuestas[self.llamadas]
        self.llamadas += 1
        if isinstance(r, ErrorDeModelo):
            raise r
        return r, Uso("gpt-prueba", 1000, 100, 50)


class ColaFalsa:
    def __init__(self, n: int) -> None:
        self.cola = [
            CorreoPorClasificar(f"<{i}@x>", "a@b.test", "Asunto", "texto", "trabajando", 0) for i in range(n)
        ]
        self.clasificados: list[str] = []
        self.fallidos: list[str] = []
        self.error: str | None = "viejo"

    def pendientes(self, limite: int) -> list[CorreoPorClasificar]:
        return self.cola[:limite]

    def marcar_clasificado(self, message_id: str, clasificacion: Clasificacion, modelo: str) -> None:
        self.clasificados.append(message_id)

    def marcar_intento_fallido(self, message_id: str, maximo: int) -> None:
        self.fallidos.append(message_id)

    def registrar_error_ia(self, error: str | None) -> None:
        self.error = error


class TrazasFalsas:
    def __init__(self) -> None:
        self.trazas: list[Traza] = []

    def registrar(self, traza: Traza) -> None:
        self.trazas.append(traza)


def caso(modelo: ModeloFalso, cola: ColaFalsa, trazas: TrazasFalsas) -> ClasificarPendientes:
    return ClasificarPendientes(modelo, cola, trazas, lambda: AHORA, (0.10, 0.50))


def test_clasifica_cuenta_costo_y_limpia_el_error() -> None:
    cola, trazas = ColaFalsa(3), TrazasFalsas()
    r = caso(ModeloFalso([clasif(), clasif("entrevista"), clasif(None, es=False)]), cola, trazas).ejecutar()
    assert (r.clasificados, r.de_postulacion, r.por_estado) == (3, 2, {"rechazado": 1, "entrevista": 1})
    assert r.costo_usd == round(3 * (1000 * 0.10 + 100 * 0.50) / 1e6, 6)
    assert [t.resultado for t in trazas.trazas] == ["ok", "ok", "ok"]
    assert cola.error is None


def test_cuota_agotada_para_y_deja_el_resto_en_cola_con_el_error_visible() -> None:
    cola, trazas = ColaFalsa(3), TrazasFalsas()
    r = caso(ModeloFalso([clasif(), ErrorDeModelo("cuota", "sin saldo")]), cola, trazas).ejecutar()
    assert r.clasificados == 1 and r.error == "cuota: sin saldo"
    assert cola.error == "cuota: sin saldo" and cola.fallidos == []
    assert trazas.trazas[-1].resultado == "cuota"


def test_respuesta_invalida_suma_un_intento_y_sigue() -> None:
    cola, trazas = ColaFalsa(2), TrazasFalsas()
    r = caso(ModeloFalso([ErrorDeModelo("respuesta_invalida", "x"), clasif()]), cola, trazas).ejecutar()
    assert (r.fallidos, r.clasificados, r.error) == (1, 1, None)
    assert cola.fallidos == ["<0@x>"]


# ── Con contexto del núcleo (pasos.md §5.2) ──────────────────────────────────────

from ia.dominio.asociacion import PostulacionConocida  # noqa: E402
from ia.dominio.clasificacion import PasoCumplido, PasoDetectado  # noqa: E402
from ia.dominio.pasos import CandidataParaModelo, ContextoDePostulacion, PasoConocido  # noqa: E402

LANEK = PostulacionConocida(
    "lanek-uuid",
    "Lanek",
    "Ingeniero/a de Software Backend & IA",
    "chiletrabajos",
    False,
    "https://www.chiletrabajos.cl/trabajo/ingeniero-de-software-backend-ia-3916453",
)


class NucleoConContexto:
    def __init__(self, caido: bool = False) -> None:
        self.pedidos: list[list[str]] = []
        self.caido = caido

    def postulaciones(self) -> list[PostulacionConocida]:
        if self.caido:
            from ia.aplicacion.puertos import NucleoNoDisponible

            raise NucleoNoDisponible("ConnectError")
        return [LANEK]

    def contexto(self, ids: list[str]) -> list[ContextoDePostulacion]:
        self.pedidos.append(ids)
        return [
            ContextoDePostulacion(
                "lanek-uuid",
                "Lanek",
                "Backend & IA",
                "rechazado",
                (PasoConocido("paso-uuid", "Completar el test de personalidad", "pendiente"),),
            )
        ]


class ModeloQueMira(ModeloFalso):
    def __init__(self, respuesta: Clasificacion) -> None:
        super().__init__([respuesta])
        self.vistas: list[list[CandidataParaModelo] | None] = []

    def clasificar_correo(  # type: ignore[override]
        self,
        remitente: str,
        asunto: str,
        fragmento: str,
        plataforma: str | None,
        candidatas: list[CandidataParaModelo] | None = None,
        hoy: str | None = None,
    ) -> tuple[Clasificacion, Uso]:
        self.vistas.append(candidatas)
        return super().clasificar_correo(remitente, asunto, fragmento, plataforma)


class ColaConHilo(ColaFalsa):
    def __init__(self) -> None:
        super().__init__(0)
        self.cola = [
            CorreoPorClasificar(
                "<test@ct>",
                "info@chiletrabajos.cl",
                "Juan. Continua tu Postulacion #3916453 [23/11/2026]",
                "Completa el test de personalidad en [enlace 1]",
                "chiletrabajos",
                0,
                enlaces=("https://www.chiletrabajos.cl/test?token=x",),
            )
        ]
        self.decisiones: dict[str, object] = {}

    def marcar_clasificado(  # type: ignore[override]
        self, message_id: str, clasificacion: Clasificacion, modelo: str, decision: object = None
    ) -> None:
        self.clasificados.append(message_id)
        self.decisiones[message_id] = decision

    def del_hilo(self, message_ids: tuple[str, ...]) -> tuple[str, ...]:
        return ()


def test_con_contexto_asocia_lanek_por_el_numero_y_resuelve_paso_enlace_y_cumplidos() -> None:
    respuesta = Clasificacion(
        True,
        "chiletrabajos",
        None,
        None,
        "en_proceso",
        "Te piden completar un test",
        0.95,
        (),  # el modelo no eligió: igual manda la regla segura
        PasoDetectado("Completar el test de personalidad", plazo="2026-11-30", enlace=1, mismo_que="s1"),
        (PasoCumplido("s1", 0.4), PasoCumplido("s99", 0.99)),
    )
    modelo, cola, nucleo = ModeloQueMira(respuesta), ColaConHilo(), NucleoConContexto()
    r = ClasificarPendientes(
        modelo, cola, TrazasFalsas(), lambda: AHORA, (0.1, 0.5), nucleo=nucleo
    ).ejecutar()
    assert r.con_paso == 1 and nucleo.pedidos == [["lanek-uuid"]]
    vistas = modelo.vistas[0]
    assert vistas is not None and vistas[0].corto == "p1"
    d = cola.decisiones["<test@ct>"]
    assert d.postulacion_ids == ("lanek-uuid",) and d.motivo == "regla segura"  # type: ignore[attr-defined]
    assert d.paso.enlace == "https://www.chiletrabajos.cl/test?token=x"  # type: ignore[attr-defined]
    assert d.paso.mismo_que == "paso-uuid"  # type: ignore[attr-defined]
    # s99 no existe: se descarta; s1 va con su confianza (el núcleo decide con el umbral).
    assert d.pasos_cumplidos == (("paso-uuid", 0.4),)  # type: ignore[attr-defined]


def test_sin_nucleo_los_correos_esperan() -> None:
    cola = ColaConHilo()
    r = ClasificarPendientes(
        ModeloQueMira(clasif()),
        cola,
        TrazasFalsas(),
        lambda: AHORA,
        (0.1, 0.5),
        nucleo=NucleoConContexto(True),
    ).ejecutar()
    assert r.error and "núcleo" in r.error and cola.clasificados == []
