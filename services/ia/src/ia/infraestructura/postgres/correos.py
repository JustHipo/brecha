"""Repositorio de correos del esquema `ia`.

Sin el cuerpo completo: solo el fragmento de lo que pasó el filtro.
"""

from datetime import UTC, datetime

from sqlalchemy import Engine, func, select
from sqlalchemy.dialects.postgresql import insert

from ia.aplicacion.puertos import CorreoGuardado, PuntoDeLectura
from ia.dominio.correo import EstadoDeCorreo
from ia.infraestructura.postgres.tablas import correo, estado_vigia


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
