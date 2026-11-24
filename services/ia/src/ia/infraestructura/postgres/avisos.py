"""Repositorio de avisos y del perfil (esquema `ia`). La búsqueda por vector usa pgvector (coseno, HNSW)."""

import uuid
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import Engine, Row, Text, and_, case, func, or_, select, true, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.sql.elements import ColumnElement

from ia.aplicacion.casos.avisos import url_normalizada
from ia.aplicacion.puertos import AvisoGuardado, FiltrosDeAvisos
from ia.dominio.aviso import Aviso
from ia.dominio.calce import Calce, Perfil, Requisito
from ia.infraestructura.postgres.tablas import aviso as t
from ia.infraestructura.postgres.tablas import perfil as tp


def _requisitos(crudo: Any) -> tuple[Requisito, ...] | None:
    if crudo is None:
        return None
    return tuple(Requisito(r["nombre"], bool(r["obligatorio"]), r.get("anos")) for r in crudo)


def _de_fila(f: Row[Any], distancia: float | None = None) -> AvisoGuardado:
    a = Aviso(
        url=f.url,
        titulo=f.titulo,
        empresa=f.empresa,
        plataforma=f.plataforma,
        modalidad=f.modalidad,
        origen=f.origen,
        texto=f.texto,
        ubicacion=f.ubicacion,
        stack=tuple(f.stack or ()),
        sueldo=f.sueldo,
        usd_mes=f.usd_mes,
        publicado_en=f.publicado_en,
        cierre=f.cierre,
        cita=f.cita,
    )
    calce = Calce(f.calce, tuple(f.brechas or ()), tuple(f.cumple or ())) if f.calce is not None else None
    return AvisoGuardado(
        f.id, a, _requisitos(f.requisitos), calce, f.postulacion_id, distancia, f.vinculo_enviado
    )


def _calce(c: Calce | None) -> dict[str, Any]:
    if c is None:
        return {"calce": None, "brechas": None, "cumple": None}
    return {"calce": c.puntaje, "brechas": list(c.brechas), "cumple": list(c.cumple)}


_COLUMNAS = [c for c in t.c if c.name != "embedding"]


