"""Filtro sin IA: decide qué correos son de postulaciones antes de que nada salga de la máquina."""

import unicodedata
from dataclasses import dataclass

from ia.dominio import reglas
from ia.dominio.correo import CorreoLeido


@dataclass(frozen=True)
class ResultadoFiltro:
    pasa: bool
    plataforma: str | None
    motivo: str


def normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return " ".join(sin_tildes.lower().split())


def _contiene(texto: str, palabras: tuple[str, ...]) -> str | None:
    t = normalizar(texto)
    return next((p for p in palabras if normalizar(p) in t), None)


def plataforma_por_dominio(dominio: str) -> str | None:
    for sufijo, plataforma in reglas.DOMINIOS_DE_PLATAFORMAS.items():
        if dominio == sufijo or dominio.endswith("." + sufijo):
            return plataforma
    if any(dominio == d or dominio.endswith("." + d) for d in reglas.DOMINIOS_DE_SELECCION):
        return "sitio_empresa"
    return None


def filtrar(correo: CorreoLeido, dominios_conocidos: frozenset[str] = frozenset()) -> ResultadoFiltro:
    """Decide si el correo es sobre una postulación. Nunca pasa la publicidad.

    - Desde una plataforma o un sistema de selección: pasa con cualquier palabra (los sistemas, siempre).
    - Desde un dominio que ya escribió por una postulación (`dominios_conocidos`): pasa si no es masivo,
      aunque no traiga palabras (una invitación de calendario de la misma persona que te invitó).
    - Desde otro remitente: pasa con una palabra fuerte, o con una débil si no es masivo.
    """
    publicidad = _contiene(correo.asunto, reglas.ASUNTOS_DE_PUBLICIDAD)
    if publicidad:
        return ResultadoFiltro(False, None, f"publicidad: {publicidad}")
    plataforma = plataforma_por_dominio(correo.dominio)
    comienzo = f"{correo.asunto}\n{correo.texto[: reglas.CARACTERES_PARA_PALABRAS]}"
    fuerte = _contiene(comienzo, reglas.PALABRAS_FUERTES)
    debil = _contiene(comienzo, reglas.PALABRAS_DEBILES)
    if plataforma == "sitio_empresa":
        palabra = fuerte or debil
        return ResultadoFiltro(
            True, plataforma, f"sistema de selección: {palabra}" if palabra else "sistema de selección"
        )
    if plataforma:
        palabra = fuerte or debil
        if palabra:
            return ResultadoFiltro(True, plataforma, f"plataforma y palabra: {palabra}")
        return ResultadoFiltro(False, plataforma, "plataforma sin palabras de proceso")
    if fuerte:
        return ResultadoFiltro(True, None, f"palabra fuerte: {fuerte}")
    if correo.dominio in dominios_conocidos and not correo.masivo:
        return ResultadoFiltro(True, None, "remitente que ya escribió por una postulación")
    if debil and not correo.masivo:
        return ResultadoFiltro(True, None, f"palabra en correo personal: {debil}")
    if debil:
        return ResultadoFiltro(False, None, f"masivo con palabra débil: {debil}")
    return ResultadoFiltro(False, None, "sin relación con postulaciones")
