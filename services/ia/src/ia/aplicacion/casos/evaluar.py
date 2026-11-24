"""F2-14: evaluación con sets de casos y los umbrales de D30.

Correos: estado sugerido correcto ≥ 80 %, asociación correcta ≥ 75 % y como máximo 1 falso «rechazado».
Pasos (docs/diseno/pasos.md §9): ≥ 80 % de los pasos esperados detectados y como máximo 1 paso inventado.
Preguntas: ≥ 70 % de los avisos esperados recuperados y citados, y 100 % de citas válidas.

La asociación sigue el camino nuevo del vigía: candidatas por código, el modelo elige con el contexto
y el código verifica (D50). Un caso puede esperar varias postulaciones.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

from ia.aplicacion.casos.clasificar_pendientes import resolver
from ia.aplicacion.puertos import AvisoGuardado, CorreoPorClasificar, ErrorDeModelo, ModeloDeLenguaje
from ia.dominio.asociacion import PostulacionConocida, normalizar_empresa
from ia.dominio.correo import CorreoLeido
from ia.dominio.enlaces import marcar_enlaces
from ia.dominio.filtro import filtrar
from ia.dominio.fragmento import fragmento
from ia.dominio.pasos import ContextoDePostulacion, candidatas, para_modelo
from ia.dominio.reglas import dominio_compartido

UMBRAL_ESTADO = 0.80
UMBRAL_ASOCIACION = 0.75
MAXIMO_FALSOS_RECHAZOS = 1
UMBRAL_PASOS = 0.80
MAXIMO_PASOS_INVENTADOS = 1
UMBRAL_RECALL = 0.70


@dataclass(frozen=True)
class CasoDeCorreo:
    id: str
    remitente: str
    asunto: str
    texto: str
    estado_esperado: str | None  # None: no es de una postulación o no cambia el estado
    postulacion_esperada: str | None  # id de una de las postulaciones del set, o None (bandeja)
    # Pasos pendientes: varias postulaciones esperadas (manda sobre la de arriba) y si pide un paso.
    postulaciones_esperadas: tuple[str, ...] | None = None
    paso_esperado: bool | None = None  # None: el caso no mide pasos

    @property
    def esperadas(self) -> tuple[str, ...]:
        if self.postulaciones_esperadas is not None:
            return tuple(sorted(self.postulaciones_esperadas))
        return (self.postulacion_esperada,) if self.postulacion_esperada else ()


@dataclass
class ResultadoDeCorreos:
    casos: int = 0
    estados_bien: int = 0
    asociaciones_bien: int = 0
    falsos_rechazos: int = 0
    pasos_esperados: int = 0
    pasos_detectados: int = 0
    pasos_inventados: int = 0
    fallos: list[str] = field(default_factory=list)

    @property
    def tasa_pasos(self) -> float:
        return self.pasos_detectados / self.pasos_esperados if self.pasos_esperados else 1.0

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
            and self.tasa_pasos >= UMBRAL_PASOS
            and self.pasos_inventados <= MAXIMO_PASOS_INVENTADOS
        )


class EvaluarCorreos:
    """El camino del vigía (filtro, fragmento, modelo y asociación), sin tocar la base ni el núcleo."""

    def __init__(
        self,
        modelo: ModeloDeLenguaje,
        postulaciones: list[PostulacionConocida],
        dominios: dict[str, tuple[str, ...]] | None = None,
    ) -> None:
        self.modelo = modelo
        self.postulaciones = postulaciones
        # Como el vigía: los dominios que ya escribieron por cada postulación y las empresas conocidas.
        self.dominios = {d.lower(): ids for d, ids in (dominios or {}).items() if not dominio_compartido(d)}
        self.empresas = frozenset(e for p in postulaciones if (e := normalizar_empresa(p.empresa)))

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
            f = filtrar(correo, frozenset(self.dominios), self.empresas)
            estado: str | None = None
            ids: tuple[str, ...] = ()
            pide = False
            if f.pasa:
                texto, enlaces = marcar_enlaces(fragmento(c.texto), correo.dominio)
                lista = candidatas(
                    empresa=None,
                    cargo=None,
                    plataforma=f.plataforma,
                    dominio_remitente=correo.dominio,
                    textos=(c.asunto, texto, *enlaces),
                    conocidas=self.postulaciones,
                    del_dominio=self.dominios.get(correo.dominio, ()),
                )
                lista_modelo = para_modelo(
                    [
                        ContextoDePostulacion(
                            x.id,
                            x.postulacion.empresa,
                            x.postulacion.titulo,
                            "en_proceso" if x.postulacion.activa else "rechazado",
                        )
                        for x in lista
                    ],
                    {x.id: x.motivo for x in lista},
                )
                try:
                    k, _ = self.modelo.clasificar_correo(
                        c.remitente,
                        c.asunto,
                        texto,
                        f.plataforma,
                        candidatas=lista_modelo,
                        hoy=datetime.now(UTC).date().isoformat(),
                    )
                except ErrorDeModelo as e:
                    if e.detiene:
                        raise
                    r.fallos.append(f"{c.id}: el modelo falló ({e.tipo})")
                    continue
                if k.es_postulacion:
                    estado = k.estado_sugerido
                    por_clasificar = CorreoPorClasificar(
                        correo.message_id,
                        c.remitente,
                        c.asunto,
                        texto,
                        f.plataforma,
                        0,
                        enlaces=tuple(enlaces),
                    )
                    d = resolver(por_clasificar, k, lista_modelo, self.postulaciones, lista)
                    ids = tuple(sorted(d.postulacion_ids))
                    pide = d.paso is not None
            if estado == c.estado_esperado:
                r.estados_bien += 1
            else:
                r.fallos.append(
                    f"{c.id}: estado {estado or 'ninguno'}, se esperaba {c.estado_esperado or 'ninguno'}"
                )
            if estado == "rechazado" and c.estado_esperado != "rechazado":
                r.falsos_rechazos += 1
            if ids == c.esperadas:
                r.asociaciones_bien += 1
            else:
                r.fallos.append(
                    f"{c.id}: asociado a {' + '.join(ids) or 'bandeja'}, se esperaba "
                    f"{' + '.join(c.esperadas) or 'bandeja'}"
                )
            if c.paso_esperado is True:
                r.pasos_esperados += 1
                if pide:
                    r.pasos_detectados += 1
                else:
                    r.fallos.append(f"{c.id}: no detectó el paso que pide")
            elif c.paso_esperado is False and pide:
                r.pasos_inventados += 1
                r.fallos.append(f"{c.id}: inventó un paso")
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
