-- Revisión de las solicitudes de rider por un admin (US-11.03, #317). Generado por Prisma; el
-- relleno y los CHECK del final se añadieron a mano (Prisma no los declara en el esquema).
-- Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026

-- AlterTable
ALTER TABLE "solicitud_rider" ADD COLUMN     "motivo_rechazo" VARCHAR(500),
ADD COLUMN     "revisada_en" TIMESTAMP(3),
ADD COLUMN     "revisada_por_id" UUID;

-- CreateIndex
CREATE INDEX "solicitud_rider_estado_creada_en_idx" ON "solicitud_rider"("estado", "creada_en");

-- AddForeignKey
ALTER TABLE "solicitud_rider" ADD CONSTRAINT "solicitud_rider_revisada_por_id_fkey" FOREIGN KEY ("revisada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Las solicitudes ya resueltas antes de esta migración (datos de ejemplo) no tienen revisor: se
-- les da como fecha de revisión la de creación para que cumplan la regla de abajo.
UPDATE "solicitud_rider" SET "revisada_en" = "creada_en" WHERE "estado" <> 'pendiente';

-- Pendiente <=> sin fecha ni revisor de revisión; resuelta => con fecha. El revisor puede faltar
-- solo en las resueltas anteriores a esta migración. El motivo solo existe si está rechazada.
ALTER TABLE "solicitud_rider" ADD CONSTRAINT "solicitud_rider_revision_coherente" CHECK (
  ("estado" = 'pendiente' AND "revisada_en" IS NULL AND "revisada_por_id" IS NULL)
  OR ("estado" <> 'pendiente' AND "revisada_en" IS NOT NULL)
);
ALTER TABLE "solicitud_rider" ADD CONSTRAINT "solicitud_rider_motivo_solo_rechazada" CHECK (
  "motivo_rechazo" IS NULL OR "estado" = 'rechazada'
);
