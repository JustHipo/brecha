"""F2-14: evaluación con sets de casos y los umbrales de D30.

Correos: estado sugerido correcto ≥ 80 %, asociación correcta ≥ 75 % y como máximo 1 falso «rechazado».
Preguntas: ≥ 70 % de los avisos esperados recuperados y citados, y 100 % de citas válidas.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

from ia.aplicacion.puertos import AvisoGuardado, ErrorDeModelo, ModeloDeLenguaje
from ia.dominio.asociacion import PostulacionConocida, asociar
from ia.dominio.correo import CorreoLeido
from ia.dominio.filtro import filtrar
from ia.dominio.fragmento import fragmento

UMBRAL_ESTADO = 0.80
UMBRAL_ASOCIACION = 0.75
MAXIMO_FALSOS_RECHAZOS = 1
UMBRAL_RECALL = 0.70


@dataclass(frozen=True)
class CasoDeCorreo:
    id: str
    remitente: str
    asunto: str
    texto: str
    estado_esperado: str | None  # None: no es de una postulación o no cambia el estado
    postulacion_esperada: str | None  # id de una de las postulaciones del set, o None (bandeja)


@dataclass
class ResultadoDeCorreos:
    casos: int = 0
    estados_bien: int = 0
    asociaciones_bien: int = 0
    falsos_rechazos: int = 0
    fallos: list[str] = field(default_factory=list)

    @property
    def tasa_estado(self) -> float:
        return self.estados_bien / self.casos if self.casos else 0.0

    @property
    def tasa_asociacion(self) -> float:
        return self.asociaciones_bien / self.casos if self.casos else 0.0

    @property
    def pasa(self) -> bool:
        return (
            self.casos > 0
            and self.tasa_estado >= UMBRAL_ESTADO
            and self.tasa_asociacion >= UMBRAL_ASOCIACION
            and self.falsos_rechazos <= MAXIMO_FALSOS_RECHAZOS
        )


class EvaluarCorreos:
    """El camino del vigía (filtro, fragmento, modelo y asociación), sin tocar la base ni el núcleo."""

    def __init__(self, modelo: ModeloDeLenguaje, postulaciones: list[PostulacionConocida]) -> None:
        self.modelo = modelo
        self.postulaciones = postulaciones

    def ejecutar(self, casos: list[CasoDeCorreo]) -> ResultadoDeCorreos:
        r = ResultadoDeCorreos()
        for i, c in enumerate(casos):
            r.casos += 1
            correo = CorreoLeido(
                uid=i,
                message_id=f"<eval-{c.id}>",
                remitente=c.remitente,
                nombre_remitente="",
                asunto=c.asunto,
                recibido_en=datetime.now(UTC),
                texto=c.texto,
                masivo=False,
            )
            f = filtrar(correo)
            estado: str | None = None
            postulacion: str | None = None
            if f.pasa:
                try:
                    k, _ = self.modelo.clasificar_correo(
                        c.remitente, c.asunto, fragmento(c.texto), f.plataforma
                    )
                except ErrorDeModelo as e:
                    if e.detiene:
                        raise
                    r.fallos.append(f"{c.id}: el modelo falló ({e.tipo})")
                    continue
                if k.es_postulacion:
                    estado = k.estado_sugerido
                    a = asociar(
                        k.empresa, k.cargo, k.plataforma, self.postulaciones, c.remitente.rsplit("@", 1)[-1]
                    )
                    postulacion = a.postulacion_id
            if estado == c.estado_esperado:
                r.estados_bien += 1
            else:
                r.fallos.append(
                    f"{c.id}: estado {estado or 'ninguno'}, se esperaba {c.estado_esperado or 'ninguno'}"
                )
            if estado == "rechazado" and c.estado_esperado != "rechazado":
                r.falsos_rechazos += 1
            if postulacion == c.postulacion_esperada:
                r.asociaciones_bien += 1
            else:
                esperada = c.postulacion_esperada or "bandeja"
                r.fallos.append(f"{c.id}: asociado a {postulacion or 'bandeja'}, se esperaba {esperada}")
        return r


@dataclass(frozen=True)
class CasoDePregunta:
    id: str
    pregunta: str
    esperados: tuple[str, ...]  # URLs de los avisos que deberían aparecer citados


@dataclass
class ResultadoDePreguntas:
    casos: int = 0
    esperados: int = 0
    encontrados: int = 0
    citas: int = 0
    citas_validas: int = 0
    fallos: list[str] = field(default_factory=list)

    @property
    def recall(self) -> float:
        return self.encontrados / self.esperados if self.esperados else 0.0

    @property
    def tasa_citas_validas(self) -> float:
        return self.citas_validas / self.citas if self.citas else 1.0

    @property
    def pasa(self) -> bool:
        return self.casos > 0 and self.recall >= UMBRAL_RECALL and self.tasa_citas_validas == 1.0


@dataclass(frozen=True)
class RespuestaEvaluada:
    citados: list[AvisoGuardado]
    descartados: int


class EvaluarPreguntas:
    def __init__(self, preguntar: Callable[[str], RespuestaEvaluada]) -> None:
        self.preguntar = preguntar

    def ejecutar(self, casos: list[CasoDePregunta]) -> ResultadoDePreguntas:
        r = ResultadoDePreguntas()
        for c in casos:
            r.casos += 1
            resp = self.preguntar(c.pregunta)
            urls = {g.aviso.url for g in resp.citados}
            r.esperados += len(c.esperados)
            hallados = [u for u in c.esperados if u in urls]
            r.encontrados += len(hallados)
            r.citas += len(resp.citados) + resp.descartados
            r.citas_validas += len(resp.citados)
            faltan = [u for u in c.esperados if u not in urls]
            if faltan:
                r.fallos.append(f"{c.id}: no citó {', '.join(faltan)}")
            if resp.descartados:
                r.fallos.append(f"{c.id}: {resp.descartados} citas inventadas descartadas")
        return r
