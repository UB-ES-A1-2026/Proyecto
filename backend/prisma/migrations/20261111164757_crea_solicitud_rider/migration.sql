-- Solicitudes para ser rider del Sprint 2 (#314, US-10.03). Generado por Prisma; los CHECK del
-- final se añadieron a mano (Prisma no los declara en el esquema).
-- Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026

-- CreateEnum
CREATE TYPE "vehiculo_rider" AS ENUM ('a_pie', 'bici', 'patinete', 'moto', 'coche');

-- CreateEnum
CREATE TYPE "estado_solicitud_rider" AS ENUM ('pendiente', 'aceptada', 'rechazada');

-- CreateEnum
CREATE TYPE "dia_semana" AS ENUM ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo');

-- CreateEnum
CREATE TYPE "franja_rider" AS ENUM ('manana', 'tarde', 'noche');

-- CreateTable
CREATE TABLE "solicitud_rider" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "telefono" VARCHAR(20) NOT NULL,
    "zona" VARCHAR(100) NOT NULL,
    "vehiculo" "vehiculo_rider" NOT NULL,
    "dias" "dia_semana"[],
    "franjas" "franja_rider"[],
    "condiciones_aceptadas_en" TIMESTAMP(3) NOT NULL,
    "estado" "estado_solicitud_rider" NOT NULL DEFAULT 'pendiente',
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitud_rider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitud_rider_usuario_id_key" ON "solicitud_rider"("usuario_id");

-- AddForeignKey
ALTER TABLE "solicitud_rider" ADD CONSTRAINT "solicitud_rider_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que no se pueden declarar en schema.prisma: el backend las valida igualmente,
-- pero la BD no acepta datos imposibles aunque falle una validación.
ALTER TABLE "solicitud_rider" ADD CONSTRAINT "solicitud_rider_dias_no_vacio" CHECK (cardinality("dias") > 0);
ALTER TABLE "solicitud_rider" ADD CONSTRAINT "solicitud_rider_franjas_no_vacio" CHECK (cardinality("franjas") > 0);
