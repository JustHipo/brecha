-- CreateTable
CREATE TABLE "propiedad" (
    "id" UUID NOT NULL,
    "estado" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "comuna" TEXT,
    "urls" TEXT[],
    "datos" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creada_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "propiedad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canal_arriendo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dominios" TEXT[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "predefinido" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "canal_arriendo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "busqueda_arriendo" (
    "id" INTEGER NOT NULL,
    "datos" JSONB NOT NULL,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "busqueda_arriendo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "senal_arriendo_pendiente" (
    "id" UUID NOT NULL,
    "estado" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "referencia_externa" TEXT,
    "recibida_en" TIMESTAMPTZ(3) NOT NULL,
    "propiedad_id" UUID,
    "creada_en" TIMESTAMPTZ(3) NOT NULL,
    "resuelta_en" TIMESTAMPTZ(3),

    CONSTRAINT "senal_arriendo_pendiente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geocodificacion" (
    "consulta" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "creada_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "geocodificacion_pkey" PRIMARY KEY ("consulta")
);

-- CreateIndex
CREATE INDEX "propiedad_estado_idx" ON "propiedad"("estado");

-- CreateIndex
CREATE INDEX "propiedad_urls_idx" ON "propiedad" USING GIN ("urls");

-- CreateIndex
CREATE UNIQUE INDEX "senal_arriendo_pendiente_referencia_externa_key" ON "senal_arriendo_pendiente"("referencia_externa");

-- CreateIndex
CREATE INDEX "senal_arriendo_pendiente_estado_recibida_en_idx" ON "senal_arriendo_pendiente"("estado", "recibida_en");

