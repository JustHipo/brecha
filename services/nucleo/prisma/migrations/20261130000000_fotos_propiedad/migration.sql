-- Fotos de las propiedades (docs/diseno/fotos-propiedades.md): el archivo queda en <instancia>/fotos y aquí solo su nombre.
-- CreateTable
CREATE TABLE "foto_propiedad" (
    "id" UUID NOT NULL,
    "propiedad_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "archivo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "url_origen" TEXT,
    "nombre_origen" TEXT,
    "creada_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "foto_propiedad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "foto_propiedad_propiedad_id_orden_idx" ON "foto_propiedad"("propiedad_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "foto_propiedad_propiedad_id_sha256_key" ON "foto_propiedad"("propiedad_id", "sha256");

-- AddForeignKey
ALTER TABLE "foto_propiedad" ADD CONSTRAINT "foto_propiedad_propiedad_id_fkey" FOREIGN KEY ("propiedad_id") REFERENCES "propiedad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

