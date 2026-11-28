-- Incidencias de un alquiler (US-09.01, #76, tarea #456). Mismo SQL que genera Prisma para el
-- modelo Incident; el CHECK del final se añadió a mano (Prisma no lo declara en el esquema).
-- Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 28/11/2026

-- CreateEnum
CREATE TYPE "tipo_incidencia" AS ENUM ('danio', 'retraso_devolucion', 'no_devolucion');

-- CreateEnum
CREATE TYPE "estado_incidencia" AS ENUM ('abierta', 'resuelta');

-- CreateTable
CREATE TABLE "incidencia" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "abierta_por" UUID NOT NULL,
    "tipo" "tipo_incidencia" NOT NULL,
    "descripcion" VARCHAR(2000) NOT NULL,
    "estado" "estado_incidencia" NOT NULL DEFAULT 'abierta',
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incidencia_reserva_id_key" ON "incidencia"("reserva_id");

-- CreateIndex
CREATE INDEX "incidencia_abierta_por_idx" ON "incidencia"("abierta_por");

-- CreateIndex
CREATE INDEX "incidencia_estado_idx" ON "incidencia"("estado");

-- AddForeignKey
ALTER TABLE "incidencia" ADD CONSTRAINT "incidencia_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidencia" ADD CONSTRAINT "incidencia_abierta_por_fkey" FOREIGN KEY ("abierta_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- La descripción no puede estar en blanco.
ALTER TABLE "incidencia" ADD CONSTRAINT "incidencia_descripcion_no_vacia" CHECK (length(trim("descripcion")) > 0);
