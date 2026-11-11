# ADR 0006 · Armario del barrio: códigos QR de un solo uso

- **Estado:** Propuesto (11/11/2026), pendiente de revisión del equipo
- **Fecha:** 11/11/2026
- **Responsable:** Max (spike SP-05, #94)
- **Relacionado:** [ADR 0001](0001-stack.md), [ADR 0004](0004-tiempo-real.md), [ADR 0005](0005-mapas-geolocalizacion.md), [`docs/modelo-datos.md`](../modelo-datos.md) (`entrega`, `punto_recogida`), prototipo en [`spikes/sp05-armario-qr/`](../../spikes/sp05-armario-qr/)

> Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026.

## Contexto

La historia que usa este spike es **US-05.03 Recoger en el «armario del barrio» con QR (#68)**, «si da tiempo» (en el spike se citaba como US-21, de la numeración antigua). Sus criterios:

- Cuando el propietario deposita, el arrendatario recibe un QR.
- Escanear (o introducir) el código cambia el estado de la entrega a **Recogida** e **invalida** el QR.
- La devolución sigue el mismo flujo en sentido inverso.

Encaja con **US-05.01 (#66)**, que ya ofrece el modo `punto_recogida` y crea las filas de `entrega` (y las tablas `punto_recogida` y `entrega`), y con **US-05.02 (#67)**, que define los estados de la entrega (`pendiente | asignada | recogida | en_camino | entregada`).

La pregunta del spike: **¿cómo simulamos de forma creíble en la demo una taquilla de barrio con códigos QR de un solo uso (generación, escaneo desde el móvil, invalidación)?** No existe taquilla física: la «taquilla» es software, y lo que hay que hacer creíble es el código.

## Opciones

| Opción | Cómo funciona | A favor | En contra |
|---|---|---|---|
| **A. QR con URL + token aleatorio de un solo uso** | El QR contiene `https://…/abrir?c=<token>` (128 bits aleatorios). En la BD solo se guarda su hash SHA-256, con caducidad y `usado_en`. | La cámara nativa del móvil lo abre sin app. Mismo patrón que las sesiones (AGENTS.md). Se puede revocar y se invalida con un `UPDATE`. Sin datos personales en el QR. | Hay que consultar la BD (no es offline). Un `GET` que consume el código es frágil ante previsualizadores de enlaces. |
| **B. PIN numérico** (6 dígitos) | La persona lo teclea en la pantalla de la taquilla. | Sirve sin cámara ni móvil; es el «introducir el código» del criterio. | Solo 10⁶ combinaciones: hace falta limitar intentos con cuidado. Peor demo. |
| **C. QR con carga firmada (HMAC / JWT)** | El QR lleva `entrega + taquilla + caducidad` firmados con un secreto. | La taquilla podría validarlo **sin conexión**. | Un QR firmado sin estado **no se puede invalidar** sin guardar algo de todas formas. AGENTS.md prohíbe introducir JWT. Gestionar el secreto y su rotación. QR más grande. |
| **D. QR estático pegado en la taquilla**, que escanea el usuario | El usuario escanea el QR de la taquilla y su sesión demuestra quién es. | No hay códigos que generar. | Cualquiera puede fotografiar el QR; obliga a tener sesión abierta en el móvil y a decidir en la taquilla a quién se abre. Es la opción menos «un solo uso». |

### Cómo se lee el QR

| Opción | A favor | En contra |
|---|---|---|
| **Cámara nativa del móvil** | iOS y Android abren un QR con URL sin instalar nada ni dar permisos a la web. Funciona aunque la página sea `http://`. | La app no controla la lectura: se llega a la página por el enlace. |
| **`BarcodeDetector` + `getUserMedia` en la web** | Lectura dentro de nuestra app. | `getUserMedia` exige **HTTPS**. `BarcodeDetector` no está en Safari ni en Firefox y es experimental. Habría que dar alternativa de todos modos. |

### Cómo se dibuja el QR

| Opción | Nota |
|---|---|
| **Librería JS** (en el prototipo, `qrcode-generator` 1.4.4 desde cdnjs, con SRI) | Una función; coste cero. En el prototipo **no es una dependencia del proyecto**. |
| **Codificador propio** | Fuera del timebox y no aporta nada. |

## Decisión

1. **Opción A (QR con URL + token de un solo uso) como mecanismo principal, y la B (código manual) como alternativa del mismo código.** El criterio de la historia dice «escanear (o introducir)»: el token de 128 bits no se puede teclear, así que en la pantalla se muestra además un **código corto de 8 caracteres** (alfabeto sin 0/O/1/I) que se valida por el mismo servicio, **con un límite de intentos más estricto**. En el prototipo solo está el QR; el código corto queda para la historia.
2. **Lectura con la cámara nativa del móvil.** No se construye escáner en la web. `BarcodeDetector` queda descartado salvo que algún día se sirva con HTTPS y se acepte que Safari no lo tiene.
3. **Generación del QR en el frontend**, con una librería de QR pequeña. En el prototipo es `qrcode-generator` 1.4.4 por cdnjs; **en la implementación real habría que añadir una librería (p. ej. `qrcode-generator` o `qrcode`) a `frontend/`**, y como toda dependencia nueva **hay que acordarla con el equipo** (AGENTS.md).
4. **Modelo de datos** (el nombre de las columnas sigue `docs/modelo-datos.md`; el de los modelos Prisma, AGENTS.md). Se propone una **tabla nueva `codigo_entrega`** en lugar de columnas en `entrega`, porque una entrega puede necesitar **varios códigos** (depositar, recoger; y la devolución en sentido inverso es otra `entrega`) y porque así se pueden regenerar sin perder historial:

   | Campo | Tipo | Nota |
   |---|---|---|
   | `id` | id PK | |
   | `entrega_id` | id FK | La entrega a la que abre. |
   | `proposito` | enum `deposito \| recogida` | Quién lo usa: el propietario (deposita) o el arrendatario (recoge). |
   | `codigo_hash` | texto UK | SHA-256 del token. **Nunca el token.** |
   | `caduca_en` | fecha_hora | Ahora + 24 h (valor del prototipo; lo decide el equipo, ver Pendiente). |
   | `usado_en` | fecha_hora, nulo | `NULL` hasta que se consume. |
   | `creado_en` | fecha_hora | |

   Y en `punto_recogida`, un **identificador de taquilla/casilla** (p. ej. `entrega.casilla`, entero, o un campo en `punto_recogida`); el prototipo usa «Taquilla 3». Reutilizar `entrega.codigo_entrega` (que existe para el rider) **no** sirve: es un único texto en claro y no tiene caducidad ni `usado_en`.
5. **Quién ve el QR.** Lo ve **solo el arrendatario** (recoger) y el **propietario** (el suyo, para depositar), cada uno en su pantalla de la reserva y solo con la reserva en el estado correspondiente. Se muestra con una consulta autenticada (`requireAuth`), nunca se manda por email ni notificación con el token dentro (a lo sumo, un aviso «ya tienes el código en la app»).
6. **Consumir el código, de forma atómica y en dos pasos.**
   - `GET /abrir?c=<token>` **no cambia nada**: enseña una pantalla de confirmación «Abrir taquilla 3» (así un previsualizador de enlaces no gasta el código).
   - `POST` desde esa pantalla ejecuta un único `UPDATE codigo_entrega SET usado_en = now() WHERE codigo_hash = $1 AND usado_en IS NULL AND caduca_en > now() RETURNING entrega_id`. Si devuelve una fila, **en la misma transacción** se pasa la entrega a `recogida` (US-05.02). Si no, se mira por qué (usado, caducado o inexistente) para el mensaje: «Este código ya se ha usado», «Este código ha caducado» o «Código no válido». Con este `UPDATE`, dos escaneos a la vez no pueden ganar los dos.
   - ¿Quién puede confirmar? En la demo, cualquiera que tenga el QR (el QR **es** la credencial, como en una taquilla real). Exigir además sesión es posible, pero pierde la gracia de «sin app».
7. **Seguridad.**
   - **Un solo uso y caducidad** (arriba).
   - **128 bits aleatorios** de `node:crypto`, en la BD solo el hash. **Reutilizar `hashToken` de `sessionService.ts`** en vez de crear una segunda forma de hashear tokens (AGENTS.md).
   - **Sin datos personales en el QR**: solo el token. No hay nombre, ni ids de reserva, ni la dirección.
   - **Límite de intentos** en el endpoint de consumo (el prototipo: 30/min por IP). Con 128 bits no hay fuerza bruta posible; el límite importa para el código corto.
   - **No registrar el token** en los logs (el prototipo solo escribe el resultado).
   - Al **regenerar** un código, se invalida el anterior de esa entrega y propósito.
8. **Encaje con las historias.**
   - **US-05.01:** el modo `punto_recogida` ya guarda `punto_recogida_id` en la `entrega`; US-05.03 añade la casilla y los códigos.
   - **US-05.02:** consumir el código del arrendatario es **el cambio de estado `recogida`** (mismo servicio de transición, mismas reglas: no se salta estados). Al depositar el propietario, la entrega pasa a «lista para recoger» sin un estado nuevo (se puede indicar con el código `deposito` usado, sin tocar el enum).
   - **Tiempo real** (ADR 0004): al abrir, el propietario ve el cambio por SSE sin recargar.
   - **Devolución:** una `entrega` con `sentido = vuelta` y el flujo al revés (el arrendatario deposita, el propietario recoge) con otro par de códigos.

## Consecuencias

- **Coste cero y sin app.** Funciona con la cámara de cualquier móvil.
- **Dependencia nueva en el frontend** (librería de QR) cuando se implemente la historia: hay que acordarla en equipo. El backend no necesita ninguna.
- **Migración nueva** (`codigo_entrega`, más la casilla). Va en la tarea de backend de US-05.03, no en una rama aparte (AGENTS.md).
- **HTTPS ya está en producción** (Vercel/Render), así que la URL del QR funciona; en local y en la demo sobre la Wi-Fi basta con `http://IP-LAN` porque se lee con la cámara nativa.
- **Riesgos:**
  - El `GET` que consume el código es frágil (previsualizadores); por eso la decisión 6 lo hace en dos pasos. El prototipo **no** lo hace así, para que escanear y ver «abierta» sea directo.
  - Un QR que se fotografía o se reenvía abre la taquilla a quien lo tenga: es inherente a una credencial al portador. Mitiga la caducidad corta y el aviso al propietario al abrirse.
  - Redes Wi-Fi con aislamiento de clientes impiden la demo en vivo desde el móvil; conviene llevar un punto de acceso propio o una captura/vídeo.
- **Lo que enseña la demo:** la taquilla «real» es una pantalla web (la del portátil), y la puerta se «abre» en ella al escanear.

## Pendiente

- Que el equipo decida la **caducidad** (24 h en el prototipo; tal vez desde la hora de entrega elegida en US-05.01) y si el propietario recibe un aviso al abrirse.
- Decidir si el **código corto** va en la primera versión o se deja fuera (US-05.03 es «si da tiempo»).
- Acordar la **librería de QR** del frontend.
- Probar el prototipo con un **móvil real** en la Wi-Fi de la demo (no se ha podido comprobar en este spike).
- US-05.03 sigue sin tareas ni wireframe: hay que crearlo (norma del #162) antes de programar pantallas.
- Si prospera, escribir el flujo de devolución y el estado de la casilla (libre/ocupada) en el modelo.
