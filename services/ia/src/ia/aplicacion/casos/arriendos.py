"""Arriendos (docs/diseno/arriendos.md §7): correos clasificados y enviados al núcleo, propiedades
sacadas de un texto o de un chat de WhatsApp, y preguntas sobre las propiedades que sigues.

El modelo clasifica y extrae; el código valida, decide qué se manda y nunca deja que un teléfono vaya
al modelo.
"""

from collections.abc import Callable
from dataclasses import asdict, dataclass, field, replace
from datetime import datetime

from ia.aplicacion.puertos import (
    ColaDeArriendos,
    ErrorDeModelo,
    ModeloDeArriendos,
    NucleoDeArriendos,
    NucleoNoDisponible,
    RegistroDeTrazas,
    SenalDeArriendo,
    Traza,
    Uso,
)
from ia.dominio.arriendo import (
    ESTADO_POR_TIPO,
    ClasificacionArriendo,
    PropuestaDePropiedad,
    solo_https,
)
from ia.dominio.clasificacion import costo_usd
from ia.dominio.whatsapp import Mensaje, autores, desenmascarar, enmascarar, leer_chat, para_el_modelo

MAXIMO_INTENTOS = 5
MAXIMO_CARACTERES = 30_000


def _pesos(monto: float, moneda: str) -> str:
    return f"UF {monto:g}".replace(".", ",") if moneda == "UF" else f"${round(monto):,}".replace(",", ".")


def senales_de(
    message_id: str, remitente: str, asunto: str, recibido: datetime, k: ClasificacionArriendo
) -> list[SenalDeArriendo]:
    """Lo que se manda al núcleo por un correo. Una alerta trae una señal por aviso (van a la Bandeja o a la
    propiedad que ya tenga esa URL); el resto, una sola señal. Lo que no es de arriendo no se manda."""
    if not k.es_arriendo:
        return []
    if k.tipo == "alerta" and k.avisos:
        salida = []
        for i, a in enumerate(k.avisos[:30]):
            partes = [a.titulo]
            if a.precio:
                partes.append(_pesos(a.precio.monto, a.precio.moneda))
            if a.dormitorios is not None:
                partes.append(f"{a.dormitorios}D")
            if a.comuna:
                partes.append(a.comuna)
            salida.append(
                SenalDeArriendo(
                    referencia_externa=f"{message_id}#{i}",
                    resumen=f"Aviso de una alerta: {' · '.join(partes)}"[:2000],
                    estado_sugerido=None,
                    confianza=1.0,
                    recibida_en=recibido,
                    remitente=remitente,
                    asunto=asunto,
                    url=solo_https(a.url),
                    comuna=a.comuna,
                )
            )
        return salida
    sugerido = k.estado_sugerido or ESTADO_POR_TIPO.get(k.tipo)
    return [
        SenalDeArriendo(
            referencia_externa=message_id,
            resumen=k.resumen,
            estado_sugerido=sugerido,
            confianza=k.confianza,
            recibida_en=recibido,
            remitente=remitente,
            asunto=asunto,
            url=solo_https(k.url),
            direccion=k.direccion,
            comuna=k.comuna,
            contacto=k.contacto,
        )
    ]


@dataclass
class ResumenDeArriendos:
    clasificados: int = 0
    de_arriendo: int = 0
    senales: int = 0
    a_bandeja: int = 0
    fallidos: int = 0
    costo_usd: float = 0.0
    error: str | None = None


class ProcesarArriendos:
    """Correos de arriendo que pasaron el filtro: clasificar con el modelo y mandar sus señales al núcleo."""

    def __init__(
        self,
        modelo: ModeloDeArriendos,
        cola: ColaDeArriendos,
        nucleo: NucleoDeArriendos,
        trazas: RegistroDeTrazas,
        ahora: Callable[[], datetime],
        precios: tuple[float, float],
        limite: int = 30,
    ) -> None:
        self.modelo = modelo
        self.cola = cola
        self.nucleo = nucleo
        self.trazas = trazas
        self.ahora = ahora
        self.precios = precios
        self.limite = limite

    def _traza(self, caso: str, uso: Uso | None, resultado: str) -> float:
        costo = costo_usd(uso.tokens_entrada, uso.tokens_salida, *self.precios) if uso else 0.0
        self.trazas.registrar(
            Traza(
                caso,
                uso.modelo if uso else "",
                uso.tokens_entrada if uso else 0,
                uso.tokens_salida if uso else 0,
                costo,
                uso.duracion_ms if uso else 0,
                resultado,
                self.ahora(),
            )
        )
        return costo

    def ejecutar(self) -> ResumenDeArriendos:
        r = ResumenDeArriendos()
        for c in self.cola.pendientes_de_arriendo(self.limite):
            try:
                k, uso = self.modelo.clasificar_arriendo(c.remitente, c.asunto, c.fragmento)
            except ErrorDeModelo as e:
                self._traza("clasificar_arriendo", None, e.tipo)
                if e.detiene:
                    r.error = f"{e.tipo}: {e}"
                    break
                r.fallidos += 1
                self.cola.marcar_intento_fallido(c.message_id, MAXIMO_INTENTOS)
                continue
            r.costo_usd = round(r.costo_usd + self._traza("clasificar_arriendo", uso, "ok"), 6)
            r.clasificados += 1
            try:
                for s in senales_de(c.message_id, c.remitente, c.asunto, c.recibido_en, k):
                    destino = self.nucleo.registrar_senal_arriendo(s)
                    r.senales += 1
                    r.a_bandeja += int(destino == "bandeja")
            except NucleoNoDisponible as e:
                # Queda pendiente: en la próxima vuelta se clasifica y se manda de nuevo (el núcleo no
                # repite).
                r.error = f"núcleo no disponible: {e}"
                break
            r.de_arriendo += int(k.es_arriendo)
            self.cola.marcar_arriendo(c.message_id, asdict(k), uso.modelo, k.confianza)
        return r