class RepositorioPostgresDeAvisos:
    def __init__(self, motor: Engine) -> None:
        self.motor = motor

    def guardar(self, a: Aviso) -> tuple[str, bool]:
        ahora = datetime.now(UTC)
        datos = {
            "url": a.url,
            "titulo": a.titulo[:300],
            "empresa": a.empresa[:200],
            "plataforma": a.plataforma,
            "modalidad": a.modalidad,
            "origen": a.origen,
            "texto": a.texto,
            "ubicacion": (a.ubicacion or None) and a.ubicacion[:200],
            "stack": list(a.stack),
            "sueldo": (a.sueldo or None) and a.sueldo[:200],
            "usd_mes": a.usd_mes,
            "publicado_en": a.publicado_en,
            "cierre": a.cierre,
            "cita": a.cita,
        }
        nuevo_id = str(uuid.uuid4())
        base = insert(t).values(
            id=nuevo_id, url_clave=url_normalizada(a.url), creado_en=ahora, actualizado_en=ahora, **datos
        )
        cambio = t.c.texto.is_distinct_from(base.excluded.texto)
        q = base.on_conflict_do_update(
            index_elements=["url_clave"],
            set_={
                **{k: base.excluded[k] for k in datos},
                "actualizado_en": ahora,
                # Si el texto cambió, el análisis y el vector ya no valen.
                "requisitos": _si(cambio, None, t.c.requisitos),
                "embedding": _si(cambio, None, t.c.embedding),
            },
        ).returning(t.c.id, (t.c.creado_en == ahora).label("nuevo"))
        with self.motor.begin() as c:
            fila = c.execute(q).one()
        return fila.id, bool(fila.nuevo)

    def por_id(self, id: str) -> AvisoGuardado | None:
        with self.motor.connect() as c:
            f = c.execute(select(*_COLUMNAS).where(t.c.id == id)).first()
        return _de_fila(f) if f else None

    def _donde(self, f: FiltrosDeAvisos) -> list[ColumnElement[bool]]:
        cond: list[ColumnElement[bool]] = []
        if f.texto:
            patron = f"%{f.texto.strip()}%"
            cond.append(
                or_(
                    t.c.titulo.ilike(patron),
                    t.c.empresa.ilike(patron),
                    t.c.stack.cast(Text).ilike(patron),
                )
            )
        if f.modalidad:
            cond.append(t.c.modalidad == f.modalidad)
        if f.plataforma:
            cond.append(t.c.plataforma == f.plataforma)
        if f.calce_minimo is not None:
            cond.append(t.c.calce >= f.calce_minimo)
        if f.usd_minimo is not None:
            cond.append(t.c.usd_mes >= f.usd_minimo)
        return cond

    def listar(self, f: FiltrosDeAvisos) -> list[AvisoGuardado]:
        q = (
            select(*_COLUMNAS)
            .where(and_(true(), *self._donde(f)))
            .order_by(t.c.calce.desc().nulls_last(), t.c.publicado_en.desc().nulls_last(), t.c.titulo)
            .limit(f.limite)
        )
        with self.motor.connect() as c:
            return [_de_fila(x) for x in c.execute(q)]

    def sin_analizar(self, limite: int) -> list[AvisoGuardado]:
        q = select(*_COLUMNAS).where(t.c.requisitos.is_(None)).order_by(t.c.creado_en).limit(limite)
        with self.motor.connect() as c:
            return [_de_fila(x) for x in c.execute(q)]

    def analizados(self) -> list[AvisoGuardado]:
        with self.motor.connect() as c:
            return [_de_fila(x) for x in c.execute(select(*_COLUMNAS).where(t.c.requisitos.is_not(None)))]

    def guardar_analisis(
        self, id: str, requisitos: list[Requisito], calce: Calce | None, modelo: str
    ) -> None:
        crudo = [{"nombre": r.nombre, "obligatorio": r.obligatorio, "anos": r.anos} for r in requisitos]
        with self.motor.begin() as c:
            c.execute(
                update(t)
                .where(t.c.id == id)
                .values(
                    requisitos=crudo, analizado_con=modelo, actualizado_en=datetime.now(UTC), **_calce(calce)
                )
            )

    def recalcular(self, id: str, calce: Calce | None) -> None:
        with self.motor.begin() as c:
            c.execute(update(t).where(t.c.id == id).values(**_calce(calce)))

    def vincular(self, id: str, postulacion_id: str) -> None:
        with self.motor.begin() as c:
            c.execute(update(t).where(t.c.id == id).values(postulacion_id=postulacion_id))

    def marcar_vinculo_enviado(self, id: str, clave: str) -> None:
        with self.motor.begin() as c:
            c.execute(update(t).where(t.c.id == id).values(vinculo_enviado=clave))

    def sin_vector(self, limite: int) -> list[AvisoGuardado]:
        q = select(*_COLUMNAS).where(t.c.embedding.is_(None)).order_by(t.c.creado_en).limit(limite)
        with self.motor.connect() as c:
            return [_de_fila(x) for x in c.execute(q)]

    def guardar_vector(self, id: str, vector: list[float], modelo: str) -> None:
        with self.motor.begin() as c:
            c.execute(update(t).where(t.c.id == id).values(embedding=vector, embedding_modelo=modelo))

    def cercanos(self, vector: list[float], k: int, f: FiltrosDeAvisos) -> list[AvisoGuardado]:
        distancia = t.c.embedding.cosine_distance(vector).label("distancia")
        q = (
            select(*_COLUMNAS, distancia)
            .where(t.c.embedding.is_not(None), *self._donde(f))
            .order_by(distancia)
            .limit(k)
        )
        with self.motor.connect() as c:
            return [_de_fila(cast(Row[Any], x), float(x.distancia)) for x in c.execute(q)]

    def contar(self) -> dict[str, int]:
        with self.motor.connect() as c:
            fila = c.execute(
                select(
                    func.count(),
                    func.count(t.c.requisitos),
                    func.count(t.c.embedding),
                    func.count(t.c.postulacion_id),
                )
            ).one()
        return {"total": fila[0], "analizados": fila[1], "conVector": fila[2], "vinculados": fila[3]}


def _si(condicion: ColumnElement[bool], entonces: Any, si_no: Any) -> Any:
    return case((condicion, entonces), else_=si_no)


class RepositorioPostgresDePerfil:
    def __init__(self, motor: Engine) -> None:
        self.motor = motor

    def perfil(self) -> Perfil | None:
        with self.motor.connect() as c:
            f = c.execute(select(tp).where(tp.c.id == 1)).first()
        return Perfil(dict(f.herramientas), f.anos_totales) if f else None

    def guardar(self, p: Perfil) -> None:
        datos = {
            "herramientas": p.herramientas,
            "anos_totales": p.anos_totales,
            "actualizado_en": datetime.now(UTC),
        }
        q = insert(tp).values(id=1, **datos)
        with self.motor.begin() as c:
            c.execute(q.on_conflict_do_update(index_elements=["id"], set_=datos))
