"""Dobles en memoria para los casos de avisos."""

import uuid
from dataclasses import replace

from ia.aplicacion.casos.avisos import url_normalizada
from ia.aplicacion.puertos import (
    AvisoDePostulacion,
    AvisoGuardado,
    AvisoParaResponder,
    ErrorDeModelo,
    FiltrosDeAvisos,
    Traza,
    Uso,
)
from ia.dominio.asociacion import PostulacionConocida
from ia.dominio.aviso import Aviso
from ia.dominio.calce import Calce, Perfil, Requisito

USO = Uso("falso", 100, 20, 5)


class AvisosEnMemoria:
    def __init__(self) -> None:
        self.d: dict[str, AvisoGuardado] = {}
        self.vectores: dict[str, list[float]] = {}

    def guardar(self, a: Aviso) -> tuple[str, bool]:
        for g in self.d.values():
            if url_normalizada(g.aviso.url) == url_normalizada(a.url):
                self.d[g.id] = replace(g, aviso=a)
                return g.id, False
        id = str(uuid.uuid4())
        self.d[id] = AvisoGuardado(id, a, None, None, None)
        return id, True

    def por_id(self, id: str) -> AvisoGuardado | None:
        return self.d.get(id)

    def listar(self, f: FiltrosDeAvisos) -> list[AvisoGuardado]:
        return [g for g in self.d.values() if not f.modalidad or g.aviso.modalidad == f.modalidad][: f.limite]

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
        def dist(id: str) -> float:
            return sum((a - b) ** 2 for a, b in zip(self.vectores[id], vector, strict=True))

        ids = sorted(
            (i for i in self.vectores if not f.modalidad or self.d[i].aviso.modalidad == f.modalidad),
            key=dist,
        )
        return [self.d[i] for i in ids[:k]]

    def contar(self) -> dict[str, int]:
        return {"total": len(self.d)}


class PerfilFijo:
    def __init__(self, p: Perfil | None) -> None:
        self.p = p

    def perfil(self) -> Perfil | None:
        return self.p

    def guardar(self, p: Perfil) -> None:
        self.p = p


class Trazas:
    def __init__(self) -> None:
        self.t: list[Traza] = []

    def registrar(self, traza: Traza) -> None:
        self.t.append(traza)


class ModeloFalso:
    """Analiza por palabras del texto, embebe con un vector de 3 dimensiones y responde citando."""

    modelo_embeddings = "falso-emb"

    def __init__(self, error: ErrorDeModelo | None = None, cita: list[str] | None = None) -> None:
        self.error = error
        self.cita = cita
        self.llamadas = 0

    def analizar_aviso(self, aviso: Aviso) -> tuple[list[Requisito], Uso]:
        self.llamadas += 1
        if self.error:
            raise self.error
        palabras = {"nestjs": "NestJS", "python": "Python", "postgresql": "PostgreSQL", "docker": "Docker"}
        reqs = [Requisito(n, True) for k, n in palabras.items() if k in aviso.texto.lower()]
        if "deseable aws" in aviso.texto.lower():
            reqs.append(Requisito("AWS", False))
        return reqs, USO

    def embeber(self, textos: list[str]) -> tuple[list[list[float]], Uso]:
        if self.error:
            raise self.error

        def v(t: str) -> list[float]:
            t = t.lower()
            return [float("nestjs" in t), float("python" in t), float("remoto" in t)] + [0.0] * 1533

        return [v(t) for t in textos], USO

    def responder(self, pregunta: str, avisos: list[AvisoParaResponder]) -> tuple[str, list[str], Uso]:
        if self.error:
            raise self.error
        citados = self.cita if self.cita is not None else [avisos[0].id]
        return f"Encontré {avisos[0].titulo}.", citados, USO


class NucleoFalso:
    def __init__(
        self,
        postulaciones: list[PostulacionConocida],
        avisos: dict[str, AvisoDePostulacion] | None = None,
    ) -> None:
        self.p = postulaciones
        self.avisos = avisos or {}
        self.pedidos: list[str] = []
        self.enviados: list[tuple[str, str, float | None]] = []

    def aviso_de(self, postulacion_id: str) -> AvisoDePostulacion | None:
        self.pedidos.append(postulacion_id)
        return self.avisos.get(postulacion_id)

    def postulaciones(self) -> list[PostulacionConocida]:
        return self.p

    def vincular_aviso(self, postulacion_id: str, aviso_id: str, calce: float | None) -> None:
        self.enviados.append((postulacion_id, aviso_id, calce))


class FuenteFalsa:
    def __init__(self, avisos: list[Aviso], falla: bool = False) -> None:
        self.avisos = avisos
        self.falla = falla

    def buscar(self, consulta: str, maximo: int) -> list[Aviso]:
        if self.falla:
            raise RuntimeError("sin red")
        return self.avisos[:maximo]
