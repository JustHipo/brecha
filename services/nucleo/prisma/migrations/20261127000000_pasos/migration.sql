-- Pasos pendientes (docs/diseno/pasos.md §4.4): lo que una o más postulaciones te piden hacer, la señal
-- única por postulación (un correo puede tocar varias) y la bandeja con candidatas y paso propuesto.
-- DropIndex
DROP INDEX "senal_referencia_externa_key";

-- AlterTable
ALTER TABLE "senal_pendiente" ADD COLUMN     "candidatas" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "paso_propuesto" JSONB;

-- CreateTable
CREATE TABLE "paso" (
    "id" UUID NOT NULL,
    "descripcion" TEXT NOT NULL,
    "detalle" TEXT,
    "plazo" DATE,
    "enlace" TEXT,
    "estado" TEXT NOT NULL,
    "fuente" TEXT NOT NULL,
    "registrado_por" TEXT NOT NULL,
    "contacto_red_id" UUID,
    "referencia_externa" TEXT,
    "cerrado_por" TEXT,
    "cerrado_en" TIMESTAMPTZ(3),
    "nota_cierre" TEXT,
    "referencia_cierre" TEXT,
    "sugerencia_cierre" JSONB,
    "pedido_en" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "paso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paso_postulacion" (
    "paso_id" UUID NOT NULL,
    "postulacion_id" UUID NOT NULL,

    CONSTRAINT "paso_postulacion_pkey" PRIMARY KEY ("paso_id","postulacion_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paso_referencia_externa_key" ON "paso"("referencia_externa");

-- CreateIndex
CREATE INDEX "paso_estado_idx" ON "paso"("estado");

-- CreateIndex
CREATE INDEX "paso_postulacion_postulacion_id_idx" ON "paso_postulacion"("postulacion_id");

-- CreateIndex
CREATE INDEX "senal_referencia_externa_idx" ON "senal"("referencia_externa");

-- CreateIndex
CREATE UNIQUE INDEX "senal_postulacion_id_referencia_externa_key" ON "senal"("postulacion_id", "referencia_externa");

-- AddForeignKey
ALTER TABLE "paso_postulacion" ADD CONSTRAINT "paso_postulacion_paso_id_fkey" FOREIGN KEY ("paso_id") REFERENCES "paso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paso_postulacion" ADD CONSTRAINT "paso_postulacion_postulacion_id_fkey" FOREIGN KEY ("postulacion_id") REFERENCES "postulacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

