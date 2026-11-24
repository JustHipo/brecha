"""Avisos de LinkedIn leídos del correo, por enviar a tu red en el núcleo (D40).

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "aviso_red",
        sa.Column("message_id", sa.String(998), primary_key=True),
        sa.Column("indice", sa.Integer, primary_key=True),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("perfil_url", sa.String(500), nullable=False),
        sa.Column("titular", sa.String(300)),
        sa.Column("empresa", sa.String(200)),
        sa.Column("recibido_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("enviado", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("contacto_id", sa.String(36)),
        sa.Column("postulacion_id", sa.String(36)),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
        schema="ia",
    )


def downgrade() -> None:
    op.drop_table("aviso_red", schema="ia")
