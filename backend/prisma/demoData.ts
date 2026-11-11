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
  // Dirección inventada, obligatoria con entrega en casa o por rider (US-05.01, #281).
  address: string | null;
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
    address: 'Carrer de Verdi, 45, 2º 1ª',
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
    address: "Carrer de l'Or, 18, 3º 2ª",
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
    address: "Carrer del Torrent de l'Olla, 77, 1º",
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
    address: 'Carrer de Pallars, 190, 4º 3ª',
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
    address: 'Carrer de Marià Aguiló, 25, 1º 1ª',
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
    address: null,
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
    address: 'Rambla del Poblenou, 120, 2º',
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
    address: 'Carrer de Sant Adrià, 33, bajos',
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
    address: 'Carrer de Joan Torras, 61, 1º',
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
    address: 'Passeig de Fabra i Puig, 210, 3º 1ª',
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
    address: null,
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
    address: null,
    homeDelivery: false,
    riderDelivery: false,
    pickupPointDelivery: true,
    status: 'published',
  },
];

// Solicitudes de alquiler de ejemplo (US-04.02 a US-04.04). Con ellas, «Mis solicitudes» no sale
// vacía y se puede aceptar o rechazar sin tener que crear antes una solicitud. Los índices son los
// de la lista de usuarios (0 = ana o laura, 1 = bruno o jordi). Las fechas son días a partir de
// hoy, para que nunca queden en el pasado. Las dos pendientes de «Taladro» y «Carro» son para
// los e2e de aceptar (#177) y rechazar (#178): cada vez que se ejecuta el seed, vuelven a estar
// pendientes.
// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 03/11/2026
// Entrega elegida en cada solicitud (US-05.01, #281). La tarifa del rider no se escribe aquí: la
// calcula el seed con la misma función que la API. Los puntos de recogida (los crea la migración
// crea_punto_recogida_y_entrega) se buscan por nombre.
export type DemoDelivery =
  | { mode: 'home' }
  | {
      mode: 'rider';
      // null = «Lo antes posible».
      slot: string | null;
      address: string;
      neighborhood: string;
    }
  | { mode: 'pickup_point'; pickupPoint: string };

export interface DemoReservation {
  item: { owner: number; title: string };
  renter: number;
  delivery: DemoDelivery;
  startInDays: number;
  days: number;
  status: 'pending' | 'accepted' | 'rejected';
}

export const DEMO_RESERVATIONS: readonly DemoReservation[] = [
  {
    item: { owner: 0, title: 'Taladro percutor Bosch' },
    renter: 1,
    delivery: {
      mode: 'rider',
      slot: '11:00-13:00',
      address: 'Carrer de Pallars, 120, 3º 1ª',
      neighborhood: 'Poblenou',
    },
    startInDays: 7,
    days: 3,
    status: 'pending',
  },
  {
    item: { owner: 0, title: 'Carro de la compra plegable' },
    renter: 1,
    delivery: { mode: 'pickup_point', pickupPoint: 'Biblioteca Jaume Fuster' },
    startInDays: 10,
    days: 2,
    status: 'pending',
  },
  {
    item: { owner: 0, title: 'Escalera de aluminio de 3 peldaños' },
    renter: 1,
    delivery: { mode: 'home' },
    startInDays: 14,
    days: 2,
    status: 'accepted',
  },
  {
    item: { owner: 1, title: 'Proyector Full HD' },
    renter: 0,
    delivery: {
      mode: 'rider',
      slot: null,
      address: "Carrer del Torrent de l'Olla, 150, 2º",
      neighborhood: 'Gràcia',
    },
    startInDays: 5,
    days: 1,
    status: 'pending',
  },
  {
    item: { owner: 1, title: 'Altavoz Bluetooth JBL' },
    renter: 0,
    delivery: {
      mode: 'pickup_point',
      pickupPoint: 'Biblioteca Poblenou - Manuel Arranz',
    },
    startInDays: 3,
    days: 2,
    status: 'rejected',
  },
];
