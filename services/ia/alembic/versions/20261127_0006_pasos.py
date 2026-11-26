"""Pasos pendientes (docs/diseno/pasos.md §4.4): el hilo y los enlaces de confianza de cada correo,
y las postulaciones de cada clasificación (un correo puede tocar varias).

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("correo", sa.Column("en_respuesta_a", sa.String(998)), schema="ia")
    op.add_column("correo", sa.Column("referencias", JSONB), schema="ia")
    # Las URL reales de «[enlace N]»: quedan en la máquina, nunca van al modelo (D54).
    op.add_column("correo", sa.Column("enlaces", JSONB), schema="ia")
    op.add_column(
        "clasificacion",
        sa.Column("postulacion_ids", ARRAY(sa.String(36)), nullable=False, server_default="{}"),
        schema="ia",
    )
    op.execute(
        "UPDATE ia.clasificacion SET postulacion_ids = ARRAY[postulacion_id] WHERE postulacion_id IS NOT NULL"
    )
    op.create_index("correo_en_respuesta_a_idx", "correo", ["en_respuesta_a"], schema="ia")


def downgrade() -> None:
    op.drop_index("correo_en_respuesta_a_idx", table_name="correo", schema="ia")
    op.drop_column("clasificacion", "postulacion_ids", schema="ia")
    op.drop_column("correo", "enlaces", schema="ia")
    op.drop_column("correo", "referencias", schema="ia")
    op.drop_column("correo", "en_respuesta_a", schema="ia")
