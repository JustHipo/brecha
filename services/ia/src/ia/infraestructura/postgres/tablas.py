"""Tablas del esquema `ia` con SQLAlchemy Core. Las crea Alembic (alembic/versions)."""

from sqlalchemy import BigInteger, Column, DateTime, Integer, MetaData, String, Table, Text

metadata = MetaData(schema="ia")

correo = Table(
    "correo",
    metadata,
    Column("message_id", String(998), primary_key=True),
    Column("uid", BigInteger, nullable=False),
    Column("remitente", String(320), nullable=False),
    Column("recibido_en", DateTime(timezone=True), nullable=False),
    Column("estado", String(20), nullable=False),
    Column("plataforma", String(30)),
    Column("motivo", String(200), nullable=False),
    Column("asunto", String(500)),
    Column("fragmento", Text),
    Column("intentos", Integer, nullable=False, server_default="0"),
    Column("creado_en", DateTime(timezone=True), nullable=False),
)

estado_vigia = Table(
    "estado_vigia",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("uidvalidity", BigInteger),
    Column("ultimo_uid", BigInteger),
    Column("ultima_revision", DateTime(timezone=True)),
    Column("ultimo_error", Text),
)
