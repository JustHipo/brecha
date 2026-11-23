-- CreateTable
CREATE TABLE "postulacion" (
    "id" UUID NOT NULL,
    "aviso_titulo" TEXT NOT NULL,
    "aviso_empresa" TEXT NOT NULL,
    "aviso_url" TEXT NOT NULL,
    "aviso_plataforma" TEXT NOT NULL,
    "aviso_modalidad" TEXT NOT NULL,
    "aviso_ubicacion" TEXT NOT NULL,
    "aviso_cierre" DATE,
    "aviso_id_mercado" TEXT,
    "aviso_calce" DECIMAL(4,3),
    "estado" TEXT NOT NULL,
    "canal_tipo" TEXT,
    "canal_valor" TEXT,
    "fecha_postulacion" DATE,
    "sueldo_monto" DECIMAL(14,2),
    "sueldo_moneda" TEXT,
    "sueldo_periodo" TEXT,
    "sueldo_base" TEXT,
    "aviso_url_activa" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creada_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "postulacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambio_estado" (
    "id" UUID NOT NULL,
    "postulacion_id" UUID NOT NULL,
    "de" TEXT,
    "a" TEXT NOT NULL,
    "motivo" TEXT,
    "origen" TEXT NOT NULL,
    "ocurrido_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cambio_estado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "senal" (
    "id" UUID NOT NULL,
    "postulacion_id" UUID,
    "fuente" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "estado_sugerido" TEXT,
    "confianza" DECIMAL(4,3) NOT NULL,
    "referencia_externa" TEXT,
    "recibida_en" TIMESTAMPTZ(3) NOT NULL,
    "aplicada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "senal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discrepancia" (
    "id" UUID NOT NULL,
    "postulacion_id" UUID NOT NULL,
    "cambio_estado_id" UUID NOT NULL,
    "senal_id" UUID,
    "regla" TEXT NOT NULL,
    "severidad" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "detectada_en" TIMESTAMPTZ(3) NOT NULL,
    "resuelta_en" TIMESTAMPTZ(3),

    CONSTRAINT "discrepancia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entrevista" (
    "id" UUID NOT NULL,
    "postulacion_id" UUID NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "con" TEXT,
    "resultado" TEXT NOT NULL,

    CONSTRAINT "entrevista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacto" (
    "id" UUID NOT NULL,
    "postulacion_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" TEXT,
    "email" TEXT,
    "linkedin" TEXT,

    CONSTRAINT "contacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota" (
    "id" UUID NOT NULL,
    "postulacion_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "nota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acceso" (
    "id" INTEGER NOT NULL,
    "clave_hash" TEXT,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "acceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajuste" (
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,

    CONSTRAINT "ajuste_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "prioridad" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "correlacion_id" TEXT,
    "ocurrido_en" TIMESTAMPTZ(3) NOT NULL,
    "publicado_en" TIMESTAMPTZ(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "postulacion_aviso_url_activa_key" ON "postulacion"("aviso_url_activa");

-- CreateIndex
CREATE INDEX "postulacion_estado_idx" ON "postulacion"("estado");

-- CreateIndex
CREATE INDEX "postulacion_actualizada_en_idx" ON "postulacion"("actualizada_en");

-- CreateIndex
CREATE INDEX "cambio_estado_postulacion_id_ocurrido_en_idx" ON "cambio_estado"("postulacion_id", "ocurrido_en");

-- CreateIndex
CREATE UNIQUE INDEX "senal_referencia_externa_key" ON "senal"("referencia_externa");

-- CreateIndex
CREATE INDEX "senal_postulacion_id_recibida_en_idx" ON "senal"("postulacion_id", "recibida_en");

-- CreateIndex
CREATE INDEX "discrepancia_postulacion_id_estado_idx" ON "discrepancia"("postulacion_id", "estado");

-- CreateIndex
CREATE INDEX "entrevista_postulacion_id_idx" ON "entrevista"("postulacion_id");

-- CreateIndex
CREATE INDEX "contacto_postulacion_id_idx" ON "contacto"("postulacion_id");

-- CreateIndex
CREATE INDEX "nota_postulacion_id_creada_en_idx" ON "nota"("postulacion_id", "creada_en");

-- CreateIndex
CREATE INDEX "outbox_publicado_en_ocurrido_en_idx" ON "outbox"("publicado_en", "ocurrido_en");

-- AddForeignKey
ALTER TABLE "cambio_estado" ADD CONSTRAINT "cambio_estado_postulacion_id_fkey" FOREIGN KEY ("postulacion_id") REFERENCES "postulacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "senal" ADD CONSTRAINT "senal_postulacion_id_fkey" FOREIGN KEY ("postulacion_id") REFERENCES "postulacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discrepancia" ADD CONSTRAINT "discrepancia_postulacion_id_fkey" FOREIGN KEY ("postulacion_id") REFERENCES "postulacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrevista" ADD CONSTRAINT "entrevista_postulacion_id_fkey" FOREIGN KEY ("postulacion_id") REFERENCES "postulacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacto" ADD CONSTRAINT "contacto_postulacion_id_fkey" FOREIGN KEY ("postulacion_id") REFERENCES "postulacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota" ADD CONSTRAINT "nota_postulacion_id_fkey" FOREIGN KEY ("postulacion_id") REFERENCES "postulacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

