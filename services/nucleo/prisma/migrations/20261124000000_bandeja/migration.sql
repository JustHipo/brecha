-- CreateTable
CREATE TABLE "senal_pendiente" (
    "id" UUID NOT NULL,
    "fuente" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "estado_sugerido" TEXT,
    "confianza" DECIMAL(4,3) NOT NULL,
    "referencia_externa" TEXT,
    "recibida_en" TIMESTAMPTZ(3) NOT NULL,
    "remitente" TEXT,
    "asunto" TEXT,
    "empresa_detectada" TEXT,
    "cargo_detectado" TEXT,
    "estado" TEXT NOT NULL,
    "postulacion_id" UUID,
    "resuelta_en" TIMESTAMPTZ(3),
    "creada_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "senal_pendiente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "senal_pendiente_referencia_externa_key" ON "senal_pendiente"("referencia_externa");

-- CreateIndex
CREATE INDEX "senal_pendiente_estado_recibida_en_idx" ON "senal_pendiente"("estado", "recibida_en");

