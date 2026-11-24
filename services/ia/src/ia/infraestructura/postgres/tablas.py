"""Tablas del esquema `ia` con SQLAlchemy Core. Las crea Alembic (alembic/versions)."""

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB

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
    Column("ultimo_error_ia", Text),
)

clasificacion = Table(
    "clasificacion",
    metadata,
    Column("message_id", String(998), ForeignKey("ia.correo.message_id"), primary_key=True),
    Column("resultado", JSONB, nullable=False),
    Column("modelo", String(100), nullable=False),
    Column("confianza", Float, nullable=False),
    Column("postulacion_id", String(36)),
    Column("enviada_al_nucleo", Boolean, nullable=False, server_default="false"),
    Column("creada_en", DateTime(timezone=True), nullable=False),
)

traza = Table(
    "traza",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("caso", String(50), nullable=False),
    Column("modelo", String(100), nullable=False),
    Column("tokens_entrada", Integer, nullable=False),
    Column("tokens_salida", Integer, nullable=False),
    Column("costo_usd", Numeric(12, 6), nullable=False),
    Column("duracion_ms", Integer, nullable=False),
    Column("resultado", String(30), nullable=False),
    Column("creada_en", DateTime(timezone=True), nullable=False),
)

aviso = Table(
    "aviso",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("url", String(2000), nullable=False),
    Column("url_clave", String(2000), nullable=False, unique=True),
    Column("titulo", String(300), nullable=False),
    Column("empresa", String(200), nullable=False),
    Column("plataforma", String(30), nullable=False),
    Column("modalidad", String(20), nullable=False),
    Column("origen", String(20), nullable=False),
    Column("texto", Text, nullable=False),
    Column("ubicacion", String(200)),
    Column("stack", JSONB, nullable=False),
    Column("sueldo", String(200)),
    Column("usd_mes", Integer),
    Column("publicado_en", Date),
    Column("cierre", Date),
    Column("cita", String(300)),
    Column("requisitos", JSONB),
    Column("calce", Integer),
    Column("brechas", JSONB),
    Column("cumple", JSONB),
    Column("analizado_con", String(100)),
    Column("postulacion_id", String(36)),
    Column("vinculo_enviado", String(60)),
    Column("embedding", Vector(1536)),
    Column("embedding_modelo", String(100)),
    Column("creado_en", DateTime(timezone=True), nullable=False),
    Column("actualizado_en", DateTime(timezone=True), nullable=False),
)

perfil = Table(
    "perfil",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("herramientas", JSONB, nullable=False),
    Column("anos_totales", Float, nullable=False),
    Column("actualizado_en", DateTime(timezone=True), nullable=False),
)

aviso_red = Table(
    "aviso_red",
    metadata,
    Column("message_id", String(998), primary_key=True),
    Column("indice", Integer, primary_key=True),
    Column("tipo", String(30), nullable=False),
    Column("nombre", String(200), nullable=False),
    Column("perfil_url", String(500), nullable=False),
    Column("titular", String(300)),
    Column("empresa", String(200)),
    Column("recibido_en", DateTime(timezone=True), nullable=False),
    Column("enviado", Boolean, nullable=False, server_default="false"),
    Column("contacto_id", String(36)),
    Column("postulacion_id", String(36)),
    Column("creado_en", DateTime(timezone=True), nullable=False),
)
