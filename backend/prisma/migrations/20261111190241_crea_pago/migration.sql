-- Tabla de pagos y fianzas (US-07.01 #72, T9 #284). Generado por Prisma; los CHECK del final
-- se añadieron a mano (Prisma no los declara en el esquema).
-- Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 11/11/2026

-- CreateEnum
CREATE TYPE "estado_pago" AS ENUM ('pendiente', 'pagado', 'rechazado', 'reembolsado');

-- CreateEnum
CREATE TYPE "estado_fianza" AS ENUM ('retenida', 'liberada', 'ejecutada');

-- CreateTable
CREATE TABLE "pago" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "importe_alquiler" DECIMAL(10,2) NOT NULL,
    "importe_entrega" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "importe_fianza" DECIMAL(10,2) NOT NULL,
    "estado" "estado_pago" NOT NULL DEFAULT 'pendiente',
    "estado_fianza" "estado_fianza" NOT NULL DEFAULT 'retenida',
    "referencia_pasarela" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pago_reserva_id_key" ON "pago"("reserva_id");

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que no se pueden declarar en schema.prisma: el backend las valida igualmente,
-- pero la BD no acepta datos imposibles aunque falle una validación.
ALTER TABLE "pago" ADD CONSTRAINT "pago_importes_no_negativos"
  CHECK ("importe_alquiler" >= 0 AND "importe_entrega" >= 0 AND "importe_fianza" >= 0);
