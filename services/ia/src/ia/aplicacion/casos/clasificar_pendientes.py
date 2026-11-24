"""F2-06: clasifica con el modelo los correos que pasaron el filtro. Un 429 o una cuota agotada se ven.

Con el núcleo a mano (pasos.md §5), antes de llamar al modelo arma las candidatas (número del aviso, hilo,
empresa) y le pasa lo que sabe de cada una: su estado, sus pasos pendientes y los ya hechos. Después
verifica lo que eligió el modelo y guarda la decisión para el registro.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol, runtime_checkable

from ia.aplicacion.puertos import (
    ColaDeClasificacion,
    CorreoPorClasificar,
    DecisionGuardada,
    ErrorDeModelo,
    FuenteDeContexto,
    ModeloDeLenguaje,
    NucleoNoDisponible,
    PasoParaNucleo,
    RegistroDeTrazas,
    Traza,
    Uso,
)
from ia.dominio.asociacion import PostulacionConocida, asociar
from ia.dominio.clasificacion import Clasificacion, costo_usd
from ia.dominio.enlaces import enlace_numero
from ia.dominio.pasos import Candidata, CandidataParaModelo, candidatas, decidir, para_modelo

MAXIMO_INTENTOS = 5


@dataclass
class ResumenDeClasificacion:
    clasificados: int = 0
    de_postulacion: int = 0
    por_estado: dict[str, int] = field(default_factory=dict)
    con_paso: int = 0
    fallidos: int = 0
    costo_usd: float = 0.0
    error: str | None = None


def resolver(
    c: CorreoPorClasificar,
    k: Clasificacion,
    lista_modelo: list[CandidataParaModelo],
    conocidas: list[PostulacionConocida],
    lista_codigo: list[Candidata],
) -> DecisionGuardada:
    """Pasa los ids cortos del modelo a los reales, verifica la elección y arma el paso para el núcleo."""
    por_corto = {x.corto: x.contexto.id for x in lista_modelo}
    pasos_cortos = {s: real for x in lista_modelo for s, real in x.pasos_cortos.items()}
    elegidas = None if k.postulaciones is None else [por_corto.get(x, f"?{x}") for x in k.postulaciones]
    clasica = asociar(k.empresa, k.cargo, k.plataforma, conocidas, c.remitente.rsplit("@", 1)[-1])
    d = decidir(lista_codigo, elegidas, clasica.postulacion_id)
    paso = None
    if k.paso and k.es_postulacion:
        paso = PasoParaNucleo(
            descripcion=k.paso.descripcion,
            detalle=k.paso.detalle,
            plazo=k.paso.plazo,
            enlace=enlace_numero(c.enlaces, k.paso.enlace),
            mismo_que=pasos_cortos.get(k.paso.mismo_que or ""),
        )
    cumplidos = tuple((pasos_cortos[x.id], x.confianza) for x in k.pasos_cumplidos if x.id in pasos_cortos)
    return DecisionGuardada(d.postulacion_ids, d.candidatas, d.motivo, paso, cumplidos)


class ClasificarPendientes:
    def __init__(
        self,
        modelo: ModeloDeLenguaje,
        cola: ColaDeClasificacion,
        trazas: RegistroDeTrazas,
        ahora: Callable[[], datetime],
        precios: tuple[float, float],
        limite: int = 50,
        nucleo: FuenteDeContexto | None = None,
    ) -> None:
        self.modelo = modelo
        self.cola = cola
        self.trazas = trazas
        self.ahora = ahora
        self.precios = precios
        self.limite = limite
        self.nucleo = nucleo

    def ejecutar(self) -> ResumenDeClasificacion:
        r = ResumenDeClasificacion()
        pendientes = self.cola.pendientes(self.limite)
        conocidas: list[PostulacionConocida] = []
        if self.nucleo and pendientes:
            try:
                conocidas = self.nucleo.postulaciones()
            except NucleoNoDisponible as e:
                # Sin el núcleo no hay contexto: los correos esperan a la próxima vuelta.
                r.error = f"núcleo no disponible: {e}"
                self.cola.registrar_error_ia(r.error)
                return r
        for c in pendientes:
            try:
                clasif, uso, decision = self._uno(c, conocidas)
            except ErrorDeModelo as e:
                self.trazas.registrar(Traza("clasificar_correo", "", 0, 0, 0.0, 0, e.tipo, self.ahora()))
                if e.detiene:
                    r.error = f"{e.tipo}: {e}"
                    break
                r.fallidos += 1
                self.cola.marcar_intento_fallido(c.message_id, MAXIMO_INTENTOS)
                continue
            except NucleoNoDisponible as e:
                r.error = f"núcleo no disponible: {e}"
                break
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
            if decision is None:
                self.cola.marcar_clasificado(c.message_id, clasif, uso.modelo)
            else:
                self.cola.marcar_clasificado(c.message_id, clasif, uso.modelo, decision)
            r.clasificados += 1
            r.costo_usd = round(r.costo_usd + costo, 6)
            if clasif.es_postulacion:
                r.de_postulacion += 1
                clave = clasif.estado_sugerido or "sin cambio"
                r.por_estado[clave] = r.por_estado.get(clave, 0) + 1
                r.con_paso += int(clasif.paso is not None)
        self.cola.registrar_error_ia(r.error)
        return r

    def _uno(
        self, c: CorreoPorClasificar, conocidas: list[PostulacionConocida]
    ) -> tuple[Clasificacion, Uso, DecisionGuardada | None]:
        if not self.nucleo:
            clasif, uso = self.modelo.clasificar_correo(c.remitente, c.asunto, c.fragmento, c.plataforma)
            return clasif, uso, None
        clasif, uso, decision = clasificar_con_contexto(
            self.modelo, self.nucleo, self.cola, c, conocidas, self.ahora().date().isoformat()
        )
        return clasif, uso, decision


class _ConHilos(Protocol):
    def del_hilo(self, message_ids: tuple[str, ...]) -> tuple[str, ...]: ...


@runtime_checkable
class _ConDominios(Protocol):
    def postulaciones_del_dominio(self, dominio: str) -> tuple[str, ...]: ...


def clasificar_con_contexto(
    modelo: ModeloDeLenguaje,
    nucleo: FuenteDeContexto,
    hilos: _ConHilos,
    c: CorreoPorClasificar,
    conocidas: list[PostulacionConocida],
    hoy: str,
) -> tuple[Clasificacion, Uso, DecisionGuardada]:
    """Candidatas por código, contexto del núcleo, modelo y verificación (pasos.md §5.1 a §5.3)."""
    del_hilo = hilos.del_hilo(tuple(x for x in (c.en_respuesta_a, *c.referencias) if x))
    dominio = c.remitente.rsplit("@", 1)[-1].lower()
    del_dominio = hilos.postulaciones_del_dominio(dominio) if isinstance(hilos, _ConDominios) else ()
    lista = candidatas(
        empresa=None,
        cargo=None,
        plataforma=c.plataforma,
        dominio_remitente=c.remitente.rsplit("@", 1)[-1],
        textos=(c.asunto, c.fragmento, *c.enlaces),
        conocidas=conocidas,
        del_hilo=del_hilo,
        del_dominio=del_dominio,
    )
    contextos = nucleo.contexto([x.id for x in lista]) if lista else []
    lista_modelo = para_modelo(contextos)
    clasif, uso = modelo.clasificar_correo(
        c.remitente, c.asunto, c.fragmento, c.plataforma, candidatas=lista_modelo, hoy=hoy
    )
    return clasif, uso, resolver(c, clasif, lista_modelo, conocidas, lista)
