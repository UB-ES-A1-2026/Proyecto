-- Fotos del estado del objeto (US-09.02, #77, tarea #454). Mismo SQL que genera Prisma para el
-- modelo StatePhoto; el CHECK del final se añadió a mano (Prisma no los declara en el esquema).
-- Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 27/11/2026

-- CreateEnum
CREATE TYPE "fase_foto_estado" AS ENUM ('entrega', 'devolucion');

-- CreateTable
CREATE TABLE "foto_estado" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "subida_por" UUID NOT NULL,
    "fase" "fase_foto_estado" NOT NULL,
    "clave" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmada_en" TIMESTAMP(3),

    CONSTRAINT "foto_estado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "foto_estado_clave_key" ON "foto_estado"("clave");

-- CreateIndex
CREATE INDEX "foto_estado_subida_por_idx" ON "foto_estado"("subida_por");

-- CreateIndex
CREATE UNIQUE INDEX "foto_estado_reserva_id_fase_orden_key" ON "foto_estado"("reserva_id", "fase", "orden");

-- AddForeignKey
ALTER TABLE "foto_estado" ADD CONSTRAINT "foto_estado_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foto_estado" ADD CONSTRAINT "foto_estado_subida_por_fkey" FOREIGN KEY ("subida_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Como mucho 5 fotos por fase, como las de los objetos.
ALTER TABLE "foto_estado" ADD CONSTRAINT "foto_estado_orden_entre_1_y_5" CHECK ("orden" BETWEEN 1 AND 5);
