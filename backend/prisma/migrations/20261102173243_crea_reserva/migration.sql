-- Tabla de reservas del Sprint 1 (#120, TR-05 #86). Generado por Prisma; los CHECK del final
-- se añadieron a mano (Prisma no los declara en el esquema).
-- Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 02/11/2026

-- CreateEnum
CREATE TYPE "estado_reserva" AS ENUM ('pendiente', 'aceptada', 'rechazada', 'cancelada', 'pagada', 'en_curso', 'finalizada');

-- CreateEnum
CREATE TYPE "modo_entrega" AS ENUM ('domicilio', 'rider', 'punto_recogida');

-- CreateTable
CREATE TABLE "reserva" (
    "id" UUID NOT NULL,
    "objeto_id" UUID NOT NULL,
    "arrendatario_id" UUID NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "precio_total" DECIMAL(10,2) NOT NULL,
    "modo_entrega" "modo_entrega",
    "estado" "estado_reserva" NOT NULL DEFAULT 'pendiente',
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reserva_objeto_id_estado_idx" ON "reserva"("objeto_id", "estado");

-- CreateIndex
CREATE INDEX "reserva_arrendatario_id_idx" ON "reserva"("arrendatario_id");

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_objeto_id_fkey" FOREIGN KEY ("objeto_id") REFERENCES "objeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_arrendatario_id_fkey" FOREIGN KEY ("arrendatario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que no se pueden declarar en schema.prisma: el backend las valida igualmente,
-- pero la BD no acepta datos imposibles aunque falle una validación.
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_fechas_en_orden" CHECK ("fecha_fin" >= "fecha_inicio");
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_precio_total_positivo" CHECK ("precio_total" > 0);
