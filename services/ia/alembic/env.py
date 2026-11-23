"""Migraciones del esquema `ia` (ADR 0013): el núcleo no lo toca y este servicio no toca el de él."""

import os

from alembic import context
from sqlalchemy import create_engine, pool

from ia.infraestructura.config import cargar_config

ESQUEMA = "ia"
url = os.environ.get("IA_DATABASE_URL_MIGRAR") or cargar_config().ia_database_url


def correr() -> None:
    motor = create_engine(url, poolclass=pool.NullPool)
    with motor.connect() as conexion:
        context.configure(
            connection=conexion,
            target_metadata=None,
            version_table_schema=ESQUEMA,
            include_schemas=True,
        )
        with context.begin_transaction():
            conexion.exec_driver_sql(f"SET search_path TO {ESQUEMA}, public")
            context.run_migrations()


correr()
