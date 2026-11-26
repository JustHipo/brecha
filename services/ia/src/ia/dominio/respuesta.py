"""Preguntar (F2-12): la respuesta solo puede citar avisos que se recuperaron."""

from dataclasses import dataclass

NO_ENCONTRE = "No encontré avisos que respondan eso entre los que tienes guardados."


@dataclass(frozen=True)
class Respuesta:
    texto: str
    citados: tuple[str, ...]
    descartados: tuple[str, ...] = ()  # ids que el modelo citó y no estaban entre los recuperados


def verificar_citas(texto: str, citados: list[str], recuperados: list[str]) -> Respuesta:
    permitidos = set(recuperados)
    validos = tuple(dict.fromkeys(c for c in citados if c in permitidos))
    descartados = tuple(dict.fromkeys(c for c in citados if c not in permitidos))
    if not validos:
        return Respuesta(NO_ENCONTRE, (), descartados)
    return Respuesta(texto.strip(), validos, descartados)
