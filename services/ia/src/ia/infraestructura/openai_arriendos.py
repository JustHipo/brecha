"""Prompts y esquemas de Arriendos para OpenAI (docs/diseno/arriendos.md §7), con salida estricta."""

from typing import Literal

from pydantic import BaseModel, Field

from ia.dominio.arriendo import (
    AvisoEnAlerta,
    ClasificacionArriendo,
    Contacto,
    Precio,
    PropuestaDePropiedad,
)

PROMPT_CORREO = """Eres el clasificador de correos de arriendo de Brecha. La persona busca un lugar para
arrendar (es la arrendataria). Recibes un correo que ya pasó un filtro. Responde SIEMPRE en español.

Decide:
- es_arriendo: true si trata de propiedades que la persona busca, vio o le ofrecen en arriendo (alertas de
  portales, respuestas de corredores o dueños, visitas, documentos, aprobación o rechazo). Publicidad
  general, cobros, compras o correos de su propio arriendo actual: false.
- tipo: alerta (un portal le manda avisos nuevos o cambios de precio), mensaje (le responde o escribe un
  corredor o dueño), visita (confirma o propone una visita), documentos (le piden o confirman documentos o
  una evaluación), aprobacion (lo aprueban o le ofrecen firmar), rechazo (no lo eligieron),
  no_disponible (la propiedad ya se arrendó o se dio de baja), otro.
- estado_sugerido: vista, contactada, visita_agendada, visitada, en_evaluacion, aprobada, arrendada,
  rechazada, descartada, no_disponible, o ninguno si el correo no cambia el estado.
- resumen: una línea, máximo 140 caracteres, sin datos personales de la persona.
- confianza (0 a 1) del estado_sugerido: 0,9 o más SOLO si el correo lo dice explícito
  («ya se arrendó», «tu postulación fue aprobada»). Si hay que interpretar, 0,7 o menos.
- url, direccion, comuna de la propiedad si aparecen; null si no.
- contacto: quien escribe por la propiedad (corredor o dueño) con su nombre y correo; el teléfono solo si
  aparece como marca [tel n]. null si no hay.
- avisos: solo si tipo es alerta, cada propiedad de la alerta con url, titulo, comuna, precio y dormitorios.
  No inventes avisos ni datos que no estén en el correo.
"""

PROMPT_EXTRAER = """Extraes propiedades en arriendo de un texto para Brecha. La persona busca arriendo.
Responde en español. El texto puede ser un aviso, un correo, una lista o un chat de WhatsApp con un
corredor o dueño (en el chat, «Tú» es la persona).
- Una propiedad por cada lugar distinto que se ofrece o se conversa. No inventes propiedades ni datos.
- tipo: departamento, casa, pieza u otro. precio con moneda CLP o UF (si dice UF). gastos_comunes en pesos.
- requisitos solo si se mencionan: renta_veces (renta líquida exigida en veces el arriendo), aval,
  meses_garantia.
- estado_sugerido según lo que ya pasó: contactada si ya hubo conversación, visita_agendada si quedaron en
  una visita futura, visitada si ya la vio, en_evaluacion si envió documentos, aprobada, rechazada,
  no_disponible si se arrendó a otro; ninguno si no se sabe.
- contacto: el corredor o dueño. El teléfono solo como la marca [tel n] tal cual aparece.
- nota: una o dos líneas útiles (condiciones, lo que falta preguntar). Sin datos personales de la persona.
- mensajes (solo en un chat): los números [n] de los mensajes que hablan de esa propiedad.
"""

PROMPT_PREGUNTA = """Respondes preguntas sobre las propiedades en arriendo que la persona sigue en Brecha.
Responde en español, breve y concreto, usando SOLO las propiedades entregadas (cada una con su id).
- citados: ids de las propiedades en que se basa tu respuesta. Solo ids de la lista.
- El calce (0 a 100) y las brechas los calculó Brecha contra las reglas de la persona: úsalos tal cual.
- Si ninguna propiedad responde la pregunta, dilo y deja citados vacío. No muestres los ids en el texto.
"""

Estado = Literal[
    "vista",
    "contactada",
    "visita_agendada",
    "visitada",
    "en_evaluacion",
    "aprobada",
    "arrendada",
    "rechazada",
    "descartada",
    "no_disponible",
    "ninguno",
]


class _Precio(BaseModel):
    monto: float = Field(gt=0)
    moneda: Literal["CLP", "UF"]


class _Contacto(BaseModel):
    nombre: str | None = Field(max_length=200)
    telefono: str | None = Field(max_length=40)
    correo: str | None = Field(max_length=200)
    rol: Literal["corredor", "dueno", "conserje", "administracion", "otro"] | None


