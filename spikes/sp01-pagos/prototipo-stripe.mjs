// SP-01 (#90) · Los mismos escenarios básicos contra Stripe en MODO TEST (no ejecutado en el spike: faltan claves).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026
//
// Uso: `npm install` y `npm run prototipo:stripe` con STRIPE_SECRET_KEY=sk_test_… en un `.env` (nunca en el repo).
// Usa los PaymentMethods de prueba de Stripe (`pm_card_visa`…): no mueve dinero real y no cuesta nada.
import { randomUUID } from 'node:crypto';
import { PaymentService, ServiceError } from './paymentService.mjs';
import { StripePaymentProvider } from './stripeProvider.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const provider = new StripePaymentProvider({ secretKey: process.env.STRIPE_SECRET_KEY });
const reservas = new Map();
const pagos = new Map();
const service = new PaymentService({ provider, reservas, pagos });

let step = 0;
let failures = 0;
function check(ok, text) {
  step += 1;
  if (!ok) failures += 1;
  console.log(`${step}. ${text} ${ok ? '✔' : '✘'}`);
}
function newReserva(days) {
  const reserva = { id: randomUUID(), estado: 'aceptada', fecha_fin: new Date(Date.now() + days * DAY_MS), precio_total: 400 * days, importe_entrega: 350, fianza: 5000 };
  reservas.set(reserva.id, reserva);
  return reserva;
}

async function main() {
  // 1. Camino feliz: alquiler + entrega cobrados, fianza autorizada, devolución → autorización anulada.
  const r1 = newReserva(3);
  const p1 = await service.pay(r1.id, { paymentMethod: 'pm_card_visa', idempotencyKey: randomUUID() });
  check(p1.estado === 'pagado' && p1.modo_fianza === 'autorizada', `Pagado (${p1.referencia_pasarela}); fianza autorizada hasta ${p1.fianza_retenida_hasta?.toISOString()}`);
  await service.returnWithoutIncident(r1.id);
  check(p1.estado_fianza === 'liberada', 'Devolución sin incidencias → fianza liberada (PaymentIntent de la fianza cancelado)');

  // 2. Tarjeta rechazada.
  const r2 = newReserva(2);
  try {
    await service.pay(r2.id, { paymentMethod: 'pm_card_visa_chargeDeclined', idempotencyKey: randomUUID() });
    check(false, 'La tarjeta rechazada debería dar error');
  } catch (error) {
    check(error instanceof ServiceError && error.status === 402 && pagos.get(r2.id).estado === 'rechazado', `Tarjeta rechazada → ${error.message}`);
  }

  // 3. Daño: incidencia (se captura la fianza entera) y el admin ejecuta 30 € (se reembolsan 20 €).
  const r3 = newReserva(3);
  const p3 = await service.pay(r3.id, { paymentMethod: 'pm_card_visa', idempotencyKey: randomUUID() });
  await service.openIncident(r3.id);
  await service.resolveIncident(r3.id, { damageCents: 3000 });
  check(p3.estado_fianza === 'ejecutada', `Incidencia resuelta → fianza ejecutada (30 €) en ${p3.referencia_fianza}`);

  // 4. Captura parcial directa sobre una autorización y segundo intento de captura.
  const auth = await provider.authorize({ paymentId: randomUUID(), rentCents: 1000, depositCents: 5000, paymentMethod: 'pm_card_visa' });
  await provider.executeDeposit(auth.depositRef, 2000);
  try {
    await provider.secureDeposit(auth.depositRef, { idempotencyKey: randomUUID() });
    check(false, 'Capturar dos veces debería dar error');
  } catch (error) {
    check(true, `Capturar dos veces → ${error.code}: ${error.message}`);
  }

  console.log('\nRevisa los pagos en el Dashboard de Stripe (modo test) → Pagos.');
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Error del prototipo: ${error.message}`);
  process.exitCode = 1;
});
