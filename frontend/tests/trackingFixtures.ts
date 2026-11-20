// Generado con asistencia de IA (Claude)
import type {
  ApiDeliveryTracking,
  DeliveryStatus,
  DeliveryTracking,
} from '../src/services/deliveryTrackingService';

// Un seguimiento de ejemplo, tal como lo pinta la vista: entrega con rider, en camino.
export function tracking(overrides: Partial<DeliveryTracking> = {}): DeliveryTracking {
  return {
    reservationId: 'r1',
    role: 'renter',
    item: { id: 'item-1', title: 'Taladro percutor Bosch' },
    startDate: '2026-11-18',
    endDate: '2026-11-20',
    reservationStatus: 'paid',
    mode: 'rider',
    slot: null,
    renter: { username: 'bruno' },
    owner: { username: 'ana' },
    pickupAddress: null,
    deliveryStatus: 'on_the_way',
    history: [
      { status: 'assigned', at: '2026-11-18T09:02:00.000Z' },
      { status: 'picked_up', at: '2026-11-18T09:30:00.000Z' },
      { status: 'on_the_way', at: '2026-11-18T09:41:00.000Z' },
    ],
    deliveryCode: '482193',
    ...overrides,
  };
}

// Sin rider (recoger en casa del propietario), pendiente de entrega.
export function pickupTracking(overrides: Partial<DeliveryTracking> = {}): DeliveryTracking {
  return tracking({
    item: { id: 'item-2', title: 'Bicicleta de paseo' },
    startDate: '2026-11-25',
    endDate: '2026-11-26',
    mode: 'home',
    pickupAddress: 'Carrer del Sol, 8, 2.º 1.ª',
    deliveryStatus: 'pending',
    history: [{ status: 'pending', at: '2026-11-20T10:00:00.000Z' }],
    deliveryCode: null,
    ...overrides,
  });
}

// El mismo seguimiento como lo devuelve la API de T13 (#288): todos los pasos del modo con su hora o
// null, «asap» para «Lo antes posible» y la hora de la devolución aparte.
export function apiTracking(view: DeliveryTracking): ApiDeliveryTracking {
  const modeSteps: DeliveryStatus[] =
    view.mode === 'rider'
      ? ['assigned', 'picked_up', 'on_the_way', 'delivered']
      : ['pending', 'delivered'];
  const timeOf = (status: string) =>
    view.history.filter((entry) => entry.status === status).at(-1)?.at ?? null;
  return {
    reservationId: view.reservationId,
    role: view.role,
    item: view.item,
    startDate: view.startDate,
    endDate: view.endDate,
    reservationStatus: view.reservationStatus,
    mode: view.mode,
    slot: view.mode === 'rider' ? (view.slot ?? 'asap') : null,
    renter: { id: 'u2', username: view.renter.username },
    owner: { id: 'u1', username: view.owner.username },
    pickupAddress: view.pickupAddress,
    status: view.deliveryStatus,
    steps: modeSteps.map((status) => ({ status, at: timeOf(status) })),
    returnedAt: timeOf('finished'),
    rider: view.mode === 'rider' ? { id: 'u3', username: 'dani' } : null,
    deliveryCode: view.deliveryCode,
  };
}

// Una respuesta del canal SSE que el test va llenando: `send` manda texto y `close` lo corta.
export function sseResponse() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });
  return {
    response: new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    send: (text: string) => controller?.enqueue(encoder.encode(text)),
    close: () => controller?.close(),
  };
}
