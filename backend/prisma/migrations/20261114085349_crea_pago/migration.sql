-- Pagos y fianzas con el flujo de #72 (US-07.01, T9 #284): el importe se bloquea al solicitar, se
-- cobra al aceptar y se libera si se rechaza, se cancela o caduca (reserva «caducada», caduca_en).
-- Generado por Prisma; los CHECK del final se añadieron a mano (Prisma no los declara en el esquema).
-- Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 14/11/2026

-- CreateEnum
CREATE TYPE "estado_pago" AS ENUM ('autorizado', 'pagado', 'liberado', 'reembolsado');

-- CreateEnum
CREATE TYPE "estado_fianza" AS ENUM ('pendiente', 'retenida', 'liberada', 'ejecutada', 'cobrada', 'devuelta');

-- AlterEnum
ALTER TYPE "estado_reserva" ADD VALUE 'caducada';

-- AlterTable
ALTER TABLE "reserva" ADD COLUMN     "caduca_en" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "pago" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "importe_alquiler" DECIMAL(10,2) NOT NULL,
    "importe_entrega" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "importe_fianza" DECIMAL(10,2) NOT NULL,
    "estado" "estado_pago" NOT NULL DEFAULT 'autorizado',
    "estado_fianza" "estado_fianza",
    "referencia_alquiler" TEXT,
    "referencia_fianza" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pago_reserva_id_key" ON "pago"("reserva_id");

-- CreateIndex
CREATE UNIQUE INDEX "pago_referencia_alquiler_key" ON "pago"("referencia_alquiler");

-- CreateIndex
CREATE UNIQUE INDEX "pago_referencia_fianza_key" ON "pago"("referencia_fianza");

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que no se pueden declarar en schema.prisma: el backend las valida igualmente,
-- pero la BD no acepta datos imposibles aunque falle una validación.
ALTER TABLE "pago" ADD CONSTRAINT "pago_importes_validos"
  CHECK ("importe_alquiler" > 0 AND "importe_entrega" >= 0 AND "importe_fianza" >= 0);

-- Sin fianza (menos de 0,50 €, el mínimo que Stripe puede retener) no hay estado de fianza; con
-- fianza, siempre lo hay.
ALTER TABLE "pago" ADD CONSTRAINT "pago_fianza_con_estado"
  CHECK (("importe_fianza" >= 0.50) = ("estado_fianza" IS NOT NULL));
