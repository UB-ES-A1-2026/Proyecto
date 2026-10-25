// SP-01 (#90) · Prototipo: recorre los escenarios de pago y fianza de una reserva con la pasarela SIMULADA.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026
//
// Sin dependencias ni red: `node prototipo.mjs`. Imprime pasos numerados y sale con código 1 si algo no cuadra.
// El reloj es simulado para poder «avanzar días» y ver caducar una autorización.
import { randomUUID } from 'node:crypto';
import { PaymentError } from './paymentProvider.mjs';
import { PaymentService, ServiceError } from './paymentService.mjs';
import { SimulatedPaymentProvider } from './simulatedProvider.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
let nowMs = Date.parse('2026-11-16T10:00:00Z'); // un lunes del Sprint 2
const clock = () => new Date(nowMs);
const advanceDays = (days) => {
  nowMs += days * DAY_MS;
};

// «Tablas» del prototipo. En el backend serán `reserva`, `pago` y el estado de la pasarela simulada en la BD.
const reservas = new Map();
const pagos = new Map();
const gatewayStore = new Map();
const gatewayIdempotency = new Map();
let provider = new SimulatedPaymentProvider({ store: gatewayStore, idempotency: gatewayIdempotency, clock });
let service = new PaymentService({ provider, reservas, pagos, clock });

let step = 0;
let failures = 0;
const euros = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;
const date = (d) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
function check(ok, text) {
  step += 1;
  if (!ok) failures += 1;
  console.log(`${step}. ${text} ${ok ? '✔' : '✘'}`);
}
async function expectError(promise, code) {
  try {
    await promise;
    return { ok: false, message: 'no ha dado error' };
  } catch (error) {
    const got = error instanceof PaymentError ? error.code : error instanceof ServiceError ? error.status : error.message;
    return { ok: got === code, message: `${got} «${error.message}»` };
  }
}

// Reserva de ejemplo: taladro a 4 €/día, entrega 3,50 €, fianza 50 €.
function newReserva({ days, estado = 'aceptada' }) {
  const reserva = {
    id: randomUUID(),
    estado,
    fecha_fin: new Date(nowMs + days * DAY_MS),
    precio_total: 400 * days,
    importe_entrega: 350,
    fianza: 5000,
  };
  reservas.set(reserva.id, reserva);
  return reserva;
}
const charged = (ref) => {
  const i = provider.inspect(ref);
  return i.captured - i.refunded;
};

