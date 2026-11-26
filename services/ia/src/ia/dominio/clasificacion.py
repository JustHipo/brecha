"""Lo que el modelo dice de un correo.

El modelo clasifica y extrae; el código decide qué hacer (IAAPP-008).
"""

from dataclasses import dataclass

ESTADOS = (
    "sin_decidir",
    "por_postular",
    "postulado",
    "en_proceso",
    "entrevista",
    "oferta",
    "aceptada",
    "rechazado",
    "descartado",
)
PLATAFORMAS = (
    "linkedin",
    "trabajando",
    "getonboard",
    "computrabajo",
    "chiletrabajos",
    "indeed",
    "sitio_empresa",
    "otra",
)


class ClasificacionInvalida(ValueError):
    pass


@dataclass(frozen=True)
class PasoDetectado:
    """Lo que el correo pide hacer (docs/diseno/pasos.md §5.2). Texto libre."""

    descripcion: str
    detalle: str | None = None
    plazo: str | None = None  # AAAA-MM-DD
    enlace: int | None = None  # el número de «[enlace N]» del fragmento
    mismo_que: str | None = None  # id corto (s1…) de un paso pendiente que el correo solo recuerda


@dataclass(frozen=True)
class PasoCumplido:
    id: str  # id corto (s1…) del paso pendiente que el correo da por hecho
    confianza: float


@dataclass(frozen=True)
class Clasificacion:
    es_postulacion: bool
    plataforma: str
    empresa: str | None
    cargo: str | None
    estado_sugerido: str | None  # None: el correo no cambia el estado
    resumen: str
    confianza: float
    # Con contexto (pasos.md §5.2): ids cortos (p1…) que eligió el modelo; None si no tuvo candidatas.
    postulaciones: tuple[str, ...] | None = None
    paso: PasoDetectado | None = None
    pasos_cumplidos: tuple[PasoCumplido, ...] = ()

    def __post_init__(self) -> None:
        if self.plataforma not in PLATAFORMAS:
            raise ClasificacionInvalida(f"plataforma desconocida: {self.plataforma}")
        if self.estado_sugerido is not None and self.estado_sugerido not in ESTADOS:
            raise ClasificacionInvalida(f"estado desconocido: {self.estado_sugerido}")
        if not 0 <= self.confianza <= 1:
            raise ClasificacionInvalida("la confianza va de 0 a 1")
        if not self.resumen.strip():
            raise ClasificacionInvalida("falta el resumen")

    @staticmethod
    def desde_dict(d: dict[str, object]) -> "Clasificacion":
        """Lo que se guardó con `asdict` (la base guarda el resultado en JSON)."""
        x = dict(d)
        x.pop("decision", None)
        paso = x.pop("paso", None)
        cumplidos = x.pop("pasos_cumplidos", None)
        cumplidos = cumplidos if isinstance(cumplidos, list | tuple) else []
        postulaciones = x.pop("postulaciones", None)
        return Clasificacion(
            **x,  # type: ignore[arg-type]
            postulaciones=tuple(postulaciones) if isinstance(postulaciones, list | tuple) else None,
            paso=PasoDetectado(**paso) if isinstance(paso, dict) else None,
            pasos_cumplidos=tuple(PasoCumplido(**c) for c in cumplidos if isinstance(c, dict)),
        )

    @property
    def es_senal(self) -> bool:
        """Solo un correo sobre una postulación se convierte en señal."""
        return self.es_postulacion


def costo_usd(tokens_entrada: int, tokens_salida: int, precio_entrada: float, precio_salida: float) -> float:
    """Precios en USD por millón de tokens (página oficial de OpenAI)."""
    return round(tokens_entrada * precio_entrada / 1e6 + tokens_salida * precio_salida / 1e6, 6)
