"""Repositorio de avisos en memoria: para evaluar Preguntar con un set propio sin tocar la base (F2-14)."""

import math
import uuid
from dataclasses import replace

from ia.aplicacion.puertos import AvisoGuardado, FiltrosDeAvisos
from ia.dominio.aviso import Aviso
from ia.dominio.calce import Calce, Requisito


def _coseno(a: list[float], b: list[float]) -> float:
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return 1 - sum(x * y for x, y in zip(a, b, strict=True)) / (na * nb)


class AvisosEnMemoria:
    def __init__(self) -> None:
        self.d: dict[str, AvisoGuardado] = {}
        self.vectores: dict[str, list[float]] = {}

    def guardar(self, a: Aviso) -> tuple[str, bool]:
        for g in self.d.values():
            if g.aviso.url == a.url:
                self.d[g.id] = replace(g, aviso=a)
                return g.id, False
        id = str(uuid.uuid4())
        self.d[id] = AvisoGuardado(id, a, None, None, None)
        return id, True

    def por_id(self, id: str) -> AvisoGuardado | None:
        return self.d.get(id)

    def _filtra(self, g: AvisoGuardado, f: FiltrosDeAvisos) -> bool:
        return (not f.modalidad or g.aviso.modalidad == f.modalidad) and (
            f.usd_minimo is None or (g.aviso.usd_mes or 0) >= f.usd_minimo
        )

    def listar(self, f: FiltrosDeAvisos) -> list[AvisoGuardado]:
        return [g for g in self.d.values() if self._filtra(g, f)][: f.limite]

    def sin_analizar(self, limite: int) -> list[AvisoGuardado]:
        return [g for g in self.d.values() if g.requisitos is None][:limite]

    def guardar_analisis(
        self, id: str, requisitos: list[Requisito], calce: Calce | None, modelo: str
    ) -> None:
        self.d[id] = replace(self.d[id], requisitos=tuple(requisitos), calce=calce)

    def recalcular(self, id: str, calce: Calce | None) -> None:
        self.d[id] = replace(self.d[id], calce=calce)

    def analizados(self) -> list[AvisoGuardado]:
        return [g for g in self.d.values() if g.requisitos is not None]

    def vincular(self, id: str, postulacion_id: str) -> None:
        self.d[id] = replace(self.d[id], postulacion_id=postulacion_id)

    def marcar_vinculo_enviado(self, id: str, clave: str) -> None:
        self.d[id] = replace(self.d[id], vinculo_enviado=clave)

    def sin_vector(self, limite: int) -> list[AvisoGuardado]:
        return [g for id, g in self.d.items() if id not in self.vectores][:limite]

    def guardar_vector(self, id: str, vector: list[float], modelo: str) -> None:
        self.vectores[id] = vector

    def cercanos(self, vector: list[float], k: int, f: FiltrosDeAvisos) -> list[AvisoGuardado]:
        candidatos = [(i, _coseno(v, vector)) for i, v in self.vectores.items() if self._filtra(self.d[i], f)]
        return [replace(self.d[i], distancia=d) for i, d in sorted(candidatos, key=lambda x: x[1])[:k]]

    def contar(self) -> dict[str, int]:
        return {"total": len(self.d), "conVector": len(self.vectores)}
