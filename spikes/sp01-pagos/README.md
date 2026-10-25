# SP-01 · Prototipo de pago con fianza

Prototipo del spike [#90](https://github.com/UB-ES-A1-2026/Proyecto/issues/90). La decisión y el porqué están en [ADR 0003](../../docs/adr/0003-pagos-y-fianza.md). **No es código de producción**: está aislado del backend y tiene su propio `package.json`.

> Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026.

## Qué hay

| Fichero | Qué es | En el backend será… |
|---|---|---|
| `paymentProvider.mjs` | El contrato `PaymentProvider` (autorizar, cobrar el alquiler, asegurar/liberar/ejecutar la fianza, reembolsar), los errores y los métodos de pago de prueba. | `backend/src/repositories/paymentGateway.ts` (interfaz) |
| `simulatedProvider.mjs` | Pasarela **simulada** que copia las reglas de un PaymentIntent de Stripe con captura manual: caducidad a los 7 días, una sola captura, captura parcial que libera el resto, reembolsos ≤ lo cobrado e idempotencia. | La implementación por defecto (local, CI, e2e y demo) |
| `paymentService.mjs` | Reglas de negocio de Rentit: solo se paga una solicitud aceptada, no se paga dos veces, cuándo se autoriza o se cobra la fianza, incidencias y cancelación. Usa los nombres de columna de `pago`. | `backend/src/services/paymentService.ts` |
| `stripeProvider.mjs` | Adaptador de **Stripe en modo test** para el mismo contrato. **Escrito pero no ejecutado** (no hay cuenta ni claves). | Opcional en el Sprint 3 |
| `prototipo.mjs` | Recorre los escenarios con la pasarela simulada y un reloj simulado. Sin dependencias ni red. | Tests unitarios del service |
| `prototipo-stripe.mjs` | Los escenarios básicos contra Stripe en modo test. No ejecutado. | Prueba manual del adaptador |

## Qué demuestra

1. **Camino feliz:** al pagar se cobran alquiler + entrega y la fianza queda **autorizada sin cobrar** hasta 7 días. Un segundo clic en «Pagar» da 409 y un reintento con la misma clave de idempotencia no cobra dos veces. Aunque el servidor se reinicie (Render gratuito se duerme), el estado sigue, porque no vive en memoria del proceso. Al devolver sin incidencias, la autorización se anula: 0 € de fianza cobrados.
2. **Pago rechazado:** con las tarjetas de prueba `…0002` (rechazada) y `…9995` (sin fondos), el pago queda `rechazado`, la reserva sigue `aceptada` y se puede reintentar. No se puede pagar una solicitud `pendiente`.
3. **Daño:** al abrir la incidencia, la fianza se **cobra entera en custodia** (para que no caduque mientras decide el admin); el admin ejecuta 30 € y se reembolsan 20 €.
4. **Alquiler de 10 días:** la autorización no llegaría hasta el final, así que la fianza se cobra al pagar y se reembolsa al devolver.
5. **Cancelación con rider asignado (US-04.05):** se reembolsa el alquiler, se cobra la entrega y se libera la fianza.
6. **Reglas de la pasarela** (las de Stripe): captura parcial, segunda captura → error, misma clave → misma respuesta, misma clave con otros datos → error, reembolso sin cobro → error y autorización caducada a los 8 días.

## Cómo ejecutarlo

Requisitos: Node 22 o superior. No hace falta `npm install` ni Docker.

```bash
cd spikes/sp01-pagos
npm run prototipo        # o: node prototipo.mjs
```

Sale con código 1 si alguna comprobación falla (se ha comprobado cambiando a propósito un importe esperado).

## Resultado (25/10/2026, pasarela simulada, Node 24.15.0)

```
Pasarela: simulada (reglas de Stripe) · reloj simulado desde el 16/11/2026

Escenario 1 · Camino feliz: pagar, doble clic, reinicio del servidor y devolución sin incidencias
1. Pago con Visa de prueba → pago «pagado», reserva «pagada»; cobrados 15,50 € (alquiler + entrega); fianza de 50,00 € autorizada sin cobrar hasta el 23/11/2026 ✔
2. Segundo clic en «Pagar» → 409 «Esta reserva ya está pagada.»; no se crea ningún cobro nuevo ✔
3. Reintento de red del backend a la pasarela con la misma clave → devuelve la misma autorización, no autoriza dos veces ✔
4. Tras reiniciar el servidor, devolución sin incidencias el 19/11/2026 → fianza «liberada» (autorización anulada, 0 € cobrados) ✔

Escenario 2 · Pago rechazado y reintento
5. Tarjeta rechazada → 402 «La tarjeta ha sido rechazada. Prueba con otra tarjeta.»; pago «rechazado», la reserva sigue «aceptada» ✔
6. Tarjeta sin fondos → 402 «La tarjeta no tiene fondos suficientes.» ✔
7. Reintento con otra tarjeta → pago «pagado» (misma fila de `pago`) ✔
8. Pagar una solicitud «pendiente» → 409 «Solo se puede pagar una solicitud aceptada.» ✔

Escenario 3 · Daño: incidencia, la fianza se asegura y el admin ejecuta una parte
9. Incidencia abierta el 22/11/2026 → fianza «retenida», ahora cobrada en custodia (50,00 €) para que no caduque ✔
10. El admin resuelve el 27/11/2026 con 30,00 € de daños → fianza «ejecutada»: 30,00 € para el propietario, 20,00 € reembolsados ✔

Escenario 4 · Alquiler de 10 días (más largo que los 7 días de una autorización)
11. La autorización caducaría antes del fin + 2 días → la fianza se cobra al pagar (50,00 €) y se devolverá al final ✔
12. Devolución el 07/12/2026 → fianza «liberada»: se reembolsan los 50,00 € ✔

Escenario 5 · Cancelación de una reserva pagada con rider asignado (US-04.05)
13. Cancelada → pago «reembolsado»: se reembolsa el alquiler (8,00 €), se cobra la entrega (3,50 €) y la fianza queda «liberada» ✔
14. Cancelar otra vez → 409 «La reserva no tiene un pago completado.» ✔

Escenario 6 · Reglas de la pasarela: captura parcial, doble captura, idempotencia y caducidad
15. Ejecución parcial sobre una autorización: se capturan 20,00 € de 50,00 € y el resto (30,00 €) se libera solo ✔
16. Capturar otra vez el mismo pago (petición nueva) → already_captured «Este pago ya se capturó; solo se puede capturar una vez.» ✔
17. Repetir la petición con la misma clave → la respuesta guardada; no se cobra dos veces ✔
18. Misma clave con otro importe → idempotency_key_reused «La clave «ejecutar-1» ya se usó con otros parámetros.» ✔
19. Reembolsar un pago que solo está autorizado → invalid_state «Solo se puede reembolsar un pago cobrado.» ✔
20. Capturar una autorización de hace 8 días → authorization_expired «La autorización ha caducado: los fondos ya se han liberado.» (estado «canceled») ✔
21. Cuadre final: cobrado neto a los arrendatarios 119,50 € (esperado 119,50 €) ✔

Todo cuadra.
```

## Probar el adaptador de Stripe (no ejecutado en el spike)

`stripeProvider.mjs` y `prototipo-stripe.mjs` **no se han ejecutado**: el equipo no tiene cuenta de Stripe. Cuando alguien la cree (es gratis y, según la documentación de Stripe, el entorno de prueba se puede usar nada más crearla, sin verificar la empresa; en él no se mueve dinero):

1. En el Dashboard, entra en el **entorno de prueba** y copia la **clave secreta de prueba** (`sk_test_…`) de *Developers → API keys*.
2. Copia `.env.example` a `.env` y pega la clave en `STRIPE_SECRET_KEY`. El `.env` está en `.gitignore`: **nunca lo subas** (el repo es público). El adaptador rechaza cualquier clave que no empiece por `sk_test_`.
3. Ejecuta:
   ```bash
   cd spikes/sp01-pagos
   npm install              # instala stripe@23.0.0 (solo en esta carpeta)
   npm run prototipo:stripe
   ```
4. Revisa los pagos en el Dashboard (modo test → Pagos): deberían verse los PaymentIntents «No capturado», «Cancelado», capturados parcialmente y reembolsados.

Cosas que hay que comprobar en esa prueba, porque aquí no se han podido verificar:
- Que la tarjeta guardada con `setup_future_usage` en el primer PaymentIntent (todavía sin capturar) se puede usar enseguida con `off_session` para autorizar la fianza.
- El valor real de `capture_before` de la fianza: al ser un cobro iniciado por el comercio (`off_session`), en Visa puede ser de unos 4 días y 18 horas en lugar de 7 días. El service usa ese valor, así que la decisión «autorizar o cobrar» se adapta sola.
- Los códigos de error exactos de Stripe al capturar dos veces (se espera `payment_intent_unexpected_state`).
