-- Cancelación de reservas con penalización (US-04.05, T28 #308): una fila por reserva cancelada, con
-- quién la canceló, cuándo y la penalización y el reembolso que se aplicaron. En una tabla aparte, no
-- en columnas de `reserva`, para no chocar con las historias que también la modifican.
-- Generado por Prisma; los CHECK del final se añadieron a mano (Prisma no los declara en el esquema).
-- Generado con asistencia de IA (Claude) – revisado por Alex Matos, 17/11/2026

-- CreateTable
CREATE TABLE "cancelacion" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "cancelada_por" UUID NOT NULL,
    "cancelada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "porcentaje" INTEGER NOT NULL,
    "penalizacion" DECIMAL(10,2) NOT NULL,
    "reembolso" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "cancelacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cancelacion_reserva_id_key" ON "cancelacion"("reserva_id");

-- CreateIndex
CREATE INDEX "cancelacion_cancelada_por_idx" ON "cancelacion"("cancelada_por");

-- AddForeignKey
ALTER TABLE "cancelacion" ADD CONSTRAINT "cancelacion_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancelacion" ADD CONSTRAINT "cancelacion_cancelada_por_fkey" FOREIGN KEY ("cancelada_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que no se pueden declarar en schema.prisma: el backend las valida igualmente, pero la BD
-- no acepta datos imposibles aunque falle una validación. La penalización solo puede ser del 0 %,
-- el 35 % o el 100 % del alquiler (tabla de #64).
ALTER TABLE "cancelacion" ADD CONSTRAINT "cancelacion_importes_validos"
  CHECK ("porcentaje" IN (0, 35, 100) AND "penalizacion" >= 0 AND "reembolso" >= 0);
