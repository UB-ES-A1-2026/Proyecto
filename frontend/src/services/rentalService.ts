// Generado con asistencia de IA (Claude) – revisado por Francesc Curto, 04/11/2026
import { ApiError, apiRequest } from './apiClient';
import type { DeliveryRequest } from './deliveryService';
import type { Reservation } from './reservationService';

export type { Reservation, ReservationStatus } from './reservationService';

// Fechas de una solicitud: GET /reservas/disponibilidad (#204) y POST /reservas (#120).
// El importe no se envía: lo calcula el backend.
export type RentalRequestInput = {
  itemId: string;
  startDate: string;
  endDate: string;
};

// Respuesta de GET /api/reservas/disponibilidad (#204). Solo informa: POST /reservas lo vuelve a
// comprobar al crear la solicitud.
export type Availability = { available: boolean };

export function checkAvailability(token: string, input: RentalRequestInput): Promise<Availability> {
  const query = new URLSearchParams(input).toString();
  return apiRequest<Availability>(`/reservas/disponibilidad?${query}`, { token });
}

// El banco pide verificar el pago (3D Secure, US-07.01): todavía no se ha creado la reserva. El
// navegador llama a stripe.handleNextAction({ clientSecret }) y repite la solicitud con paymentIntentId.
export class PaymentVerificationRequired extends Error {
  readonly clientSecret: string;
  readonly paymentIntentId: string;

  constructor(clientSecret: string, paymentIntentId: string) {
    super('Tu banco pide verificar el pago.');
    this.name = 'PaymentVerificationRequired';
    this.clientSecret = clientSecret;
    this.paymentIntentId = paymentIntentId;
  }
}

// Con el token del formulario de pago (confirmationTokenId) o, tras el 3D Secure, con el
// PaymentIntent verificado.
export type PaymentCredential = string | { paymentIntentId: string };

// Solicitar es pagar (US-07.01, #286): con el token de la tarjeta se bloquea el importe y se cobra
// cuando el propietario acepta. Responde 201 con la reserva «pending», 402 si la tarjeta se rechaza
// (y no se crea la reserva; field "confirmationTokenId"), 402 con requiresAction si el banco pide
// verificación (se lanza PaymentVerificationRequired) o los 409 de #120.
export async function requestRental(
  token: string,
  // Con US-05.01 (#282) la solicitud lleva también el modo de entrega y sus datos.
  input: RentalRequestInput & DeliveryRequest,
  payment: PaymentCredential,
): Promise<Reservation> {
  const credential = typeof payment === 'string' ? { confirmationTokenId: payment } : payment;
  try {
    return await apiRequest<Reservation>('/reservas', {
      method: 'POST',
      body: { ...input, ...credential },
      token,
    });
  } catch (error) {
    const details = error instanceof ApiError ? error.details : undefined;
    if (
      error instanceof ApiError &&
      error.status === 402 &&
      details?.requiresAction === true &&
      typeof details.clientSecret === 'string' &&
      typeof details.paymentIntentId === 'string'
    ) {
      throw new PaymentVerificationRequired(details.clientSecret, details.paymentIntentId);
    }
    throw error;
  }
}
