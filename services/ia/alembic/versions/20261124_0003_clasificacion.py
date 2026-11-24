"""Clasificaciones del modelo y trazas de cada llamada (F2-06, D28).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("estado_vigia", sa.Column("ultimo_error_ia", sa.Text), schema="ia")
    op.create_table(
        "clasificacion",
        sa.Column("message_id", sa.String(998), sa.ForeignKey("ia.correo.message_id"), primary_key=True),
        sa.Column("resultado", JSONB, nullable=False),
        sa.Column("modelo", sa.String(100), nullable=False),
        sa.Column("confianza", sa.Float, nullable=False),
        sa.Column("postulacion_id", sa.String(36)),
        sa.Column("enviada_al_nucleo", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("creada_en", sa.DateTime(timezone=True), nullable=False),
        schema="ia",
    )
    op.create_table(
        "traza",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("caso", sa.String(50), nullable=False),
        sa.Column("modelo", sa.String(100), nullable=False),
        sa.Column("tokens_entrada", sa.Integer, nullable=False),
        sa.Column("tokens_salida", sa.Integer, nullable=False),
        sa.Column("costo_usd", sa.Numeric(12, 6), nullable=False),
        sa.Column("duracion_ms", sa.Integer, nullable=False),
        sa.Column("resultado", sa.String(30), nullable=False),
        sa.Column("creada_en", sa.DateTime(timezone=True), nullable=False),
        schema="ia",
    )
    op.create_index("traza_creada_en", "traza", ["creada_en"], schema="ia")


def downgrade() -> None:
    op.drop_table("traza", schema="ia")
    op.drop_table("clasificacion", schema="ia")
    op.drop_column("estado_vigia", "ultimo_error_ia", schema="ia")
