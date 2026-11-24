-- Contactos de la red sin perfil de LinkedIn (decisión de Juan del 24-nov-2026, docs/diseno/csv.md): se reconocen por nombre y empresa.
-- AlterTable
ALTER TABLE "contacto_red" ALTER COLUMN "perfil_url" DROP NOT NULL;

