-- Perfil de búsqueda de Empleo (docs/diseno/perfil.md §3.3): una sola fila con reglas, datos e historial.
-- CreateTable
CREATE TABLE "perfil_empleo" (
    "id" INTEGER NOT NULL,
    "datos" JSONB NOT NULL,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "perfil_empleo_pkey" PRIMARY KEY ("id")
);
