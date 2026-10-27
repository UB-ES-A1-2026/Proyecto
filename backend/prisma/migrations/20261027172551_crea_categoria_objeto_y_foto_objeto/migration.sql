-- Tablas de objetos del Sprint 1 (#9, TR-05 #86). Generado por Prisma; los CHECK y las categorías
-- del final se añadieron a mano (Prisma no los declara en el esquema).
-- Generado con asistencia de IA (Claude) – revisado por Kai Oliveros, 27/10/2026

-- CreateEnum
CREATE TYPE "estado_objeto" AS ENUM ('publicado', 'pausado', 'retirado');

-- CreateTable
CREATE TABLE "categoria" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objeto" (
    "id" UUID NOT NULL,
    "propietario_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,
    "titulo" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(2000) NOT NULL,
    "precio_dia" DECIMAL(10,2) NOT NULL,
    "fianza" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "barrio" VARCHAR(100) NOT NULL,
    "latitud" DECIMAL(9,6),
    "longitud" DECIMAL(9,6),
    "entrega_domicilio" BOOLEAN NOT NULL DEFAULT false,
    "entrega_rider" BOOLEAN NOT NULL DEFAULT false,
    "entrega_punto_recogida" BOOLEAN NOT NULL DEFAULT false,
    "estado" "estado_objeto" NOT NULL DEFAULT 'publicado',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "objeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foto_objeto" (
    "id" UUID NOT NULL,
    "objeto_id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "foto_objeto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categoria_nombre_key" ON "categoria"("nombre");

-- CreateIndex
CREATE INDEX "objeto_propietario_id_idx" ON "objeto"("propietario_id");

-- CreateIndex
CREATE INDEX "objeto_categoria_id_idx" ON "objeto"("categoria_id");

-- CreateIndex
CREATE INDEX "objeto_estado_idx" ON "objeto"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "foto_objeto_clave_key" ON "foto_objeto"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "foto_objeto_objeto_id_orden_key" ON "foto_objeto"("objeto_id", "orden");

-- AddForeignKey
ALTER TABLE "objeto" ADD CONSTRAINT "objeto_propietario_id_fkey" FOREIGN KEY ("propietario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objeto" ADD CONSTRAINT "objeto_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foto_objeto" ADD CONSTRAINT "foto_objeto_objeto_id_fkey" FOREIGN KEY ("objeto_id") REFERENCES "objeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reglas que no se pueden declarar en schema.prisma: el backend las valida igualmente,
-- pero la BD no acepta datos imposibles aunque falle una validación.
ALTER TABLE "objeto" ADD CONSTRAINT "objeto_precio_dia_positivo" CHECK ("precio_dia" > 0);
ALTER TABLE "objeto" ADD CONSTRAINT "objeto_fianza_no_negativa" CHECK ("fianza" >= 0);
-- Como mucho 5 fotos por objeto (ADR 0002): el orden va de 1 a 5 y es único por objeto.
ALTER TABLE "foto_objeto" ADD CONSTRAINT "foto_objeto_orden_entre_1_y_5" CHECK ("orden" BETWEEN 1 AND 5);

-- Categorías iniciales. Van en la migración y no en el seed para que también existan en
-- producción, donde solo se ejecutan las migraciones (docs/despliegue.md). Para añadir o
-- cambiar categorías: una migración nueva, nunca editando esta.
INSERT INTO "categoria" ("id", "nombre") VALUES
    (gen_random_uuid(), 'Herramientas y bricolaje'),
    (gen_random_uuid(), 'Electrónica'),
    (gen_random_uuid(), 'Deporte'),
    (gen_random_uuid(), 'Camping y viajes'),
    (gen_random_uuid(), 'Hogar y jardín'),
    (gen_random_uuid(), 'Fiestas y eventos'),
    (gen_random_uuid(), 'Infantil'),
    (gen_random_uuid(), 'Otros');
