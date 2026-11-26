-- Tu red de LinkedIn (contactos, solicitudes y conversaciones).
CREATE TABLE "contacto_red" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "perfil_url" TEXT NOT NULL,
    "titular" TEXT,
    "empresa" TEXT,
    "conexion" TEXT NOT NULL,
    "interacciones" JSONB NOT NULL,
    "postulacion_ids" UUID[],
    "seguimiento" TEXT,
    "notas" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contacto_red_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contacto_red_perfil_url_key" ON "contacto_red"("perfil_url");
