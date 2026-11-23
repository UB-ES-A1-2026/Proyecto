-- Valoraciones (US-08.01, #295). Generado por Prisma; los CHECK del final están añadidos a mano
-- porque Prisma no los declara en el esquema.
-- CreateEnum
CREATE TYPE "tipo_valoracion" AS ENUM ('alquiler', 'usuario');

-- CreateTable
CREATE TABLE "valoracion" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "autor_id" UUID NOT NULL,
    "valorado_id" UUID NOT NULL,
    "tipo" "tipo_valoracion" NOT NULL,
    "puntuacion" SMALLINT NOT NULL,
    "comentario" VARCHAR(1000),
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valoracion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "valoracion_valorado_id_idx" ON "valoracion"("valorado_id");

-- CreateIndex
CREATE UNIQUE INDEX "valoracion_reserva_id_autor_id_key" ON "valoracion"("reserva_id", "autor_id");

-- AddForeignKey
ALTER TABLE "valoracion" ADD CONSTRAINT "valoracion_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valoracion" ADD CONSTRAINT "valoracion_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valoracion" ADD CONSTRAINT "valoracion_valorado_id_fkey" FOREIGN KEY ("valorado_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK añadidos a mano.
ALTER TABLE "valoracion" ADD CONSTRAINT "valoracion_puntuacion_valida" CHECK ("puntuacion" BETWEEN 1 AND 5);
ALTER TABLE "valoracion" ADD CONSTRAINT "valoracion_autor_no_es_valorado" CHECK ("autor_id" <> "valorado_id");
