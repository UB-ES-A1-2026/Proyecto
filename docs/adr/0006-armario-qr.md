# ADR 0006 · Armario del barrio: códigos QR de un solo uso

- **Estado:** Propuesto (11/11/2026), pendiente de revisión del equipo
- **Fecha:** 11/11/2026
- **Responsable:** Max (spike SP-05, #94)
- **Relacionado:** [ADR 0001](0001-stack.md), [ADR 0004](0004-tiempo-real.md), [ADR 0005](0005-mapas-geolocalizacion.md), [`docs/modelo-datos.md`](../modelo-datos.md) (`entrega`, `punto_recogida`), prototipo en [`spikes/sp05-armario-qr/`](../../spikes/sp05-armario-qr/)

> Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026.

## Contexto

La historia que usa este spike es **US-05.03 Recoger en el «armario del barrio» con QR (#68)**, «si da tiempo» (antes US-21). Sus criterios:

- Cuando el propietario deposita, el arrendatario recibe un QR.
- Escanear (o introducir) el código cambia el estado de la entrega a **Recogida** e **invalida** el QR. (Con los estados de US-05.02 ese «Recogida» es el «Ya tengo el objeto» del arrendatario: entrega `entregada` y reserva «En curso»; ver decisión 8.)
- La devolución sigue el mismo flujo en sentido inverso.

Encaja con **US-05.01 (#66)**, que ya ofrece el modo `punto_recogida` y crea las filas de `entrega` (y las tablas `punto_recogida` y `entrega`), y con **US-05.02 (#67)**, que define los estados de la entrega (`pendiente | asignada | recogida | en_camino | entregada`). Para domicilio y punto de recogida (sin rider) solo hay **Pendiente de entrega → Entregada**, y el arrendatario pulsa «Ya tengo el objeto» para pasar la reserva a «En curso».

La pregunta del spike: **¿cómo simulamos de forma creíble en la demo una taquilla de barrio con códigos QR de un solo uso (generación, escaneo desde el móvil, invalidación)?** No existe taquilla física: la «taquilla» es software, y lo que hay que hacer creíble es el código.

## Opciones

| Opción | Cómo funciona | A favor | En contra |
|---|---|---|---|
| **A. QR con URL + token aleatorio de un solo uso** | El QR contiene `https://…/abrir?c=<token>` (128 bits aleatorios). En la BD solo se guarda su hash SHA-256, con caducidad y `usado_en`; el código corto va aparte, con HMAC (decisión 4). | La cámara nativa del móvil lo abre sin app. Mismo patrón que las sesiones (AGENTS.md). Se puede revocar y se invalida con un `UPDATE`. Sin datos personales en el QR. | Hay que consultar la BD (no es offline). Un `GET` que consume el código es frágil ante previsualizadores de enlaces. |
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

1. **Opción A (QR con URL + token de un solo uso) como mecanismo principal, y la B (código manual) como alternativa del mismo código.** El criterio de la historia dice «escanear (o introducir)»: el token de 128 bits no se puede teclear, así que en la pantalla se muestra además un **código corto de 8 caracteres** (alfabeto sin 0/O/1/I) que se valida por el mismo servicio, **con caducidad corta y un máximo de intentos fallidos** (decisión 7). En el prototipo solo está el QR; el código corto queda para la historia.
2. **Lectura con la cámara nativa del móvil.** No se construye escáner en la web. `BarcodeDetector` queda descartado salvo que algún día se sirva con HTTPS y se acepte que Safari no lo tiene.
3. **Generación del QR en el frontend**, con una librería de QR pequeña. En el prototipo es `qrcode-generator` 1.4.4 por cdnjs; **en la implementación real habría que añadir una librería (p. ej. `qrcode-generator` o `qrcode`) a `frontend/`**, y como toda dependencia nueva **hay que acordarla con el equipo** (AGENTS.md).
4. **Modelo de datos** (el nombre de las columnas sigue `docs/modelo-datos.md`; el de los modelos Prisma, AGENTS.md). Se propone una **tabla nueva `codigo_entrega`** en lugar de columnas en `entrega`, porque una entrega puede necesitar **varios códigos** (depositar, recoger; y la devolución en sentido inverso es otra `entrega`) y porque así se pueden regenerar sin perder historial:

   | Campo | Tipo | Nota |
   |---|---|---|
   | `id` | id PK | |
   | `entrega_id` | id FK | La entrega a la que abre. |
   | `proposito` | enum `deposito \| recogida` | Quién lo usa: el propietario (deposita) o el arrendatario (recoge). |
   | `codigo_hash` | texto UK | SHA-256 del token de 128 bits del QR (`hashToken`). **Nunca el token.** |
   | `codigo_corto_hmac` | texto, nulo | HMAC-SHA256 del código corto con un secreto del servidor. **Nunca el código corto en claro**, y **no** se usa `hashToken` (ver decisión 7). Índice único parcial sobre los códigos vigentes. |
   | `codigo_corto_caduca_en` | fecha_hora, nulo | Caducidad propia del código corto: ahora + 15 min (lo decide el equipo, ver Pendiente). |
   | `intentos_fallidos` | entero, por defecto 0 | Fallos con el código corto de esta entrega; a 5 se invalida (decisión 7). |
   | `caduca_en` | fecha_hora | Ahora + 24 h (valor del prototipo; lo decide el equipo, ver Pendiente). |
   | `usado_en` | fecha_hora, nulo | `NULL` hasta que se consume. |
   | `creado_en` | fecha_hora | |

   Y en `punto_recogida`, un **identificador de taquilla/casilla** (p. ej. `entrega.casilla`, entero, o un campo en `punto_recogida`); el prototipo usa «Taquilla 3». Reutilizar `entrega.codigo_entrega` (que existe para el rider) **no** sirve: es un único texto en claro y no tiene caducidad ni `usado_en`.
5. **Quién ve el QR y cuándo se genera.** Lo ve **solo el arrendatario** (recoger) y el **propietario** (el suyo, para depositar), cada uno en su pantalla de la reserva y solo con la reserva en el estado correspondiente. Como en la BD solo está el hash, **el QR no se puede volver a mostrar**: **cada vez que la persona abre la pantalla que enseña el código, el servidor genera un token nuevo** (y su código corto) e **invalida el código anterior sin usar de esa misma `entrega` + `proposito`**, y devuelve el nuevo en la respuesta de esa consulta autenticada (`requireAuth`). La regeneración tiene un **límite por usuario** (p. ej. 10 por hora) para no llenar la tabla ni invalidar sin parar el código de otro. El token nunca se manda por email ni notificación (a lo sumo, un aviso «ya tienes el código en la app»).
6. **Consumir el código, de forma atómica y en dos pasos.**
   - `GET /abrir?c=<token>` **no cambia nada**: enseña una pantalla de confirmación «Abrir taquilla 3» (así un previsualizador de enlaces no gasta el código).
   - `POST` desde esa pantalla ejecuta un único `UPDATE codigo_entrega SET usado_en = now() WHERE codigo_hash = $1 AND usado_en IS NULL AND caduca_en > now() RETURNING entrega_id`. Si devuelve una fila y es el código `recogida` del arrendatario, **en la misma transacción** se marca la entrega `entregada` y la reserva `en_curso` (US-05.02): es el equivalente en taquilla de «Ya tengo el objeto» (en modo taquilla ese botón se sustituye por escanear el QR o teclear el código corto). Si es el código `deposito` del propietario, solo se registra su `usado_en`, sin tocar la máquina de estados. Si no, se mira por qué (usado, caducado o inexistente) para el mensaje: «Este código ya se ha usado», «Este código ha caducado» o «Código no válido». Con este `UPDATE`, dos escaneos a la vez no pueden ganar los dos.
   - ¿Quién puede confirmar? En la demo, cualquiera que tenga el QR (el QR **es** la credencial, como en una taquilla real). Exigir además sesión es posible, pero pierde la gracia de «sin app».
7. **Seguridad.**
   - **Un solo uso y caducidad** (arriba).
   - **128 bits aleatorios** de `node:crypto`, en la BD solo el hash. **Reutilizar `hashToken` de `sessionService.ts`** para el token del QR (AGENTS.md): SHA-256 sin sal basta porque el token tiene mucha entropía.
   - **El código corto es otra cosa.** Con 8 caracteres (~40 bits), un SHA-256 sin sal se rompería por fuerza bruta offline si se filtrara la BD, así que **`hashToken` NO se usa para el código corto**. Se guarda en su propia columna `codigo_corto_hmac` como **HMAC-SHA256 con un secreto del servidor** (variable de entorno nueva, p. ej. `CODIGO_CORTO_SECRET`, **nunca en el repo**), es **válido solo unos minutos** (15 min como propuesta) y admite **como máximo 5 intentos fallidos por entrega**: al llegar a 5 se invalida y hay que generar otro (decisión 5). El límite por IP no basta para esto, porque va por entrega.
   - **Sin datos personales en el QR**: solo el token. No hay nombre, ni ids de reserva, ni la dirección.
   - **Límite de intentos** en el endpoint de consumo (el prototipo: 30 fallos/min por IP). Con 128 bits no hay fuerza bruta posible; el límite importa para el código corto. En producción, detrás del proxy de Render, **la IP real debe salir de `X-Forwarded-For` con `trust proxy`**; si no, todos los usuarios compartirían la IP del proxy.
   - **No registrar el token** en los logs (el prototipo solo escribe el resultado).
   - Al **regenerar** (decisión 5), se invalida el anterior sin usar de esa entrega y propósito.
8. **Encaje con las historias.**
   - **US-05.01:** el modo `punto_recogida` ya guarda `punto_recogida_id` en la `entrega`; US-05.03 añade la casilla y los códigos.
   - **US-05.02:** en punto de recogida/taquilla solo hay «Pendiente de entrega → Entregada», y «Ya tengo el objeto» lleva la reserva a «En curso». **Consumir el código `recogida` del arrendatario es ese «Ya tengo el objeto»**: marca la entrega `entregada` y la reserva `en_curso`, con el mismo servicio de transición y sus reglas. (El paso a `recogida` del enum es del flujo con rider, no de este.) **El código `deposito` del propietario no cambia la máquina de estados**: la entrega sigue «Pendiente de entrega» y «lista para recoger» se deduce de `usado_en` del código `deposito`, sin tocar el enum.
   - **Tiempo real** (ADR 0004): al abrir, el propietario ve el cambio por SSE sin recargar.
   - **Devolución:** una `entrega` con `sentido = vuelta` y el flujo al revés (el arrendatario deposita, el propietario recoge) con otro par de códigos.

## Consecuencias

- **Coste cero y sin app.** Funciona con la cámara de cualquier móvil.
- **Dependencia nueva en el frontend** (librería de QR) cuando se implemente la historia: hay que acordarla en equipo. El backend no necesita ninguna.
- **Variable de entorno nueva** para el HMAC del código corto (`CODIGO_CORTO_SECRET`), solo en Vercel/Render y en el `.env` local, nunca en el repo; se añade a la lista de variables del proyecto.
- **Migración nueva** (`codigo_entrega`, más la casilla). Va en la tarea de backend de US-05.03, no en una rama aparte (AGENTS.md).
- **HTTPS ya está en producción** (Vercel/Render), así que la URL del QR funciona; en local y en la demo sobre la Wi-Fi basta con `http://IP-LAN` porque se lee con la cámara nativa.
- **Riesgos:**
  - El `GET` que consume el código es frágil (previsualizadores); por eso la decisión 6 lo hace en dos pasos, y el prototipo ya lo implementa así: `GET /abrir` solo enseña el botón «Abrir taquilla 3» y el `POST` consume el código.
  - Un QR que se fotografía o se reenvía abre la taquilla a quien lo tenga: es inherente a una credencial al portador. Mitiga la caducidad corta y el aviso al propietario al abrirse.
  - Redes Wi-Fi con aislamiento de clientes impiden la demo en vivo desde el móvil; conviene llevar un punto de acceso propio o una captura/vídeo.
- **Lo que enseña la demo:** la taquilla «real» es una pantalla web (la del portátil), y la puerta se «abre» en ella al escanear.

## Pendiente

- Que el equipo decida la **caducidad** del QR (24 h en el prototipo; tal vez desde la hora de entrega elegida en US-05.01) y si el propietario recibe un aviso al abrirse.
- Decidir la **caducidad del código corto** (15 min propuestos) y el límite de **5 intentos**.
- Decidir si el **código corto** va en la primera versión o se deja fuera (US-05.03 es «si da tiempo»).
- Acordar la **librería de QR** del frontend.
- Probar el prototipo con un **móvil real** en la Wi-Fi de la demo (no se ha podido comprobar en este spike).
- US-05.03 sigue sin tareas ni wireframe: hay que crearlo (norma del #162) antes de programar pantallas.
- Si prospera, escribir el flujo de devolución y el estado de la casilla (libre/ocupada) en el modelo.
