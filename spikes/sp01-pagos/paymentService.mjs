// SP-01 (#90) · Reglas de negocio del pago y la fianza (lo que será `backend/src/services/paymentService.ts`).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026
//
// No conoce la pasarela concreta: recibe un PaymentProvider (simulado o Stripe). Las filas de `pagos` usan los
// nombres de columna de `docs/modelo-datos.md` + los campos nuevos que propone el ADR 0003 (marcados «nuevo»).
// Los importes van en céntimos; en la BD serán decimal(10,2) y la conversión se hace en el repository.
import { randomUUID } from 'node:crypto';
import { PaymentError } from './paymentProvider.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
// La fianza debe seguir retenida hasta 2 días después de `fecha_fin`: margen para el check-out y para abrir una incidencia.
export const DEPOSIT_MARGIN_MS = 2 * DAY_MS;

export class ServiceError extends Error {
  /** @param {number} status código HTTP que devolvería el controller @param {string} message mensaje para el usuario */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Errores de la pasarela → respuesta HTTP (revisión de Francesc en #168): ninguno puede acabar en un 500.
// Los rechazos de la tarjeta no son errores: llegan como { ok: false } y se responden con 402.
const GATEWAY_ERRORS = {
  idempotency_key_reused: [409, 'Este intento de pago ya se usó. Vuelve a pulsar «Pagar».'],
  authorization_expired: [409, 'La retención de la fianza ha caducado.'],
  already_captured: [409, 'Este pago ya se ha cobrado.'],
  invalid_state: [409, 'El pago no permite esta operación en su estado actual.'],
  amount_too_large: [400, 'El importe no es válido para este pago.'],
  invalid_amount: [400, 'El importe no es válido para este pago.'],
  invalid_payment_method: [400, 'El método de pago no es válido.'],
};
const GATEWAY_DOWN = [502, 'La pasarela de pago no responde. Inténtalo de nuevo en unos minutos.'];

function toServiceError(error) {
  if (error instanceof ServiceError) return error;
  // Cualquier otro error (red, timeout, `not_found`…) es un fallo de la pasarela, no del usuario.
  const [status, message] = (error instanceof PaymentError && GATEWAY_ERRORS[error.code]) || GATEWAY_DOWN;
  const serviceError = new ServiceError(status, message);
  serviceError.cause = error;
  return serviceError;
}

export class PaymentService {
  #provider;
  #reservas;
  #pagos;
  #clock;

  constructor({ provider, reservas, pagos, clock = () => new Date() }) {
    this.#provider = provider;
    this.#reservas = reservas;
    this.#pagos = pagos;
    this.#clock = clock;
  }

  // US-07.01 · Pagar una solicitud aceptada: alquiler + entrega se cobran; la fianza queda retenida.
  // `idempotencyKey` es una por INTENTO de pago: el frontend genera una nueva al abrir la pantalla y tras cada
  // error (402, 409, 502). Solo un reintento automático de la MISMA petición repite la clave.
  async pay(reservaId, { paymentMethod, idempotencyKey }) {
    const reserva = this.#getReserva(reservaId);
    const existing = this.#pagos.get(reservaId);
    if (reserva.estado === 'pagada' || existing?.estado === 'pagado') throw new ServiceError(409, 'Esta reserva ya está pagada.');
    if (reserva.estado !== 'aceptada') throw new ServiceError(409, 'Solo se puede pagar una solicitud aceptada.');
    // Doble clic simultáneo (dos pestañas): solo un intento a la vez por reserva. En el backend, un UPDATE
    // condicional en una transacción (`… SET estado = 'procesando' WHERE reserva_id = $1 AND estado <> 'procesando'`)
    // más la restricción única de `pago.reserva_id`. Aquí basta con no esperar (await) entre comprobar y marcar.
    if (existing?.estado === 'procesando') throw new ServiceError(409, 'Ya hay un pago en curso para esta reserva.');

    const pago = existing ?? {
      id: randomUUID(),
      reserva_id: reservaId,
      importe_alquiler: reserva.precio_total,
      importe_entrega: reserva.importe_entrega,
      importe_fianza: reserva.fianza,
      estado: 'pendiente',
      estado_fianza: null,
      referencia_pasarela: null,
      referencia_fianza: null, // nuevo
      modo_fianza: null, // nuevo: autorizada | cobrada
      fianza_retenida_hasta: null, // nuevo
      importe_fianza_ejecutado: 0, // nuevo
      importe_reembolsado: 0, // nuevo
      motivo_rechazo: null, // nuevo
      creado_en: this.#clock(),
    };
    pago.estado = 'procesando'; // nuevo valor del enum
    this.#pagos.set(reservaId, pago);

    let result;
    try {
      result = await this.#provider.authorize(
        {
          paymentId: pago.id,
          rentCents: pago.importe_alquiler + pago.importe_entrega,
          depositCents: pago.importe_fianza,
          paymentMethod,
        },
        { idempotencyKey },
      );
    } catch (error) {
      throw this.#fail(pago, toServiceError(error));
    }
    if (!result.ok) {
      throw this.#fail(pago, new ServiceError(402, result.message)); // la reserva sigue «aceptada»: puede reintentar con otra tarjeta
    }

    // ¿La autorización dura lo suficiente? Si no (alquiler largo), la fianza se cobra ya y se devuelve al final.
    const neededUntil = reserva.fecha_fin.getTime() + DEPOSIT_MARGIN_MS;
    const secureNow = result.depositHeldUntil.getTime() < neededUntil;
    try {
      await this.#provider.captureRent(result.rentRef);
      if (secureNow) await this.#provider.secureDeposit(result.depositRef);
    } catch (error) {
      // Compensación: si falla a mitad, se deshace lo autorizado o cobrado para no dejar dinero retenido.
      for (const ref of [result.rentRef, result.depositRef]) {
        try {
          await this.#provider.voidPayment(ref);
        } catch {
          // Si tampoco se puede anular, la autorización caduca sola a los 7 días; queda en `motivo_rechazo`.
        }
      }
      throw this.#fail(pago, toServiceError(error));
    }

    pago.referencia_pasarela = result.rentRef;
    pago.referencia_fianza = result.depositRef;
    pago.modo_fianza = secureNow ? 'cobrada' : 'autorizada';
    pago.fianza_retenida_hasta = secureNow ? null : result.depositHeldUntil;
    pago.estado = 'pagado';
    pago.estado_fianza = 'retenida';
    pago.motivo_rechazo = null;
    reserva.estado = 'pagada';
    return pago;
  }

  // Un intento fallido deja el pago «rechazado» (se puede reintentar) y devuelve el error para lanzarlo.
  #fail(pago, serviceError) {
    pago.estado = 'rechazado';
    pago.motivo_rechazo = serviceError.message;
    return serviceError;
  }

