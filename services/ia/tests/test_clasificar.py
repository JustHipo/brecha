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
