"""Correo leído de la fuente, ya en texto plano. Solo vive en memoria hasta pasar el filtro."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class EstadoDeCorreo(StrEnum):
    FILTRADO = "filtrado"  # no es de plataformas: no sale de la máquina y no se guarda su texto
    PENDIENTE = "pendiente"  # pasó el filtro; espera clasificación (F2-06)
    CLASIFICADO = "clasificado"
    ERROR = "error"


@dataclass(frozen=True)
class CorreoLeido:
    uid: int
    message_id: str
    remitente: str  # dirección, en minúsculas
    nombre_remitente: str
    asunto: str
    recibido_en: datetime
    texto: str  # cuerpo en texto plano (el adaptador convierte el HTML)
    masivo: bool = False  # trae List-Unsubscribe o Precedence: bulk (boletines, publicidad, notificaciones)

    @property
    def dominio(self) -> str:
        return self.remitente.rsplit("@", 1)[-1] if "@" in self.remitente else ""
