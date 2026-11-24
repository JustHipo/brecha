-- Importar y exportar CSV (docs/diseno/csv.md §4.2): foto del aviso con stack, requisitos y sueldo publicado,
-- etiquetas normalizadas con índice GIN y prioridad fijada a mano. Las filas existentes quedan con listas vacías.
ALTER TABLE "postulacion" ADD COLUMN     "aviso_requisitos" TEXT,
ADD COLUMN     "aviso_stack" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "aviso_sueldo_publicado" TEXT,
ADD COLUMN     "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "prioridad_fijada" TEXT;

-- CreateIndex
CREATE INDEX "postulacion_etiquetas_idx" ON "postulacion" USING GIN ("etiquetas");