  // US-09.01 · Al abrir una incidencia, la fianza se asegura (se cobra entera) para que no caduque mientras el admin decide.
  async openIncident(reservaId) {
    const pago = this.#getPagoConFianza(reservaId);
    if (pago.modo_fianza === 'autorizada') {
      if (this.#clock() >= pago.fianza_retenida_hasta) throw new ServiceError(409, 'La retención de la fianza ha caducado.');
      await this.#gateway(() => this.#provider.secureDeposit(pago.referencia_fianza));
      pago.modo_fianza = 'cobrada';
      pago.fianza_retenida_hasta = null;
    }
    return pago;
  }

  // US-09.02 · Devolución sin incidencias: se libera la fianza (se anula la autorización o se reembolsa).
  async returnWithoutIncident(reservaId) {
    const pago = this.#getPagoConFianza(reservaId);
    await this.#gateway(() => this.#provider.releaseDeposit(pago.referencia_fianza));
    pago.estado_fianza = 'liberada';
    this.#getReserva(reservaId).estado = 'finalizada';
    return pago;
  }

  // US-11.01 · El admin resuelve la incidencia: 0 € = liberar la fianza; más de 0 € = ejecutar esa parte.
  async resolveIncident(reservaId, { damageCents }) {
    const pago = this.#getPagoConFianza(reservaId);
    if (!Number.isInteger(damageCents) || damageCents < 0 || damageCents > pago.importe_fianza) {
      throw new ServiceError(400, `El importe de los daños debe estar entre 0 y ${pago.importe_fianza} céntimos.`);
    }
    if (damageCents === 0) {
      await this.#gateway(() => this.#provider.releaseDeposit(pago.referencia_fianza));
      pago.estado_fianza = 'liberada';
    } else {
      await this.#gateway(() => this.#provider.executeDeposit(pago.referencia_fianza, damageCents));
      pago.estado_fianza = 'ejecutada';
      pago.importe_fianza_ejecutado = damageCents;
    }
    this.#getReserva(reservaId).estado = 'finalizada';
    return pago;
  }

  // US-04.05 · Cancelar una reserva pagada: se reembolsa el alquiler (y la entrega si aún no hay rider) y se libera la fianza.
  async cancel(reservaId, { riderAssigned }) {
    const reserva = this.#getReserva(reservaId);
    const pago = this.#getPagoConFianza(reservaId);
    if (reserva.estado !== 'pagada') throw new ServiceError(409, 'Solo se puede cancelar una reserva pagada que aún no ha empezado.');
    const refundCents = pago.importe_alquiler + (riderAssigned ? 0 : pago.importe_entrega);
    await this.#gateway(() => this.#provider.refund(pago.referencia_pasarela, refundCents));
    await this.#gateway(() => this.#provider.releaseDeposit(pago.referencia_fianza));
    // Con rider asignado se cobra la entrega: el reembolso es parcial y se ve en el estado (revisión de Francesc).
    pago.estado = refundCents === pago.importe_alquiler + pago.importe_entrega ? 'reembolsado' : 'reembolsado_parcial';
    pago.importe_reembolsado = refundCents;
    pago.estado_fianza = 'liberada';
    reserva.estado = 'cancelada';
    return pago;
  }

  async #gateway(call) {
    try {
      return await call();
    } catch (error) {
      throw toServiceError(error);
    }
  }

  #getReserva(reservaId) {
    const reserva = this.#reservas.get(reservaId);
    if (!reserva) throw new ServiceError(404, 'La reserva no existe.');
    return reserva;
  }

  #getPagoConFianza(reservaId) {
    const pago = this.#pagos.get(reservaId);
    if (!pago || pago.estado !== 'pagado') throw new ServiceError(409, 'La reserva no tiene un pago completado.');
    if (pago.estado_fianza !== 'retenida') throw new ServiceError(409, `La fianza ya está ${pago.estado_fianza}.`);
    return pago;
  }
}
