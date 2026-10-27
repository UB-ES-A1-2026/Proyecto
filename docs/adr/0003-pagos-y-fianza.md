# ADR 0003 · Pagos y fianza

- **Estado:** Propuesto (25/10/2026), pendiente de revisión del equipo
- **Fecha:** 25/10/2026 · actualizado el 27/10/2026 con la revisión de Francesc en #168 (idempotencia por intento, pagos simultáneos, errores de la pasarela, compensación y reembolso parcial)
- **Responsable:** Marc (spike SP-01, #90)
- **Relacionado:** [ADR 0001](0001-stack.md), [`docs/modelo-datos.md`](../modelo-datos.md) (`pago`, `incidencia`), US-07.01 (#72), US-04.05 (#64), US-09.01 (#76), US-09.02 (#77), US-11.01 (#80), prototipo en [`spikes/sp01-pagos/`](../../spikes/sp01-pagos/)

> Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 25/10/2026.

## Contexto

El pago con fianza aparece en varias historias:

- **US-07.01 Registrar un pago** (#72, Sprint 2): solo se paga una solicitud **aceptada**; antes de pagar se ve el desglose (objeto, fechas, alquiler, fianza y total); el usuario elige el método de pago y pulsa «Pagar»; si va bien, la reserva pasa a «Pagado»; si se rechaza, no se marca como pagada y se muestra un error; **una reserva pagada no vuelve a pedir el pago**.
- **US-04.05 Cancelar una solicitud** (#64, Sprint 3): si ya hay rider asignado, se cobra la entrega.
- **US-09.01 Abrir una incidencia** (#76, Sprint 3): al abrirla, **la fianza pasa a «Retenida»**.
- **US-09.02 Check-in / check-out con fotos** (#77, Sprint 3): la devolución sin problemas cierra el alquiler.
- **US-11.01 Panel de administración** (#80, Sprint 3): el admin resuelve la incidencia **liberando o reteniendo la fianza**.
- Si da tiempo: US-07.02 Historial y recibos (#73) y US-04.06 Ampliar un alquiler (#65, «nuevo cargo por la diferencia»).

La tabla `pago` (`importe_alquiler`, `importe_entrega`, `importe_fianza`, `estado` `pendiente | pagado | rechazado | reembolsado`, `estado_fianza` `retenida | liberada | ejecutada`, `referencia_pasarela`) entra en el Sprint 2 (10/11 → 24/11).

La pregunta del spike: **¿pasarela simulada propia o Stripe en modo test (PaymentIntent con captura manual para la fianza)? ¿Cuánto cuesta integrarlo en el Sprint 2/3?** Condiciones: coste cero, repo público (ningún secreto), backend en Render gratuito (se duerme tras 15 minutos sin tráfico, tarda alrededor de un minuto en despertar y **no tiene tareas programadas ni workers** en el plan gratuito), tests e2e en el CI (#99) y 6 personas con 2 sprints por delante.

## Qué dice Stripe (comprobado el 25/10/2026)

| Tema | Dato | Qué implica para Rentit |
|---|---|---|
| Cuenta y modo test | Al crear la cuenta se entra en un **entorno de prueba** con claves de prueba; la verificación de la empresa solo hace falta para cobrar de verdad. En el entorno de prueba no se mueve dinero ni se procesan tarjetas reales. | Coste 0. No hemos creado la cuenta: **no hemos comprobado** si pide tarjeta o datos al registrarse (ver «Riesgos»). |
| España | Es un país admitido. Tarifa real (solo si algún día se cobrara de verdad): 1,5 % + 0,25 € por tarjeta estándar del EEE; sin cuotas mensuales. | En modo test todo es gratis. |
| Retención (autorización sin capturar) | Se pide con `capture_method: 'manual'`. En pagos con tarjeta en línea dura **7 días** en general; en Visa iniciada por el comercio (cobro *off-session*), **5 días** (4 días y 18 horas en la práctica). El plazo real de cada pago está en `capture_before`. Si caduca, el PaymentIntent pasa a `canceled` y **los fondos se liberan solos**. | Un alquiler (más el margen para revisar la devolución) que acabe más tarde que la retención **se queda sin fianza** si solo está autorizada. |
| Retención ampliada | Hasta 30 días, pero se ofrece a cuentas con tarifa IC+ (con la tarifa estándar hay que pedirlo a soporte). Algunas redes la limitan a ciertos sectores (hoteles, alquiler de vehículos…), en Visa fuera de esos sectores cuesta un 0,08 % más, y las normas de las redes suelen reservarla a los casos en que no se conoce el importe final. | No es una opción para nosotros. |
| Captura | Se captura **una sola vez**. Con `amount_to_capture` se captura menos de lo autorizado y **el resto se libera automáticamente**. La multicaptura solo existe para algunos pagos. | «Ejecutar parte de la fianza» = captura parcial, pero solo una vez. |
| Reembolsos | Totales o parciales de lo cobrado. Cobrando de verdad, las comisiones del pago original no se devuelven. | Cancelaciones y devolución de una fianza cobrada. |
| Webhooks | No llegan necesariamente en orden y pueden repetirse. En el entorno de prueba, si fallan, se reintentan **3 veces en unas pocas horas** (en real, hasta 3 días). Hay que verificar la firma con el cuerpo sin procesar. | Con Render dormido, el primer intento puede fallar. Con tarjeta el resultado de la autorización es inmediato: **no los necesitamos**. |
| Idempotencia | Cabecera `Idempotency-Key`: la misma clave devuelve la misma respuesta (durante al menos 24 horas); con otros parámetros da error. | Protege del doble clic y de los reintentos de red. |
| Tarjetas de prueba | `4242 4242 4242 4242` / `pm_card_visa` (aprobada), `4000 0000 0000 0002` / `pm_card_visa_chargeDeclined` (rechazada), `4000 0000 0000 9995` / `pm_card_visa_chargeDeclinedInsufficientFunds` (sin fondos), y tarjetas que piden 3D Secure. | Usamos **los mismos identificadores** en la pasarela simulada. |
| Tarjeta guardada | Para cobrar o autorizar más tarde sin el usuario (*off-session*), la tarjeta se guarda con `setup_future_usage`. Por la normativa SCA, el banco puede pedir autenticación y entonces el pago falla. | La segunda autorización (la fianza) puede fallar aunque la primera haya ido bien. |
| Pagar al propietario | Repartir el dinero entre usuarios es **Stripe Connect** (otra integración). | Fuera del alcance del curso: el reparto solo se registra. |

## Opciones

| Opción | A favor | En contra |
|---|---|---|
| **A. Pasarela simulada propia** detrás de una interfaz | Sin cuentas, claves ni dependencias. Determinista: los e2e y el CI no dependen de un tercero ni de la red. La demo no falla por Stripe. Nosotros fijamos las reglas (y las copiamos de Stripe). | No es una pasarela real. Si las reglas se copian mal, el paso a Stripe da sorpresas. Su estado tiene que guardarse en la BD (Render se reinicia al dormirse). |
| **B. Stripe en modo test** con PaymentIntent y captura manual | Integración real, con panel (Dashboard) para enseñar los pagos en la demo. 3D Secure real. | Cuenta y claves en Render y en el CI. 3 dependencias nuevas (`stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`). El formulario de Stripe va en un iframe de otro dominio: los e2e se complican y dependen de la red. Hay que gestionar la caducidad a los 7 días, dos PaymentIntents con tarjeta guardada y la autenticación 3D Secure. |
| **C. Stripe con SetupIntent** (guardar la tarjeta y cobrar solo si hay daños) | No hay caducidad: sirve para alquileres largos. | No es una fianza de verdad: no se retiene nada y el cobro posterior puede fallar (sin fondos, autenticación) justo cuando hace falta. |
| **D. Cobrar siempre la fianza** y reembolsarla al final | Lo más sencillo; sin caducidad. | Con dinero real, el usuario ve un cargo (no una retención), el reembolso tarda días y las comisiones no se devuelven. |

## Decisión

Recomendamos **A ahora y B como mejora opcional**, con las reglas de fianza de B (autorizar) y de D (cobrar) según la duración del alquiler:

1. **Contrato `PaymentProvider`** en `backend/src/repositories/paymentGateway.ts`, el único fichero que conoce la pasarela (como `photoStorage.ts` en el ADR 0002). Operaciones: `authorize` (alquiler + entrega y fianza), `captureRent`, `secureDeposit` (cobrar la fianza entera), `releaseDeposit`, `executeDeposit(importe)` y `refund(importe)`. Los importes van en **céntimos enteros**. El método de pago es un identificador (`pm_…`), **nunca el número de la tarjeta**.
2. **Sprint 2: pasarela simulada** (`SimulatedPaymentProvider`), la única que se usa en local, en el CI, en los e2e y en la demo. Reproduce las reglas de Stripe de la tabla anterior: 7 días de retención, una sola captura, captura parcial que libera el resto, reembolsos hasta lo cobrado e idempotencia. **Su estado se guarda en la BD**, no en memoria: Render gratuito se reinicia al dormirse y se perdería entre el pago y la devolución. La pasarela se elige con `PAYMENT_PROVIDER=simulated | stripe` (por defecto, `simulated`).
3. **Pantalla de pago en modo simulado:** el usuario elige una de las tres **tarjetas de prueba** («Visa de prueba 4242 (aprobada)», «… 0002 (rechazada)», «… 9995 (sin fondos)»), que se envían con los identificadores de Stripe (`pm_card_visa`…). No se teclea ningún número y la pantalla avisa de que es un pago simulado, sin dinero real. Así se cumple «el usuario puede seleccionar el método de pago disponible» (US-07.01).
4. **Reglas del pago y la fianza** (en el service; valen igual con las dos pasarelas):
   1. **Pagar:** se autorizan alquiler + entrega y la fianza. Si cualquiera falla, no se cobra nada: el pago queda `rechazado`, la reserva sigue `aceptada` (puede reintentar) y la API responde 402 con el mensaje. Si las dos van bien, se cobra alquiler + entrega: pago `pagado`, reserva `pagada`, `estado_fianza = retenida`.
   2. **¿Autorizar o cobrar la fianza?** Si la retención (`capture_before`) llega hasta `fecha_fin` + **2 días** de margen (para el check-out y para abrir una incidencia), la fianza queda **autorizada sin cobrar**. Si no, se **cobra** al pagar y se reembolsa al final. Con 7 días de retención, se autoriza en los alquileres que acaban hasta 5 días después del pago, que serán la mayoría en un alquiler entre vecinos. Para el usuario, en los dos casos la fianza está «Retenida».
   3. **Abrir una incidencia** (US-09.01): si la fianza solo estaba autorizada, se **cobra entera y queda en custodia**, para que no caduque mientras decide el admin.
   4. **Devolución sin incidencias** (US-09.02): se libera la fianza (se anula la autorización o se reembolsa) → `liberada`.
   5. **El admin resuelve** (US-11.01) con un importe de daños entre 0 y la fianza: 0 → `liberada`; más de 0 → `ejecutada` (captura parcial si estaba autorizada, o reembolso de la diferencia si estaba cobrada).
   6. **Cancelar una reserva pagada** (US-04.05): se reembolsa el alquiler, y también la entrega si aún no hay rider; se libera la fianza → `reembolsado` si se devuelve todo, o `reembolsado_parcial` si se cobra la entrega (rider asignado). La cantidad está en `importe_reembolsado`.
   7. **Idempotencia, una clave por intento:** el frontend genera una clave al abrir la pantalla de pago y **otra nueva después de cada error** (402, 409 o 502), y la manda en la cabecera `Idempotency-Key`. Solo un reintento automático de la *misma* petición (p. ej., por un corte de red) repite la clave. Si se reutilizara la clave de un intento rechazado con otra tarjeta, la pasarela diría `idempotency_key_reused` y el reintento fallaría (lo detectó Francesc en #168; está en el escenario 2 del prototipo). Si la reserva ya está pagada, la API responde **409** y no vuelve a cobrar (último criterio de US-07.01). Cada llamada a la pasarela lleva su propia clave.
   8. **Dos peticiones a la vez** (doble clic rápido o dos pestañas): antes de llamar a la pasarela, el pago pasa a `procesando` con un `UPDATE` condicional dentro de una transacción (`… SET estado = 'procesando' WHERE reserva_id = $1 AND estado IN ('pendiente', 'rechazado')`, junto con la restricción única que ya tiene `pago.reserva_id`). Si no se actualiza ninguna fila, la otra petición responde **409** «Ya hay un pago en curso para esta reserva.». Así solo hay una autorización (escenario 7).
   9. **Si la pasarela falla a mitad** (autoriza pero falla el cobro del alquiler o de la fianza): **compensación**. Se anulan las dos operaciones (`voidPayment`: anula la autorización o reembolsa lo cobrado), el pago queda `rechazado` con el motivo, la reserva sigue `aceptada` y la API responde **502**. Si ni siquiera se puede anular, la autorización caduca sola a los 7 días (escenario 8).
   10. **Errores de la pasarela → HTTP:** el service traduce todos los errores de la pasarela, para que nunca acaben en un 500:

       | Error de la pasarela | HTTP | Mensaje |
       |---|---|---|
       | Tarjeta rechazada o sin fondos (`{ ok: false }`) | 402 | El de la pasarela («La tarjeta ha sido rechazada…») |
       | `idempotency_key_reused` | 409 | «Este intento de pago ya se usó. Vuelve a pulsar «Pagar».» |
       | `authorization_expired` | 409 | «La retención de la fianza ha caducado.» |
       | `already_captured`, `invalid_state` | 409 | «Este pago ya se ha cobrado.» / «El pago no permite esta operación en su estado actual.» |
       | `amount_too_large`, `invalid_amount`, `invalid_payment_method` | 400 | «El importe no es válido…» / «El método de pago no es válido.» |
       | Cualquier otro (red, *timeout*, `not_found`…) | 502 | «La pasarela de pago no responde. Inténtalo de nuevo en unos minutos.» |
5. **Sin webhooks ni tareas programadas.** Con tarjeta, la pasarela responde en la misma petición; todas las decisiones se toman cuando un usuario hace algo (pagar, abrir incidencia, devolver, resolver, cancelar). Render gratuito no permite tareas programadas, y por eso existen el margen de la regla 4.2 y la custodia de la regla 4.3.
6. **Sprint 3, si da tiempo: adaptador de Stripe en modo test** (`StripePaymentProvider`, ya escrito en el prototipo), activado solo en el despliegue con `PAYMENT_PROVIDER=stripe`. **El CI y los e2e siguen siempre con la pasarela simulada.** Usa dos PaymentIntents con `capture_method: 'manual'`: alquiler + entrega (confirmado con la tarjeta del usuario, que se guarda) y fianza (autorizada con la tarjeta guardada). Antes hay que aprobar las 3 dependencias y crear la cuenta del equipo. El adaptador rechaza cualquier clave que no sea `sk_test_…`.
7. **Fuera del alcance:** dinero real, pagar al propietario o al rider (Stripe Connect) y los recibos en PDF (US-07.02).

## Cómo encaja en el código (cuando se implemente US-07.01)

- `backend/src/config/`: `PAYMENT_PROVIDER` y, solo si se usa Stripe, `STRIPE_SECRET_KEY` (en `.env.example` sin valor; la real, solo en Render). En el frontend, `VITE_STRIPE_PUBLISHABLE_KEY`, que es pública.
- `backend/src/repositories/paymentGateway.ts`: la interfaz y la función que elige la implementación. `simulatedPaymentGateway.ts` guarda su estado en la BD; `stripePaymentGateway.ts`, en el Sprint 3, es el único fichero que importa `stripe`.
- `backend/src/repositories/paymentRepository.ts`: la tabla `pago`. La BD guarda `decimal(10,2)` y aquí se convierte a céntimos (nunca con `float`).
- `backend/src/services/paymentService.ts`: las reglas de la decisión 4 (el prototipo es la referencia: `spikes/sp01-pagos/paymentService.mjs`), con tests unitarios contra la pasarela simulada y un reloj falso.
- Endpoints previstos: `GET /api/reservas/:id/pago` (desglose) y `POST /api/reservas/:id/pago` con `{ paymentMethod }` y la cabecera `Idempotency-Key` → 201 si va bien, 402 si se rechaza, 409 si la reserva no está aceptada, ya está pagada o hay otro pago en curso, y 400/409/502 según la tabla de la regla 4.10. El cambio a `procesando` (regla 4.8) va en `paymentRepository` dentro de una transacción de Prisma (`$transaction` con `updateMany` condicional). Las incidencias, la devolución y la cancelación llaman al service desde sus propios endpoints. Los nombres finales los fija BE en su PR.
- Frontend: `frontend/src/services/paymentService.ts` y la pantalla de pago con el desglose (alquiler, entrega, fianza, total y «retenida hasta…» o «se devuelve al final»).
- e2e (`e2e/tests/pago.spec.ts`): un test por criterio de US-07.01 eligiendo las tarjetas de prueba por su etiqueta, sin red externa ni secretos en el CI.

## Consecuencias

**Positivas**
- US-07.01 no depende de crear cuentas ni de claves: se puede empezar el primer día del Sprint 2.
- Los e2e y el CI son deterministas y no necesitan secretos; la demo no depende de Stripe ni de la red.
- Las reglas son las de Stripe y los identificadores de las tarjetas también, así que pasar a Stripe solo cambia la implementación de la interfaz.
- Cubrimos con las mismas reglas las historias del Sprint 3 (incidencias, panel de admin y cancelación), sin depender de tareas programadas.

**Negativas / riesgos**
- **No es una pasarela real.** Si el profesor valora la integración con un servicio externo, el adaptador de Stripe (decisión 6) es la respuesta, pero solo si sobra capacidad en el Sprint 3.
- **Retrasos en la devolución:** si la fianza solo está autorizada y el objeto se devuelve más de 2 días tarde, la retención puede caducar. El propietario debe abrir una incidencia de «retraso» antes (la pantalla mostrará «Fianza retenida hasta el …»).
- **Alquileres largos:** la fianza se cobra y se reembolsa. En modo test no importa; con dinero real sería peor para el usuario.
- **Con Stripe:** la autorización de la fianza *off-session* puede pedir 3D Secure y fallar aunque el alquiler haya ido bien (el adaptador anula entonces el alquiler); la autenticación 3D Secure en el frontend (`handleNextAction`) no está en el prototipo; y el formulario de Stripe no se cubre con e2e.
- **Por comprobar al crear la cuenta de Stripe:** que el registro no pide tarjeta. Un foro de usuarios (mayo de 2025) dice que el modo test exigía verificar la empresa, lo que contradice la documentación oficial. Stripe también ofrece entornos de prueba anónimos desde la CLI (`stripe sandbox create`), pero parece estar en vista previa.
- **El adaptador de Stripe no se ha ejecutado** (no hay claves). En su primera ejecución hay que comprobar los tres puntos que indica el README del prototipo.

**Cambios propuestos en `docs/modelo-datos.md`** (no se editan en este spike; se deciden en la revisión y los aplica quien haga la migración de `pago` en el Sprint 2):
- `pago.referencia_pasarela`: aclarar que es la referencia del cobro de **alquiler + entrega**.
- `pago.referencia_fianza` (texto): referencia de la retención de la fianza, que es otra operación en la pasarela.
- `pago.modo_fianza` (enum `autorizada | cobrada`): regla 4.2.
- `pago.fianza_retenida_hasta` (fecha y hora, null si está cobrada): el `capture_before` de la pasarela; se enseña en la pantalla.
- `pago.importe_fianza_ejecutado` (decimal, por defecto 0) e `pago.importe_reembolsado` (decimal, por defecto 0): las ejecuciones y los reembolsos parciales.
- `pago.motivo_rechazo` (texto, null) y `pago.actualizado_en` (fecha y hora).
- `pago.estado_fianza` admite null mientras el pago no está completado.
- `pago.estado` añade dos valores: `procesando` (regla 4.8) y `reembolsado_parcial` (regla 4.6). La restricción única de `pago.reserva_id`, que ya está en el modelo, se mantiene: un reintento reutiliza la misma fila.
- Tablas técnicas de la pasarela simulada (solo con `PAYMENT_PROVIDER=simulated`): `pasarela_simulada` (`referencia` PK, `tipo` `alquiler | fianza`, `importe`, `importe_capturado`, `importe_reembolsado`, `estado` `requires_capture | succeeded | canceled`, `capturar_antes_de`, `creado_en`) y `clave_idempotencia` (`clave` PK, `huella` de los parámetros, `respuesta` JSON, `creada_en`).

## Coste de integración (estimación para el planning poker)

**Sprint 2 · US-07.01 (#72)**, con las tareas que ya tiene la historia:

| Tarea | Qué incluye | Estimación |
|---|---|---|
| (DevOps+BE · Max) Pasarela simulada | Interfaz `PaymentProvider`, pasarela simulada con su estado en la BD, `PAYMENT_PROVIDER` y tests de las reglas (portar el prototipo a TypeScript) | 6 h |
| (BE · Francesc) Modelo de pagos y paso a «Pagado» | Migración de `pago` con los campos propuestos, `paymentService` (402/409, idempotencia, regla de la fianza), endpoints y tests con Supertest | 8 h |
| (FE · Kai) Pantalla de pago | Desglose, selector de tarjeta de prueba, errores, estado «Pagado» y tests | 6 h |
| (QA · Danyal) e2e | Pago correcto, rechazado y ya pagado, y sus casos de prueba en `docs/testing.md` | 4 h |

Unas **24 horas**. Proponemos **5 puntos** para US-07.01 (del tamaño de US-09.01), a confirmar en el planning poker.

**Sprint 3:** no hacen falta historias nuevas; cada historia suma una llamada al service y su test:

| Historia | Qué se añade | Estimación |
|---|---|---|
| US-09.01 (#76) | Al abrir la incidencia, `secureDeposit` | +1 h |
| US-09.02 (#77) | Devolución sin incidencias, `releaseDeposit` | +1 h |
| US-11.01 (#80) | Resolver con un importe: `releaseDeposit` o `executeDeposit`, y el campo del importe en el panel | +3 h |
| US-04.05 (#64) | Cancelación: `refund` y `releaseDeposit` | +2 h |
| QA | e2e de la fianza retenida, ejecutada y liberada (dentro de las tareas de QA de #76 y #80) | +2 h |

**Opcional en el Sprint 3 («si da tiempo»), una tarea técnica nueva: Stripe en modo test.** Adaptador de backend (6 h), Payment Element y 3D Secure en el frontend (6 h), y cuenta, claves en Render/Vercel y prueba manual documentada (2 h): unas **14 horas, unos 5 puntos**, más la aprobación de las 3 dependencias. Hacerlo directamente con Stripe en el Sprint 2 sumaría esas 14 horas a las 24 de US-07.01 y la dejaría bloqueada hasta tener la cuenta y las claves.

## Prototipo del spike

`spikes/sp01-pagos/` (independiente del backend; ver su README). Sin dependencias, recorre con un reloj simulado:
1. El camino feliz: pago, doble clic (409), reintento con la misma clave, reinicio del servidor y devolución con la autorización anulada.
2. Tarjeta rechazada y sin fondos (402, la reserva sigue aceptada), reintento correcto y pago de una solicitud pendiente (409).
3. Daño: incidencia con la fianza en custodia y ejecución de 30 € de 50 € (se reembolsan 20 €), aunque el admin tarde más de 7 días.
4. Un alquiler de 10 días: la fianza se cobra al pagar y se reembolsa al devolver.
5. La cancelación con rider asignado: se reembolsa el alquiler y se cobra la entrega.
6. Las reglas de Stripe: captura parcial, doble captura, idempotencia y caducidad a los 8 días.
7. Dos peticiones de pago a la vez: una paga y la otra recibe 409.
8. La pasarela falla después de autorizar: compensación (las dos autorizaciones anuladas), 502 y reintento correcto con una clave nueva.

Se ha ejecutado con la pasarela simulada (25 comprobaciones correctas; la salida está en el README. Las de la revisión de #168 fallan si se quita su arreglo). El adaptador de Stripe y su script están escritos, pero **no se han ejecutado**.

## Fuentes consultadas (25/10/2026)

- Stripe, retención y captura: [Retener fondos de un método de pago](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method), [Retención ampliada](https://docs.stripe.com/payments/extended-authorization), [Capturar un PaymentIntent](https://docs.stripe.com/api/payment_intents/capture).
- Stripe, pruebas: [Entornos de prueba](https://docs.stripe.com/sandboxes), [Casos de uso de prueba](https://docs.stripe.com/testing-use-cases), [Tarjetas de prueba](https://docs.stripe.com/testing), [Configurar la cuenta](https://docs.stripe.com/get-started/account/set-up), [CLI `stripe sandbox`](https://docs.stripe.com/cli/sandbox).
- Stripe, integración: [Webhooks](https://docs.stripe.com/webhooks), [Peticiones idempotentes](https://docs.stripe.com/api/idempotent_requests), [Guardar la tarjeta durante el pago](https://docs.stripe.com/payments/save-during-payment?payment-ui=elements).
- Stripe, país y precios: [Países admitidos](https://stripe.com/global), [Tarifas en España](https://stripe.com/es/pricing).
- Render, plan gratuito: [Free instances](https://render.com/docs/free).
- Informe de usuarios sobre la verificación en modo test (no oficial): [foro de RevenueCat](https://community.revenuecat.com/third-party-integrations-53/revenuecat-don-t-recognized-stripe-products-that-are-in-the-stripe-sandbox-6337).