# ── Importar (A5) ──


@dataclass
class ResultadoDeExtraccion:
    propuestas: list[PropuestaDePropiedad] = field(default_factory=list)
    mensajes: list[Mensaje] = field(default_factory=list)
    autores: list[str] = field(default_factory=list)
    yo: str | None = None
    recortado: bool = False
    costo_usd: float = 0.0


def _con_telefonos(p: PropuestaDePropiedad, marcas: dict[str, str]) -> PropuestaDePropiedad:
    """Vuelve a poner los teléfonos reales donde el modelo dejó marcas, y deja solo URLs web."""
    c = p.contacto
    contacto = (
        replace(c, nombre=desenmascarar(c.nombre, marcas), telefono=desenmascarar(c.telefono, marcas))
        if c
        else None
    )
    return replace(
        p,
        nota=desenmascarar(p.nota, marcas),
        direccion=desenmascarar(p.direccion, marcas),
        contacto=contacto,
        url=solo_https(p.url),
    )


class ExtraerArriendos:
    """Saca propiedades de un texto pegado o de un chat exportado. No guarda nada: la persona revisa y
    elige."""

    def __init__(
        self,
        modelo: ModeloDeArriendos,
        trazas: RegistroDeTrazas,
        ahora: Callable[[], datetime],
        precios: tuple[float, float],
    ) -> None:
        self.modelo = modelo
        self.trazas = trazas
        self.ahora = ahora
        self.precios = precios

    def _llamar(self, texto: str, es_chat: bool) -> tuple[list[PropuestaDePropiedad], float]:
        propuestas, uso = self.modelo.extraer_arriendos(texto, es_chat)
        costo = costo_usd(uso.tokens_entrada, uso.tokens_salida, *self.precios)
        self.trazas.registrar(
            Traza(
                "extraer_arriendos",
                uso.modelo,
                uso.tokens_entrada,
                uso.tokens_salida,
                costo,
                uso.duracion_ms,
                "ok",
                self.ahora(),
            )
        )
        return propuestas, costo

    def desde_texto(self, texto: str) -> ResultadoDeExtraccion:
        recortado = len(texto) > MAXIMO_CARACTERES
        enmascarado, marcas = enmascarar(texto[:MAXIMO_CARACTERES])
        propuestas, costo = self._llamar(enmascarado, False)
        return ResultadoDeExtraccion(
            [_con_telefonos(p, marcas) for p in propuestas], recortado=recortado, costo_usd=costo
        )

    def leer(self, chat: str) -> tuple[list[Mensaje], list[str]]:
        mensajes = leer_chat(chat)
        return mensajes, autores(mensajes)

    def desde_chat(self, chat: str, yo: str | None) -> ResultadoDeExtraccion:
        mensajes, quienes = self.leer(chat)
        texto = para_el_modelo(mensajes, yo)
        recortado = len(texto) > MAXIMO_CARACTERES
        if recortado:  # lo más reciente es lo que importa
            texto = texto[-MAXIMO_CARACTERES:]
        enmascarado, marcas = enmascarar(texto)
        propuestas, costo = self._llamar(enmascarado, True)
        indices = {m.indice for m in mensajes}
        limpias = [
            replace(q, mensajes=tuple(i for i in q.mensajes if i in indices))
            for q in (_con_telefonos(p, marcas) for p in propuestas)
        ]
        return ResultadoDeExtraccion(limpias, mensajes, quienes, yo, recortado, costo)


# ── Preguntar (A5) ──


@dataclass
class RespuestaDeArriendos:
    texto: str
    citados: list[dict[str, object]]
    descartados: int
    costo_usd: float


class PreguntarArriendos:
    """Preguntas sobre las propiedades que sigues. Solo se aceptan citas a propiedades que existen."""

    def __init__(
        self,
        modelo: ModeloDeArriendos,
        nucleo: NucleoDeArriendos,
        trazas: RegistroDeTrazas,
        ahora: Callable[[], datetime],
        precios: tuple[float, float],
    ) -> None:
        self.modelo = modelo
        self.nucleo = nucleo
        self.trazas = trazas
        self.ahora = ahora
        self.precios = precios

    def ejecutar(self, pregunta: str) -> RespuestaDeArriendos:
        propiedades = self.nucleo.propiedades_para_preguntar()
        if not propiedades:
            return RespuestaDeArriendos("Todavía no sigues ninguna propiedad.", [], 0, 0.0)
        texto, citados, uso = self.modelo.responder_arriendos(pregunta, propiedades)
        costo = costo_usd(uso.tokens_entrada, uso.tokens_salida, *self.precios)
        self.trazas.registrar(
            Traza(
                "preguntar_arriendos",
                uso.modelo,
                uso.tokens_entrada,
                uso.tokens_salida,
                costo,
                uso.duracion_ms,
                "ok",
                self.ahora(),
            )
        )
        por_id = {str(p["id"]): p for p in propiedades}
        validos = [por_id[c] for c in dict.fromkeys(citados) if c in por_id]
        return RespuestaDeArriendos(texto, validos, len(citados) - len(validos), costo)
