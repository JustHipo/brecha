"""Avisos con análisis, calce y embedding (pgvector con HNSW), y el perfil (F2-09 a F2-11).

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "aviso",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("url_clave", sa.String(2000), nullable=False, unique=True),
        sa.Column("titulo", sa.String(300), nullable=False),
        sa.Column("empresa", sa.String(200), nullable=False),
        sa.Column("plataforma", sa.String(30), nullable=False),
        sa.Column("modalidad", sa.String(20), nullable=False),
        sa.Column("origen", sa.String(20), nullable=False),
        sa.Column("texto", sa.Text, nullable=False),
        sa.Column("ubicacion", sa.String(200)),
        sa.Column("stack", JSONB, nullable=False, server_default="[]"),
        sa.Column("sueldo", sa.String(200)),
        sa.Column("usd_mes", sa.Integer),
        sa.Column("publicado_en", sa.Date),
        sa.Column("cierre", sa.Date),
        sa.Column("cita", sa.String(300)),
        sa.Column("requisitos", JSONB),
        sa.Column("calce", sa.Integer),
        sa.Column("brechas", JSONB),
        sa.Column("cumple", JSONB),
        sa.Column("analizado_con", sa.String(100)),
        sa.Column("postulacion_id", sa.String(36)),
        sa.Column("vinculo_enviado", sa.String(60)),
        sa.Column("embedding", Vector(1536)),
        sa.Column("embedding_modelo", sa.String(100)),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), nullable=False),
        schema="ia",
    )
    op.execute("CREATE INDEX aviso_embedding_hnsw ON ia.aviso USING hnsw (embedding vector_cosine_ops)")
    op.create_table(
        "perfil",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("herramientas", JSONB, nullable=False),
        sa.Column("anos_totales", sa.Float, nullable=False, server_default="0"),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), nullable=False),
        schema="ia",
    )


def downgrade() -> None:
    op.drop_table("perfil", schema="ia")
    op.drop_table("aviso", schema="ia")
