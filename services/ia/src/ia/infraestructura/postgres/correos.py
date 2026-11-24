"""Repositorio de correos del esquema `ia`.

Sin el cuerpo completo: solo el fragmento de lo que pasó el filtro.
"""

from dataclasses import asdict
from datetime import UTC, datetime

from sqlalchemy import Engine, func, select, update
from sqlalchemy.dialects.postgresql import insert

from ia.aplicacion.puertos import (
    AvisoRedPorEnviar,
    ClasificadoPorEnviar,
    CorreoGuardado,
    CorreoPorClasificar,
    EstadoDelServicio,
    PuntoDeLectura,
    Traza,
)
from ia.dominio.clasificacion import Clasificacion
from ia.dominio.correo import EstadoDeCorreo
from ia.dominio.linkedin import AvisoDeLinkedin
from ia.infraestructura.postgres.tablas import aviso_red, clasificacion, correo, estado_vigia, traza


class RepositorioPostgresDeCorreos:
    def __init__(self, motor: Engine) -> None:
        self.motor = motor

    def punto_de_lectura(self) -> PuntoDeLectura:
        with self.motor.connect() as c:
            fila = c.execute(select(estado_vigia).where(estado_vigia.c.id == 1)).first()
        return PuntoDeLectura(fila.uidvalidity, fila.ultimo_uid) if fila else PuntoDeLectura(None, None)

    def existe(self, message_id: str) -> bool:
        with self.motor.connect() as c:
            return (
                c.execute(select(correo.c.message_id).where(correo.c.message_id == message_id)).first()
                is not None
            )

    def guardar(self, g: CorreoGuardado) -> None:
        with self.motor.begin() as c:
            c.execute(
                insert(correo)
                .values(
                    message_id=g.message_id,
                    uid=g.uid,
                    remitente=g.remitente[:320],
                    recibido_en=g.recibido_en,
                    estado=g.estado.value,
                    plataforma=g.plataforma,
                    motivo=g.motivo[:200],
                    asunto=g.asunto,
                    fragmento=g.fragmento,
                    creado_en=datetime.now(UTC),
                )
                .on_conflict_do_nothing(index_elements=["message_id"])
            )

    def registrar_revision(self, punto: PuntoDeLectura, cuando: datetime, error: str | None) -> None:
        valores = {
            "uidvalidity": punto.uidvalidity,
            "ultimo_uid": punto.ultimo_uid,
            "ultima_revision": cuando,
            "ultimo_error": error,
        }
        with self.motor.begin() as c:
            c.execute(
                insert(estado_vigia)
                .values(id=1, **valores)
                .on_conflict_do_update(index_elements=["id"], set_=valores)
            )

    def en_cola(self) -> int:
        with self.motor.connect() as c:
            n = c.execute(
                select(func.count())
                .select_from(correo)
                .where(correo.c.estado == EstadoDeCorreo.PENDIENTE.value)
            ).scalar_one()
        return int(n)

    # ── Cola de clasificación (F2-06) ───────────────────────────────────────────

    def pendientes(self, limite: int) -> list[CorreoPorClasificar]:
        with self.motor.connect() as c:
            filas = c.execute(
                select(correo)
                .where(correo.c.estado == EstadoDeCorreo.PENDIENTE.value)
                .order_by(correo.c.recibido_en)
                .limit(limite)
            ).all()
        return [
            CorreoPorClasificar(
                f.message_id, f.remitente, f.asunto or "", f.fragmento or "", f.plataforma, f.intentos
            )
            for f in filas
        ]

    def marcar_clasificado(self, message_id: str, clasif: Clasificacion, modelo: str) -> None:
        with self.motor.begin() as c:
            c.execute(
                insert(clasificacion)
                .values(
                    message_id=message_id,
                    resultado=asdict(clasif),
                    modelo=modelo,
                    confianza=clasif.confianza,
                    creada_en=datetime.now(UTC),
                )
                .on_conflict_do_nothing(index_elements=["message_id"])
            )
            c.execute(
                update(correo)
                .where(correo.c.message_id == message_id)
                .values(estado=EstadoDeCorreo.CLASIFICADO.value)
            )

    def marcar_intento_fallido(self, message_id: str, maximo: int) -> None:
        with self.motor.begin() as c:
            c.execute(
                update(correo).where(correo.c.message_id == message_id).values(intentos=correo.c.intentos + 1)
            )
            c.execute(
                update(correo)
                .where(correo.c.message_id == message_id, correo.c.intentos >= maximo)
                .values(estado=EstadoDeCorreo.ERROR.value)
            )

    def registrar_error_ia(self, error: str | None) -> None:
        with self.motor.begin() as c:
            c.execute(
                insert(estado_vigia)
                .values(id=1, ultimo_error_ia=error)
                .on_conflict_do_update(index_elements=["id"], set_={"ultimo_error_ia": error})
            )

    # ── Cola de envío al núcleo (F2-07) ─────────────────────────────────────────

    def por_enviar(self, limite: int) -> list[ClasificadoPorEnviar]:
        with self.motor.connect() as c:
            filas = c.execute(
                select(
                    clasificacion.c.message_id,
                    clasificacion.c.resultado,
                    correo.c.remitente,
                    correo.c.asunto,
                    correo.c.recibido_en,
                )
                .join(correo, correo.c.message_id == clasificacion.c.message_id)
                .where(clasificacion.c.enviada_al_nucleo.is_(False))
                .where(clasificacion.c.resultado["es_postulacion"].astext == "true")
                .order_by(correo.c.recibido_en)
                .limit(limite)
            ).all()
        return [
            ClasificadoPorEnviar(
                f.message_id, Clasificacion(**f.resultado), f.remitente, f.asunto or "", f.recibido_en
            )
            for f in filas
        ]

    def marcar_enviado(self, message_id: str, postulacion_id: str | None) -> None:
        with self.motor.begin() as c:
            c.execute(
                update(clasificacion)
                .where(clasificacion.c.message_id == message_id)
                .values(enviada_al_nucleo=True, postulacion_id=postulacion_id)
            )

    # ── Estado para Conexiones (F2-08) ───────────────────────────────────────────

    def estado(self, desde_mes: datetime) -> EstadoDelServicio:
        with self.motor.connect() as c:
            v = c.execute(select(estado_vigia).where(estado_vigia.c.id == 1)).first()
            cola = c.execute(
                select(func.count())
                .select_from(correo)
                .where(correo.c.estado == EstadoDeCorreo.PENDIENTE.value)
            ).scalar_one()
            clasificados = c.execute(select(func.count()).select_from(clasificacion)).scalar_one()
            gasto, llamadas = c.execute(
                select(func.coalesce(func.sum(traza.c.costo_usd), 0), func.count()).where(
                    traza.c.creada_en >= desde_mes
                )
            ).one()
        return EstadoDelServicio(
            ultima_revision=v.ultima_revision if v else None,
            ultimo_error_correo=v.ultimo_error if v else None,
            ultimo_error_ia=v.ultimo_error_ia if v else None,
            en_cola=int(cola),
            clasificados=int(clasificados),
            gasto_mes_usd=float(gasto),
            llamadas_mes=int(llamadas),
        )

    # ── Avisos de LinkedIn para tu red (D40) ───────────────────────────────────

    def guardar_avisos_red(
        self, message_id: str, recibido_en: datetime, avisos: list[AvisoDeLinkedin]
    ) -> int:
        ahora = datetime.now(UTC)
        filas = [
            {
                "message_id": message_id,
                "indice": i,
                "tipo": a.tipo,
                "nombre": a.nombre[:200],
                "perfil_url": a.perfil_url[:500],
                "titular": a.titular[:300] if a.titular else None,
                "empresa": a.empresa[:200] if a.empresa else None,
                "recibido_en": recibido_en,
                "creado_en": ahora,
            }
            for i, a in enumerate(avisos)
        ]
        if not filas:
            return 0
        with self.motor.begin() as c:
            # rowcount no es confiable con varias filas: se cuentan las que de verdad entraron.
            r = c.execute(
                insert(aviso_red).values(filas).on_conflict_do_nothing().returning(aviso_red.c.indice)
            )
            return len(r.all())

    def avisos_red_por_enviar(self, limite: int) -> list[AvisoRedPorEnviar]:
        q = (
            select(aviso_red)
            .where(aviso_red.c.enviado.is_(False))
            .order_by(aviso_red.c.recibido_en, aviso_red.c.indice)
            .limit(limite)
        )
        with self.motor.connect() as c:
            return [
                AvisoRedPorEnviar(
                    f.message_id,
                    f.indice,
                    f.recibido_en,
                    AvisoDeLinkedin(f.tipo, f.nombre, f.perfil_url, f.titular, f.empresa),
                )
                for f in c.execute(q)
            ]

    def marcar_aviso_red_enviado(
        self, message_id: str, indice: int, contacto_id: str, postulacion_id: str | None
    ) -> None:
        with self.motor.begin() as c:
            c.execute(
                update(aviso_red)
                .where(aviso_red.c.message_id == message_id, aviso_red.c.indice == indice)
                .values(enviado=True, contacto_id=contacto_id, postulacion_id=postulacion_id)
            )


class TrazasPostgres:
    """D28: cada llamada al modelo queda con modelo, tokens, costo y resultado; nunca el texto del correo."""

    def __init__(self, motor: Engine) -> None:
        self.motor = motor

    def registrar(self, t: Traza) -> None:
        with self.motor.begin() as c:
            c.execute(insert(traza).values(**asdict(t)))
