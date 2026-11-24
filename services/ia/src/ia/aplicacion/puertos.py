"""Puertos del servicio con IA (ADR 0016). Las implementaciones viven en `infraestructura`."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Protocol, runtime_checkable

from ia.dominio.asociacion import PostulacionConocida
from ia.dominio.aviso import Aviso
from ia.dominio.calce import Calce, Perfil, Requisito
from ia.dominio.clasificacion import Clasificacion
from ia.dominio.correo import CorreoLeido, EstadoDeCorreo
from ia.dominio.linkedin import AvisoDeLinkedin


class TipoDeCredencial(StrEnum):
    CORREO_USUARIO = "correo-usuario"
    CORREO_CLAVE = "correo-clave-de-aplicacion"
    OPENAI = "openai-llave"


@dataclass(frozen=True)
class EstadoDeCredenciales:
    correo: bool
    openai: bool

    def faltantes(self) -> list[str]:
        falta = []
        if not self.correo:
            falta.append("correo (en Ajustes de la consola)")
        if not self.openai:
            falta.append("OpenAI (en Ajustes de la consola)")
        return falta


class Credenciales(Protocol):
    """Secretos del usuario. Nunca se imprimen ni se guardan en la base (IAAPP-002)."""

    def obtener(self, tipo: TipoDeCredencial) -> str | None: ...
    def guardar(self, tipo: TipoDeCredencial, valor: str) -> None: ...
    def borrar(self, tipo: TipoDeCredencial) -> None: ...


def estado_de(credenciales: Credenciales) -> EstadoDeCredenciales:
    return EstadoDeCredenciales(
        correo=bool(credenciales.obtener(TipoDeCredencial.CORREO_USUARIO))
        and bool(credenciales.obtener(TipoDeCredencial.CORREO_CLAVE)),
        openai=bool(credenciales.obtener(TipoDeCredencial.OPENAI)),
    )


# ── Correo (F2-05) ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class PuntoDeLectura:
    """Dónde quedó el vigía: los UID solo valen mientras no cambie el `uidvalidity` de la carpeta."""

    uidvalidity: int | None
    ultimo_uid: int | None


class LectorDeCorreo(Protocol):
    """Fuente de correo de solo lectura (D25). Nunca marca nada como leído."""

    def uidvalidity(self) -> int: ...
    def nuevos(self, desde_uid: int | None, desde_fecha: date) -> Iterable[CorreoLeido]: ...


@dataclass(frozen=True)
class CorreoGuardado:
    message_id: str
    uid: int
    remitente: str
    recibido_en: datetime
    estado: EstadoDeCorreo
    plataforma: str | None
    motivo: str
    asunto: str | None = None  # solo si pasó el filtro
    fragmento: str | None = None  # solo si pasó el filtro


class RepositorioDeCorreos(Protocol):
    def punto_de_lectura(self) -> PuntoDeLectura: ...
    def existe(self, message_id: str) -> bool: ...
    def guardar(self, correo: CorreoGuardado) -> None: ...
    def registrar_revision(self, punto: PuntoDeLectura, cuando: datetime, error: str | None) -> None: ...
    def en_cola(self) -> int: ...


# ── Modelo de lenguaje y trazas (F2-06, ADR 0016) ──────────────────────────────


class ErrorDeModelo(Exception):
    """Error tipado del proveedor (IAAPP-006). `tipo` decide si se sigue con el próximo correo o se para."""

    def __init__(self, tipo: str, mensaje: str) -> None:
        super().__init__(mensaje)
        self.tipo = tipo  # cuota | limite | credencial | no_disponible | respuesta_invalida

    @property
    def detiene(self) -> bool:
        return self.tipo in {"cuota", "limite", "credencial", "no_disponible"}


@dataclass(frozen=True)
class Uso:
    modelo: str
    tokens_entrada: int
    tokens_salida: int
    duracion_ms: int


class ModeloDeLenguaje(Protocol):
    def clasificar_correo(
        self, remitente: str, asunto: str, fragmento: str, plataforma_detectada: str | None
    ) -> tuple[Clasificacion, Uso]: ...


@dataclass(frozen=True)
class Traza:
    caso: str
    modelo: str
    tokens_entrada: int
    tokens_salida: int
    costo_usd: float
    duracion_ms: int
    resultado: str  # ok | cuota | limite | credencial | no_disponible | respuesta_invalida
    creada_en: datetime


class RegistroDeTrazas(Protocol):
    def registrar(self, traza: Traza) -> None: ...


@dataclass(frozen=True)
class CorreoPorClasificar:
    message_id: str
    remitente: str
    asunto: str
    fragmento: str
    plataforma: str | None
    intentos: int


class ColaDeClasificacion(Protocol):
    def pendientes(self, limite: int) -> list[CorreoPorClasificar]: ...
    def marcar_clasificado(self, message_id: str, clasificacion: Clasificacion, modelo: str) -> None: ...
    def marcar_intento_fallido(self, message_id: str, maximo: int) -> None: ...
    def registrar_error_ia(self, error: str | None) -> None: ...


# ── Núcleo y registro de señales (F2-07, backend.md C3) ────────────────────────


class NucleoNoDisponible(Exception):
    """El núcleo no respondió: las señales esperan a la próxima vuelta."""


@dataclass(frozen=True)
class SenalParaNucleo:
    referencia_externa: str  # Message-ID: el núcleo no la duplica
    postulacion_id: str | None  # None: va a la bandeja
    plataforma: str
    resumen: str
    estado_sugerido: str | None
    confianza: float
    recibida_en: datetime
    remitente: str
    asunto: str
    empresa: str | None
    cargo: str | None


@dataclass(frozen=True)
class RespuestaDelNucleo:
    destino: str  # postulacion | bandeja | repetida
    aplicada: bool
    estado: str | None


class Nucleo(Protocol):
    def postulaciones(self) -> list[PostulacionConocida]: ...
    def registrar_senal(self, senal: SenalParaNucleo) -> RespuestaDelNucleo: ...


@dataclass(frozen=True)
class ClasificadoPorEnviar:
    message_id: str
    clasificacion: Clasificacion
    remitente: str
    asunto: str
    recibido_en: datetime


class ColaDeEnvio(Protocol):
    def por_enviar(self, limite: int) -> list[ClasificadoPorEnviar]: ...
    def marcar_enviado(self, message_id: str, postulacion_id: str | None) -> None: ...


# ── Estado para Conexiones (F2-08) ─────────────────────────────────────────────


@dataclass(frozen=True)
class EstadoDelServicio:
    ultima_revision: datetime | None
    ultimo_error_correo: str | None
    ultimo_error_ia: str | None
    en_cola: int
    clasificados: int
    gasto_mes_usd: float
    llamadas_mes: int


class ConsultaDeEstado(Protocol):
    def estado(self, desde_mes: datetime) -> EstadoDelServicio: ...


# ── Avisos, análisis, embeddings y Preguntar (F2-09 a F2-12) ───────────────────


@dataclass(frozen=True)
class AvisoGuardado:
    id: str
    aviso: Aviso
    requisitos: tuple[Requisito, ...] | None  # None: sin analizar
    calce: Calce | None
    postulacion_id: str | None
    distancia: float | None = None  # solo en una búsqueda por vector
    vinculo_enviado: str | None = None  # «postulación:calce» que ya conoce el núcleo


@dataclass(frozen=True)
class FiltrosDeAvisos:
    texto: str | None = None
    modalidad: str | None = None
    plataforma: str | None = None
    calce_minimo: int | None = None
    usd_minimo: int | None = None
    limite: int = 200
    por_calce: bool = False  # Preguntar: «¿cuál me calza mejor?» ordena por calce y no por parecido


class RepositorioDeAvisos(Protocol):
    def guardar(self, aviso: Aviso) -> tuple[str, bool]: ...  # (id, es nuevo)
    def por_id(self, id: str) -> AvisoGuardado | None: ...
    def listar(self, filtros: FiltrosDeAvisos) -> list[AvisoGuardado]: ...
    def sin_analizar(self, limite: int) -> list[AvisoGuardado]: ...
    def guardar_analisis(
        self, id: str, requisitos: list[Requisito], calce: Calce | None, modelo: str
    ) -> None: ...
    def recalcular(self, id: str, calce: Calce | None) -> None: ...
    def analizados(self) -> list[AvisoGuardado]: ...
    def vincular(self, id: str, postulacion_id: str) -> None: ...
    def marcar_vinculo_enviado(self, id: str, clave: str) -> None: ...
    def sin_vector(self, limite: int) -> list[AvisoGuardado]: ...
    def guardar_vector(self, id: str, vector: list[float], modelo: str) -> None: ...
    def cercanos(self, vector: list[float], k: int, filtros: FiltrosDeAvisos) -> list[AvisoGuardado]: ...
    def contar(self) -> dict[str, int]: ...


class FuenteDeAvisos(Protocol):
    """Una fuente externa de avisos (Get on Board por su API pública)."""

    def buscar(self, consulta: str, maximo: int) -> list[Aviso]: ...


class AnalizadorDeAvisos(Protocol):
    def analizar_aviso(self, aviso: Aviso) -> tuple[list[Requisito], Uso]: ...


class Embeddings(Protocol):
    modelo_embeddings: str

    def embeber(self, textos: list[str]) -> tuple[list[list[float]], Uso]: ...


@dataclass(frozen=True)
class AvisoParaResponder:
    id: str
    titulo: str
    empresa: str
    modalidad: str
    sueldo: str | None
    stack: tuple[str, ...]
    texto: str
    calce: int | None = None  # calculado por el código (IAAPP-008): el modelo solo lo lee
    brechas: tuple[str, ...] = ()


class Respondedor(Protocol):
    def responder(self, pregunta: str, avisos: list[AvisoParaResponder]) -> tuple[str, list[str], Uso]: ...


class RepositorioDePerfil(Protocol):
    def perfil(self) -> Perfil | None: ...
    def guardar(self, perfil: Perfil) -> None: ...


@dataclass(frozen=True)
class AvisoDePostulacion:
    """La foto del aviso que guarda el núcleo en la postulación (`GET /postulaciones/:id`)."""

    url: str
    titulo: str
    empresa: str
    plataforma: str
    modalidad: str
    ubicacion: str | None
    cierre: str | None
    stack: tuple[str, ...]
    requisitos: str | None
    sueldo_publicado: str | None


class EnlaceConNucleo(Protocol):
    def postulaciones(self) -> list[PostulacionConocida]: ...
    def aviso_de(self, postulacion_id: str) -> AvisoDePostulacion | None: ...
    def vincular_aviso(self, postulacion_id: str, aviso_id: str, calce: float | None) -> None: ...


# ── Tu red de LinkedIn desde los avisos por correo (D40) ───────────────────────


@dataclass(frozen=True)
class AvisoRedPorEnviar:
    message_id: str
    indice: int
    recibido_en: datetime
    aviso: AvisoDeLinkedin


@runtime_checkable
class ColaDeRed(Protocol):
    def guardar_avisos_red(
        self, message_id: str, recibido_en: datetime, avisos: list[AvisoDeLinkedin]
    ) -> int: ...
    def avisos_red_por_enviar(self, limite: int) -> list[AvisoRedPorEnviar]: ...
    def marcar_aviso_red_enviado(
        self, message_id: str, indice: int, contacto_id: str, postulacion_id: str | None
    ) -> None: ...


class RedEnNucleo(Protocol):
    def postulaciones(self) -> list[PostulacionConocida]: ...
    def registrar_contacto_red(
        self, nombre: str, perfil_url: str, titular: str | None, empresa: str | None
    ) -> str: ...
    def registrar_interaccion_red(
        self, contacto_id: str, tipo: str, resumen: str, ocurrida_en: datetime, referencia: str
    ) -> bool: ...
    def vincular_contacto_red(self, contacto_id: str, postulacion_id: str) -> None: ...
