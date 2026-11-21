-- Seguimiento de la entrega (US-05.02, #288). Generado por Prisma; los CHECK del final están
-- añadidos a mano porque Prisma no los declara en el esquema.
-- CreateEnum
CREATE TYPE "estado_entrega" AS ENUM ('pendiente', 'asignada', 'recogida', 'en_camino', 'entregada');

-- AlterTable
ALTER TABLE "entrega" ADD COLUMN     "asignada_en" TIMESTAMP(3),
ADD COLUMN     "codigo_entrega" CHAR(6),
ADD COLUMN     "devuelta_en" TIMESTAMP(3),
ADD COLUMN     "en_camino_en" TIMESTAMP(3),
ADD COLUMN     "entregada_en" TIMESTAMP(3),
ADD COLUMN     "estado" "estado_entrega" NOT NULL DEFAULT 'pendiente',
ADD COLUMN     "intentos_codigo" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "recogida_en" TIMESTAMP(3),
ADD COLUMN     "rider_id" UUID;

-- CreateIndex
CREATE INDEX "entrega_rider_id_idx" ON "entrega"("rider_id");

-- AddForeignKey
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK añadidos a mano.
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_codigo_seis_cifras" CHECK ("codigo_entrega" ~ '^[0-9]{6}$');
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_intentos_validos" CHECK ("intentos_codigo" BETWEEN 0 AND 5);
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_entregada_con_hora" CHECK (("estado" = 'entregada') = ("entregada_en" IS NOT NULL));
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_devuelta_tras_entregar" CHECK ("devuelta_en" IS NULL OR "estado" = 'entregada');
