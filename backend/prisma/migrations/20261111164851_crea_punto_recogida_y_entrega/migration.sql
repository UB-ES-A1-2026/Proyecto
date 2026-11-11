-- Entrega de US-05.01 (#281): dirección del propietario, puntos de recogida y entrega de cada reserva.
-- Generado por Prisma; los CHECK y los puntos de recogida del final se añadieron a mano.
-- Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026

-- AlterTable
ALTER TABLE "objeto" ADD COLUMN     "direccion" VARCHAR(200);

-- CreateTable
CREATE TABLE "punto_recogida" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "direccion" VARCHAR(200) NOT NULL,
    "barrio" VARCHAR(100) NOT NULL,
    "latitud" DECIMAL(9,6) NOT NULL,
    "longitud" DECIMAL(9,6) NOT NULL,

    CONSTRAINT "punto_recogida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entrega" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "punto_recogida_id" UUID,
    "franja" VARCHAR(11),
    "direccion_destino" VARCHAR(200),
    "barrio_destino" VARCHAR(100),
    "tarifa" DECIMAL(10,2),
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entrega_reserva_id_key" ON "entrega"("reserva_id");

-- CreateIndex
CREATE INDEX "entrega_punto_recogida_id_idx" ON "entrega"("punto_recogida_id");

-- AddForeignKey
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_punto_recogida_id_fkey" FOREIGN KEY ("punto_recogida_id") REFERENCES "punto_recogida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que no se pueden declarar en schema.prisma: el backend las valida igualmente,
-- pero la BD no acepta datos imposibles aunque falle una validación.
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_tarifa_positiva" CHECK ("tarifa" IS NULL OR "tarifa" > 0);
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_franja_formato" CHECK ("franja" IS NULL OR "franja" ~ '^[0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}$');

-- Puntos de recogida: lugares públicos de Barcelona (bibliotecas, mercados y centros cívicos). Son
-- datos de referencia, como las categorías: los crea la migración para que existan también en
-- producción (allí no se ejecuta el seed). Las coordenadas son aproximadas; para cambiarlos o
-- añadir más, una migración nueva.
INSERT INTO "punto_recogida" ("id", "nombre", "direccion", "barrio", "latitud", "longitud") VALUES
  ('a1c0a1e0-5b01-4d6a-9e10-0000000000a1', 'Biblioteca Jaume Fuster', 'Plaça de Lesseps, 20-22', 'Gràcia', 41.409700, 2.150100),
  ('a1c0a1e0-5b01-4d6a-9e10-0000000000a2', 'Biblioteca Poblenou - Manuel Arranz', 'Rambla del Poblenou, 38', 'Poblenou', 41.402300, 2.200300),
  ('a1c0a1e0-5b01-4d6a-9e10-0000000000a3', 'Mercat de Sant Antoni', 'Carrer del Comte d''Urgell, 1', 'Sant Antoni', 41.378600, 2.162600),
  ('a1c0a1e0-5b01-4d6a-9e10-0000000000a4', 'Centre Cívic Cotxeres de Sants', 'Carrer de Sants, 79', 'Sants', 41.375500, 2.137100),
  ('a1c0a1e0-5b01-4d6a-9e10-0000000000a5', 'Biblioteca Ignasi Iglésias - Can Fabra', 'Carrer del Segre, 24', 'Sant Andreu', 41.434400, 2.192300),
  ('a1c0a1e0-5b01-4d6a-9e10-0000000000a6', 'Mercat de la Barceloneta', 'Plaça de la Font, 1', 'La Barceloneta', 41.379200, 2.189300);