class _Aviso(BaseModel):
    url: str | None = Field(max_length=1000)
    titulo: str = Field(max_length=200)
    comuna: str | None = Field(max_length=100)
    precio: _Precio | None
    dormitorios: int | None = Field(ge=0, le=50)


class _Correo(BaseModel):
    es_arriendo: bool
    tipo: Literal[
        "alerta", "mensaje", "visita", "documentos", "aprobacion", "rechazo", "no_disponible", "otro"
    ]
    estado_sugerido: Estado
    resumen: str = Field(max_length=200)
    confianza: float = Field(ge=0, le=1)
    url: str | None = Field(max_length=1000)
    direccion: str | None = Field(max_length=300)
    comuna: str | None = Field(max_length=100)
    contacto: _Contacto | None
    avisos: list[_Aviso] = Field(max_length=30)


class _Propuesta(BaseModel):
    titulo: str | None = Field(max_length=200)
    tipo: Literal["departamento", "casa", "pieza", "otro"]
    direccion: str | None = Field(max_length=300)
    comuna: str | None = Field(max_length=100)
    precio: _Precio | None
    gastos_comunes: float | None = Field(ge=0)
    dormitorios: int | None = Field(ge=0, le=50)
    banos: int | None = Field(ge=0, le=50)
    m2: float | None = Field(ge=0)
    estacionamientos: int | None = Field(ge=0, le=20)
    mascotas: bool | None
    amoblado: bool | None
    url: str | None = Field(max_length=1000)
    renta_veces: float | None = Field(ge=0, le=10)
    aval: bool | None
    meses_garantia: float | None = Field(ge=0, le=24)
    estado_sugerido: Estado
    contacto: _Contacto | None
    nota: str | None = Field(max_length=500)
    mensajes: list[int] = Field(max_length=500)


class _Extraccion(BaseModel):
    propiedades: list[_Propuesta] = Field(max_length=20)


class _Respuesta(BaseModel):
    respuesta: str = Field(max_length=2500)
    citados: list[str] = Field(max_length=10)


def _precio(p: _Precio | None) -> Precio | None:
    return Precio(p.monto, p.moneda) if p else None


def _contacto(c: _Contacto | None) -> Contacto | None:
    if not c or not (c.nombre or c.telefono or c.correo):
        return None
    return Contacto(c.nombre, c.telefono, c.correo, c.rol)


def _estado(e: str) -> str | None:
    return None if e == "ninguno" else e


def a_clasificacion(s: _Correo) -> ClasificacionArriendo:
    return ClasificacionArriendo(
        es_arriendo=s.es_arriendo,
        tipo=s.tipo,
        estado_sugerido=_estado(s.estado_sugerido) if s.es_arriendo else None,
        resumen=s.resumen[:140],
        confianza=s.confianza,
        url=s.url,
        direccion=s.direccion,
        comuna=s.comuna,
        contacto=_contacto(s.contacto),
        avisos=tuple(
            AvisoEnAlerta(a.url, a.titulo, a.comuna, _precio(a.precio), a.dormitorios) for a in s.avisos
        ),
    )


def a_propuesta(p: _Propuesta) -> PropuestaDePropiedad:
    return PropuestaDePropiedad(
        titulo=p.titulo,
        tipo=p.tipo,
        direccion=p.direccion,
        comuna=p.comuna,
        precio=_precio(p.precio),
        gastos_comunes=p.gastos_comunes,
        dormitorios=p.dormitorios,
        banos=p.banos,
        m2=p.m2,
        estacionamientos=p.estacionamientos,
        mascotas=p.mascotas,
        amoblado=p.amoblado,
        url=p.url,
        renta_veces=p.renta_veces,
        aval=p.aval,
        meses_garantia=p.meses_garantia,
        estado_sugerido=_estado(p.estado_sugerido),
        contacto=_contacto(p.contacto),
        nota=p.nota,
        mensajes=tuple(p.mensajes),
    )


def bloque_de_propiedad(p: dict[str, object]) -> str:
    brechas = p.get("brechas")
    lista = "; ".join(str(b) for b in brechas) if isinstance(brechas, list) else ""
    calce = p.get("calce")
    extra = [
        f"Brechas: {lista}" if lista else "",
        "te toca responder" if p.get("pendiente") == "responder" else "",
        f"visita {p['proximaVisita']}" if p.get("proximaVisita") else "",
    ]
    return (
        f"[id: {p['id']}] {p['titulo']} · {p['estado']} · {p.get('comuna') or 'sin comuna'}\n"
        f"Arriendo: {p.get('precioPesos') or 's/d'} · gastos comunes: {p.get('gastosComunes') or 's/d'} · "
        f"{p.get('dormitorios') or '?'}D {p.get('banos') or '?'}B · {p.get('m2') or '?'} m²\n"
        f"Calce: {calce if calce is not None else 's/d'}" + "".join(f" · {x}" for x in extra if x)
    )
