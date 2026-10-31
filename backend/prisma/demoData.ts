// Catálogo de objetos de ejemplo (#97). Lo usan el seed de desarrollo (seed.ts) y el de la demo
// en producción (seed-demo.ts), para que en local y en la demo se vea lo mismo.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 31/10/2026

// Las categorías las crea la migración crea_categoria_objeto_y_foto_objeto (#9).
export type DemoCategory =
  | 'Herramientas y bricolaje'
  | 'Electrónica'
  | 'Deporte'
  | 'Camping y viajes'
  | 'Hogar y jardín'
  | 'Fiestas y eventos'
  | 'Infantil'
  | 'Otros';

export interface DemoItem {
  // Índice del propietario en la lista de usuarios que recibe upsertDemoItems().
  owner: number;
  category: DemoCategory;
  title: string;
  description: string;
  dailyPrice: number;
  deposit: number;
  neighborhood: string;
  homeDelivery: boolean;
  riderDelivery: boolean;
  pickupPointDelivery: boolean;
  status: 'published' | 'paused';
}

export const DEMO_ITEMS: readonly DemoItem[] = [
  {
    owner: 0,
    category: 'Herramientas y bricolaje',
    title: 'Taladro percutor Bosch',
    description:
      'Taladro percutor de 750 W con maletín, brocas para madera, metal y pared. Ideal para colgar estanterías o cuadros.',
    dailyPrice: 6,
    deposit: 40,
    neighborhood: 'Gràcia',
    homeDelivery: true,
    riderDelivery: true,
    pickupPointDelivery: false,
    status: 'published',
  },
  {
    owner: 0,
    category: 'Herramientas y bricolaje',
    title: 'Escalera de aluminio de 3 peldaños',
    description:
      'Escalera plegable y ligera, aguanta hasta 150 kg. Cabe en el ascensor.',
    dailyPrice: 3,
    deposit: 15,
    neighborhood: 'Gràcia',
    homeDelivery: true,
    riderDelivery: false,
    pickupPointDelivery: true,
    status: 'published',
  },
  {
    owner: 0,
    category: 'Camping y viajes',
    title: 'Tienda de campaña para 4 personas',
    description:
      'Tienda iglú de montaje rápido, impermeable, con avancé. Incluye piquetas y bolsa de transporte.',
    dailyPrice: 8,
    deposit: 50,
    neighborhood: 'Gràcia',
    homeDelivery: false,
    riderDelivery: true,
    pickupPointDelivery: true,
    status: 'paused',
  },
  {
    owner: 1,
    category: 'Electrónica',
    title: 'Proyector Full HD',
    description:
      'Proyector de 1080p con cable HDMI y mando. Perfecto para ver una peli o un partido en la terraza.',
    dailyPrice: 12,
    deposit: 80,
    neighborhood: 'Poblenou',
    homeDelivery: true,
    riderDelivery: true,
    pickupPointDelivery: false,
    status: 'published',
  },
  {
    owner: 1,
    category: 'Electrónica',
    title: 'Altavoz Bluetooth JBL',
    description:
      'Altavoz portátil resistente al agua, 12 horas de batería. Se presta con su cargador.',
    dailyPrice: 5,
    deposit: 30,
    neighborhood: 'Poblenou',
    homeDelivery: false,
    riderDelivery: true,
    pickupPointDelivery: true,
    status: 'published',
  },
  {
    owner: 1,
    category: 'Deporte',
    title: 'Bicicleta de montaña talla M',
    description:
      'Bici de montaña de 27,5" con 21 velocidades, casco y candado. Revisada este mes.',
    dailyPrice: 10,
    deposit: 100,
    neighborhood: 'Poblenou',
    homeDelivery: false,
    riderDelivery: false,
    pickupPointDelivery: true,
    status: 'published',
  },
  {
    owner: 1,
    category: 'Fiestas y eventos',
    title: 'Máquina de palomitas',
    description:
      'Máquina de palomitas retro para fiestas y cumpleaños. Hace una ración en 3 minutos.',
    dailyPrice: 7,
    deposit: 25,
    neighborhood: 'Poblenou',
    homeDelivery: true,
    riderDelivery: true,
    pickupPointDelivery: false,
    status: 'published',
  },
  {
    owner: 2,
    category: 'Hogar y jardín',
    title: 'Cortacésped eléctrico',
    description:
      'Cortacésped de 1.400 W con bolsa recogedora de 35 litros, para jardines pequeños.',
    dailyPrice: 9,
    deposit: 60,
    neighborhood: 'Sant Andreu',
    homeDelivery: true,
    riderDelivery: false,
    pickupPointDelivery: false,
    status: 'published',
  },
  {
    owner: 2,
    category: 'Hogar y jardín',
    title: 'Hidrolimpiadora Kärcher',
    description:
      'Hidrolimpiadora de 120 bar para terrazas, bicis y coches. Con lanza y cepillo.',
    dailyPrice: 8,
    deposit: 50,
    neighborhood: 'Sant Andreu',
    homeDelivery: true,
    riderDelivery: true,
    pickupPointDelivery: false,
    status: 'published',
  },
  {
    owner: 2,
    category: 'Infantil',
    title: 'Silla de coche para bebé',
    description:
      'Silla de grupo 0+/1 con sistema Isofix, de 0 a 18 kg. Funda lavada y desinfectada.',
    dailyPrice: 4,
    deposit: 40,
    neighborhood: 'Sant Andreu',
    homeDelivery: true,
    riderDelivery: true,
    pickupPointDelivery: true,
    status: 'published',
  },
  {
    owner: 2,
    category: 'Deporte',
    title: 'Tabla de paddle surf hinchable',
    description:
      'Tabla de 3,2 m con remo, inflador y mochila. Aguanta hasta 120 kg.',
    dailyPrice: 15,
    deposit: 120,
    neighborhood: 'Sant Andreu',
    homeDelivery: false,
    riderDelivery: false,
    pickupPointDelivery: true,
    status: 'published',
  },
  {
    owner: 0,
    category: 'Otros',
    title: 'Carro de la compra plegable',
    description:
      'Carro de 6 ruedas para subir escaleras, con bolsa isotérmica de 40 litros.',
    dailyPrice: 2,
    deposit: 0,
    neighborhood: 'Gràcia',
    homeDelivery: false,
    riderDelivery: false,
    pickupPointDelivery: true,
    status: 'published',
  },
];
