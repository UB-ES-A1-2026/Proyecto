-- Retirada de objetos por un admin y motivo de cancelación de reservas (US-11.03, #317). Generado
-- por Prisma; el CHECK del final se añadió a mano (Prisma no lo declara en el esquema).
-- Generado con asistencia de IA (Claude) – revisado por Alex Matos, 13/11/2026

-- CreateEnum
CREATE TYPE "motivo_cancelacion" AS ENUM ('objeto_retirado');

-- CreateEnum
CREATE TYPE "motivo_retirada" AS ENUM ('posible_estafa', 'prohibido', 'enganoso', 'otro');

-- AlterTable
ALTER TABLE "reserva" ADD COLUMN     "motivo_cancelacion" "motivo_cancelacion";

-- CreateTable
CREATE TABLE "retirada_objeto" (
    "id" UUID NOT NULL,
    "objeto_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "motivo" "motivo_retirada" NOT NULL,
    "detalles" VARCHAR(500),
    "retirado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retirada_objeto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retirada_objeto_objeto_id_key" ON "retirada_objeto"("objeto_id");

-- AddForeignKey
ALTER TABLE "retirada_objeto" ADD CONSTRAINT "retirada_objeto_objeto_id_fkey" FOREIGN KEY ("objeto_id") REFERENCES "objeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retirada_objeto" ADD CONSTRAINT "retirada_objeto_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Con motivo «otro», los detalles son obligatorios y no pueden estar en blanco.
ALTER TABLE "retirada_objeto" ADD CONSTRAINT "retirada_objeto_otro_con_detalles" CHECK (
  "motivo" <> 'otro' OR ("detalles" IS NOT NULL AND length(trim("detalles")) > 0)
);
