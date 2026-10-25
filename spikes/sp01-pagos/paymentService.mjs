// SP-01 (#90) · Reglas de negocio del pago y la fianza (lo que será `backend/src/services/paymentService.ts`).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026
//
// No conoce la pasarela concreta: recibe un PaymentProvider (simulado o Stripe). Las filas de `pagos` usan los
// nombres de columna de `docs/modelo-datos.md` + los campos nuevos que propone el ADR 0003 (marcados «nuevo»).
// Los importes van en céntimos; en la BD serán decimal(10,2) y la conversión se hace en el repository.
import { randomUUID } from 'node:crypto';

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
  async pay(reservaId, { paymentMethod, idempotencyKey }) {
    const reserva = this.#getReserva(reservaId);
    const existing = this.#pagos.get(reservaId);
    if (reserva.estado === 'pagada' || existing?.estado === 'pagado') throw new ServiceError(409, 'Esta reserva ya está pagada.');
    if (reserva.estado !== 'aceptada') throw new ServiceError(409, 'Solo se puede pagar una solicitud aceptada.');

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
    pago.estado = 'pendiente';
    this.#pagos.set(reservaId, pago);

    const result = await this.#provider.authorize(
      {
        paymentId: pago.id,
        rentCents: pago.importe_alquiler + pago.importe_entrega,
        depositCents: pago.importe_fianza,
        paymentMethod,
      },
      { idempotencyKey },
    );
    if (!result.ok) {
      pago.estado = 'rechazado';
      pago.motivo_rechazo = result.message;
      throw new ServiceError(402, result.message); // la reserva sigue «aceptada»: puede reintentar con otra tarjeta
    }

    await this.#provider.captureRent(result.rentRef);
    pago.referencia_pasarela = result.rentRef;
    pago.referencia_fianza = result.depositRef;

    // ¿La autorización dura lo suficiente? Si no (alquiler largo), la fianza se cobra ya y se devuelve al final.
    const neededUntil = reserva.fecha_fin.getTime() + DEPOSIT_MARGIN_MS;
    if (result.depositHeldUntil.getTime() < neededUntil) {
      await this.#provider.secureDeposit(result.depositRef);
      pago.modo_fianza = 'cobrada';
      pago.fianza_retenida_hasta = null;
    } else {
      pago.modo_fianza = 'autorizada';
      pago.fianza_retenida_hasta = result.depositHeldUntil;
    }
    pago.estado = 'pagado';
    pago.estado_fianza = 'retenida';
    pago.motivo_rechazo = null;
    reserva.estado = 'pagada';
    return pago;
  }

  // US-09.01 · Al abrir una incidencia, la fianza se asegura (se cobra entera) para que no caduque mientras el admin decide.
  async openIncident(reservaId) {
    const pago = this.#getPagoConFianza(reservaId);
    if (pago.modo_fianza === 'autorizada') {
      if (this.#clock() >= pago.fianza_retenida_hasta) throw new ServiceError(409, 'La retención de la fianza ha caducado.');
      await this.#provider.secureDeposit(pago.referencia_fianza);
      pago.modo_fianza = 'cobrada';
      pago.fianza_retenida_hasta = null;
    }
    return pago;
  }

  // US-09.02 · Devolución sin incidencias: se libera la fianza (se anula la autorización o se reembolsa).
  async returnWithoutIncident(reservaId) {
    const pago = this.#getPagoConFianza(reservaId);
    await this.#provider.releaseDeposit(pago.referencia_fianza);
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
      await this.#provider.releaseDeposit(pago.referencia_fianza);
      pago.estado_fianza = 'liberada';
    } else {
      await this.#provider.executeDeposit(pago.referencia_fianza, damageCents);
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
    await this.#provider.refund(pago.referencia_pasarela, refundCents);
    await this.#provider.releaseDeposit(pago.referencia_fianza);
    pago.estado = 'reembolsado';
    pago.importe_reembolsado = refundCents;
    pago.estado_fianza = 'liberada';
    reserva.estado = 'cancelada';
    return pago;
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
