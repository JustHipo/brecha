"""F2-06: clasifica con el modelo los correos que pasaron el filtro. Un 429 o una cuota agotada se ven."""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime

from ia.aplicacion.puertos import (
    ColaDeClasificacion,
    ErrorDeModelo,
    ModeloDeLenguaje,
    RegistroDeTrazas,
    Traza,
)
from ia.dominio.clasificacion import costo_usd

MAXIMO_INTENTOS = 5


@dataclass
class ResumenDeClasificacion:
    clasificados: int = 0
    de_postulacion: int = 0
    por_estado: dict[str, int] = field(default_factory=dict)
    fallidos: int = 0
    costo_usd: float = 0.0
    error: str | None = None


class ClasificarPendientes:
    def __init__(
        self,
        modelo: ModeloDeLenguaje,
        cola: ColaDeClasificacion,
        trazas: RegistroDeTrazas,
        ahora: Callable[[], datetime],
        precios: tuple[float, float],
        limite: int = 50,
    ) -> None:
        self.modelo = modelo
        self.cola = cola
        self.trazas = trazas
        self.ahora = ahora
        self.precios = precios
        self.limite = limite

    def ejecutar(self) -> ResumenDeClasificacion:
        r = ResumenDeClasificacion()
        for c in self.cola.pendientes(self.limite):
            try:
                clasif, uso = self.modelo.clasificar_correo(c.remitente, c.asunto, c.fragmento, c.plataforma)
            except ErrorDeModelo as e:
                self.trazas.registrar(Traza("clasificar_correo", "", 0, 0, 0.0, 0, e.tipo, self.ahora()))
                if e.detiene:
                    r.error = f"{e.tipo}: {e}"
                    break
                r.fallidos += 1
                self.cola.marcar_intento_fallido(c.message_id, MAXIMO_INTENTOS)
                continue
            costo = costo_usd(uso.tokens_entrada, uso.tokens_salida, *self.precios)
            self.trazas.registrar(
                Traza(
                    "clasificar_correo",
                    uso.modelo,
                    uso.tokens_entrada,
                    uso.tokens_salida,
                    costo,
                    uso.duracion_ms,
                    "ok",
                    self.ahora(),
                )
            )
            self.cola.marcar_clasificado(c.message_id, clasif, uso.modelo)
            r.clasificados += 1
            r.costo_usd = round(r.costo_usd + costo, 6)
            if clasif.es_postulacion:
                r.de_postulacion += 1
                clave = clasif.estado_sugerido or "sin cambio"
                r.por_estado[clave] = r.por_estado.get(clave, 0) + 1
        self.cola.registrar_error_ia(r.error)
        return r