async function main() {
  console.log(`Pasarela: simulada (reglas de Stripe) · reloj simulado desde el ${date(clock())}\n`);

  // ---------- Escenario 1: camino feliz (3 días) ----------
  console.log('Escenario 1 · Camino feliz: pagar, doble clic, reinicio del servidor y devolución sin incidencias');
  const r1 = newReserva({ days: 3 });
  const key1 = randomUUID(); // la genera el frontend al abrir la pantalla de pago (cabecera Idempotency-Key)
  const p1 = await service.pay(r1.id, { paymentMethod: 'pm_card_visa', idempotencyKey: key1 });
  check(
    p1.estado === 'pagado' && r1.estado === 'pagada' && charged(p1.referencia_pasarela) === 1550 &&
      p1.modo_fianza === 'autorizada' && provider.inspect(p1.referencia_fianza).status === 'requires_capture',
    `Pago con Visa de prueba → pago «${p1.estado}», reserva «${r1.estado}»; cobrados ${euros(charged(p1.referencia_pasarela))} (alquiler + entrega); ` +
      `fianza de ${euros(p1.importe_fianza)} autorizada sin cobrar hasta el ${date(p1.fianza_retenida_hasta)}`,
  );
  const intentsBefore = gatewayStore.size;
  const second = await expectError(service.pay(r1.id, { paymentMethod: 'pm_card_visa', idempotencyKey: key1 }), 409);
  check(second.ok && gatewayStore.size === intentsBefore, `Segundo clic en «Pagar» → ${second.message}; no se crea ningún cobro nuevo`);
  const retry = await provider.authorize(
    { paymentId: p1.id, rentCents: 1550, depositCents: 5000, paymentMethod: 'pm_card_visa' },
    { idempotencyKey: key1 },
  );
  check(
    retry.ok && retry.rentRef === p1.referencia_pasarela && gatewayStore.size === intentsBefore,
    'Reintento de red del backend a la pasarela con la misma clave → devuelve la misma autorización, no autoriza dos veces',
  );
  // Render gratuito se duerme: el proceso se reinicia y solo sobrevive lo que está en la BD.
  provider = new SimulatedPaymentProvider({ store: gatewayStore, idempotency: gatewayIdempotency, clock });
  service = new PaymentService({ provider, reservas, pagos, clock });
  advanceDays(3);
  const back1 = await service.returnWithoutIncident(r1.id);
  const dep1 = provider.inspect(back1.referencia_fianza);
  check(
    back1.estado_fianza === 'liberada' && dep1.status === 'canceled' && dep1.captured === 0,
    `Tras reiniciar el servidor, devolución sin incidencias el ${date(clock())} → fianza «${back1.estado_fianza}» (autorización anulada, 0 € cobrados)`,
  );

  // ---------- Escenario 2: tarjeta rechazada ----------
  console.log('\nEscenario 2 · Pago rechazado y reintento');
  const r2 = newReserva({ days: 2 });
  const declined = await expectError(service.pay(r2.id, { paymentMethod: 'pm_card_visa_chargeDeclined', idempotencyKey: randomUUID() }), 402);
  check(
    declined.ok && pagos.get(r2.id).estado === 'rechazado' && r2.estado === 'aceptada',
    `Tarjeta rechazada → ${declined.message}; pago «${pagos.get(r2.id).estado}», la reserva sigue «${r2.estado}»`,
  );
  const noFunds = await expectError(
    service.pay(r2.id, { paymentMethod: 'pm_card_visa_chargeDeclinedInsufficientFunds', idempotencyKey: randomUUID() }),
    402,
  );
  check(noFunds.ok, `Tarjeta sin fondos → ${noFunds.message}`);
  const p2 = await service.pay(r2.id, { paymentMethod: 'pm_card_visa', idempotencyKey: randomUUID() });
  check(p2.estado === 'pagado' && r2.estado === 'pagada', `Reintento con otra tarjeta → pago «${p2.estado}» (misma fila de \`pago\`)`);
  const r2b = newReserva({ days: 2, estado: 'pendiente' });
  const notAccepted = await expectError(service.pay(r2b.id, { paymentMethod: 'pm_card_visa', idempotencyKey: randomUUID() }), 409);
  check(notAccepted.ok, `Pagar una solicitud «pendiente» → ${notAccepted.message}`);

  // ---------- Escenario 3: daño → incidencia → ejecución parcial ----------
  console.log('\nEscenario 3 · Daño: incidencia, la fianza se asegura y el admin ejecuta una parte');
  const r3 = newReserva({ days: 3 });
  const p3 = await service.pay(r3.id, { paymentMethod: 'pm_card_visa', idempotencyKey: randomUUID() });
  advanceDays(3);
  await service.openIncident(r3.id);
  check(
    p3.modo_fianza === 'cobrada' && p3.estado_fianza === 'retenida' && charged(p3.referencia_fianza) === 5000,
    `Incidencia abierta el ${date(clock())} → fianza «${p3.estado_fianza}», ahora cobrada en custodia (${euros(charged(p3.referencia_fianza))}) para que no caduque`,
  );
  advanceDays(5); // el admin tarda: ya han pasado 8 días desde el pago, una autorización habría caducado
  await service.resolveIncident(r3.id, { damageCents: 3000 });
  check(
    p3.estado_fianza === 'ejecutada' && p3.importe_fianza_ejecutado === 3000 && charged(p3.referencia_fianza) === 3000,
    `El admin resuelve el ${date(clock())} con ${euros(3000)} de daños → fianza «${p3.estado_fianza}»: ${euros(3000)} para el propietario, ` +
      `${euros(provider.inspect(p3.referencia_fianza).refunded)} reembolsados`,
  );

  // ---------- Escenario 4: alquiler más largo que la autorización ----------
  console.log('\nEscenario 4 · Alquiler de 10 días (más largo que los 7 días de una autorización)');
  const r4 = newReserva({ days: 10 });
  const p4 = await service.pay(r4.id, { paymentMethod: 'pm_card_visa', idempotencyKey: randomUUID() });
  check(
    p4.modo_fianza === 'cobrada' && charged(p4.referencia_fianza) === 5000,
    `La autorización caducaría antes del fin + 2 días → la fianza se cobra al pagar (${euros(charged(p4.referencia_fianza))}) y se devolverá al final`,
  );
  advanceDays(10);
  await service.returnWithoutIncident(r4.id);
  check(
    p4.estado_fianza === 'liberada' && charged(p4.referencia_fianza) === 0,
    `Devolución el ${date(clock())} → fianza «${p4.estado_fianza}»: se reembolsan los ${euros(5000)}`,
  );

  // ---------- Escenario 5: cancelación ----------
  console.log('\nEscenario 5 · Cancelación de una reserva pagada con rider asignado (US-04.05)');
  const r5 = newReserva({ days: 2 });
  const p5 = await service.pay(r5.id, { paymentMethod: 'pm_card_visa', idempotencyKey: randomUUID() });
  await service.cancel(r5.id, { riderAssigned: true });
  check(
    p5.estado === 'reembolsado' && p5.importe_reembolsado === 800 && charged(p5.referencia_pasarela) === 350 &&
      p5.estado_fianza === 'liberada' && r5.estado === 'cancelada',
    `Cancelada → pago «${p5.estado}»: se reembolsa el alquiler (${euros(p5.importe_reembolsado)}), se cobra la entrega ` +
      `(${euros(charged(p5.referencia_pasarela))}) y la fianza queda «${p5.estado_fianza}»`,
  );
  const again = await expectError(service.cancel(r5.id, { riderAssigned: true }), 409);
  check(again.ok, `Cancelar otra vez → ${again.message}`);

  // ---------- Escenario 6: reglas de la pasarela (las mismas que aplica Stripe) ----------
  console.log('\nEscenario 6 · Reglas de la pasarela: captura parcial, doble captura, idempotencia y caducidad');
  const auth = await provider.authorize({ paymentId: randomUUID(), rentCents: 1000, depositCents: 5000, paymentMethod: 'pm_card_visa' });
  const partial = await provider.executeDeposit(auth.depositRef, 2000, { idempotencyKey: 'ejecutar-1' });
  check(
    partial.status === 'succeeded' && partial.captured === 2000,
    `Ejecución parcial sobre una autorización: se capturan ${euros(2000)} de ${euros(5000)} y el resto (${euros(3000)}) se libera solo`,
  );
  const twiceCapture = await expectError(provider.secureDeposit(auth.depositRef, { idempotencyKey: 'capturar-otra-vez' }), 'already_captured');
  check(twiceCapture.ok && charged(auth.depositRef) === 2000, `Capturar otra vez el mismo pago (petición nueva) → ${twiceCapture.message}`);
  const sameKey = await provider.executeDeposit(auth.depositRef, 2000, { idempotencyKey: 'ejecutar-1' });
  check(sameKey.captured === 2000 && charged(auth.depositRef) === 2000, 'Repetir la petición con la misma clave → la respuesta guardada; no se cobra dos veces');
  const reused = await expectError(provider.executeDeposit(auth.depositRef, 4000, { idempotencyKey: 'ejecutar-1' }), 'idempotency_key_reused');
  check(reused.ok, `Misma clave con otro importe → ${reused.message}`);
  const tooMuch = await expectError(provider.refund(auth.rentRef, 1, { idempotencyKey: 'reembolso-sin-cobro' }), 'invalid_state');
  check(tooMuch.ok, `Reembolsar un pago que solo está autorizado → ${tooMuch.message}`);
  advanceDays(8);
  const expired = await expectError(provider.captureRent(auth.rentRef), 'authorization_expired');
  check(
    expired.ok && provider.inspect(auth.rentRef).status === 'canceled',
    `Capturar una autorización de hace 8 días → ${expired.message} (estado «canceled»)`,
  );

  // ---------- Resumen ----------
  const total = (ref) => (ref ? charged(ref) : 0);
  const net = [...pagos.values()].reduce((sum, p) => sum + total(p.referencia_pasarela) + total(p.referencia_fianza), 0);
  const expectedNet = 1550 + 1150 + (1550 + 3000) + 4350 + 350; // escenarios 1, 2, 3, 4 y 5
  check(net === expectedNet, `Cuadre final: cobrado neto a los arrendatarios ${euros(net)} (esperado ${euros(expectedNet)})`);

  console.log(failures === 0 ? '\nTodo cuadra.' : `\nComprobaciones fallidas: ${failures}.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Error del prototipo: ${error.message}`);
  process.exitCode = 1;
});
