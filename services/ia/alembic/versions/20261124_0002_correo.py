"""Correos leídos y estado del vigía (F2-05).

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "correo",
        sa.Column("message_id", sa.String(998), primary_key=True),
        sa.Column("uid", sa.BigInteger, nullable=False),
        sa.Column("remitente", sa.String(320), nullable=False),
        sa.Column("recibido_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("estado", sa.String(20), nullable=False),
        sa.Column("plataforma", sa.String(30)),
        sa.Column("motivo", sa.String(200), nullable=False),
        sa.Column("asunto", sa.String(500)),
        sa.Column("fragmento", sa.Text),
        sa.Column("intentos", sa.Integer, nullable=False, server_default="0"),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
        schema="ia",
    )
    op.create_index("correo_estado_recibido", "correo", ["estado", "recibido_en"], schema="ia")
    op.create_table(
        "estado_vigia",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("uidvalidity", sa.BigInteger),
        sa.Column("ultimo_uid", sa.BigInteger),
        sa.Column("ultima_revision", sa.DateTime(timezone=True)),
        sa.Column("ultimo_error", sa.Text),
        sa.CheckConstraint("id = 1", name="estado_vigia_una_fila"),
        schema="ia",
    )


def downgrade() -> None:
    op.drop_table("estado_vigia", schema="ia")
    op.drop_table("correo", schema="ia")
