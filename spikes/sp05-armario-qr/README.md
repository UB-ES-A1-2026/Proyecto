# SP-05 · Armario del barrio con QR de un solo uso

Prototipo del spike [#94](https://github.com/UB-ES-A1-2026/Proyecto/issues/94). La decisión y el porqué están en [ADR 0006](../../docs/adr/0006-armario-qr.md). **No es código de producción**: está aislado del backend, guarda los datos en memoria y **no tiene dependencias de npm** (solo Node 22).

> Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026.

## Qué hay

| Fichero | Qué es |
|---|---|
| `codes.mjs` | Lógica de los códigos: token aleatorio de 128 bits (`node:crypto`), se guarda solo su hash SHA-256, caduca a las 24 h y se consume una sola vez. |
| `codes.test.mjs` | Tests con `node:test` de esa lógica (creación, hash, un solo uso, caducidad, tokens inválidos). |
| `server.mjs` | Servidor `node:http` en `0.0.0.0`: `POST /api/codigos` (crea un código), `GET /abrir?c=<token>` (lo consume y responde «Taquilla 3 abierta», «ya se ha usado», «caducado» o «no válido»), `GET /api/estado` y las páginas. Límite de 30 intentos por minuto y por IP en `/abrir`. |
| `taquilla.html` | La «pantalla de la taquilla»: botón para generar un código, el QR y una puerta que pasa a «Taquilla 3 abierta» cuando el móvil consume el código. |
| `escanear.html` | Opcional: escáner en el navegador con `BarcodeDetector` (ver límites abajo). |

El QR se dibuja en el navegador con **qrcode-generator 1.4.4 cargado desde cdnjs** (versión fija y hash SRI). **No es una dependencia del proyecto**: no está en ningún `package.json`. Hace falta conexión a internet en el portátil que enseña la página.

## Cómo ejecutarlo

Requisitos: Node 22 o superior. No hace falta `npm install`.

```bash
cd spikes/sp05-armario-qr
node --test          # tests de la lógica
npm start            # PORT=3000 por defecto; BASE_URL=... si la IP detectada no es la buena
```

El servidor imprime la URL de la red local, por ejemplo `http://192.168.0.11:3000/abrir?c=<token>`.

## Qué probar con el móvil

1. Portátil y móvil en la **misma Wi-Fi** (sin «aislamiento de clientes», que algunas redes de la universidad activan).
2. En el portátil, abre `http://localhost:3000/` y pulsa **Generar código de recogida**.
3. Con la **cámara normal del móvil** (iOS o Android, sin instalar nada) apunta al QR y abre el enlace: sale **«Taquilla 3 abierta»** y, en la pantalla del portátil, la puerta se abre.
4. Vuelve a escanear el mismo QR: **«Este código ya se ha usado»**.
5. Un QR de más de 24 h (o un token inventado) da «caducado» o «código no válido». Para ver «caducado» sin esperar, cambia `ttlMs` en `POST /api/codigos` o mira el test de caducidad.

Sin móvil, se puede comprobar igual con `curl`: `curl -X POST localhost:3000/api/codigos` y dos veces `curl "<url>"`.

## Resultado

Probado el 11/11/2026 en macOS (Node 26.0.0) con `curl` contra el servidor arrancado:

- `node --test`: 10 tests, 10 correctos.
- `GET /` → 200. Primer `GET /abrir?c=<token>` → 200 «Taquilla 3 abierta»; segundo → 410 «Este código ya se ha usado»; token inventado → 404 «Código no válido».
- `GET /api/estado` no devuelve tokens ni hashes.

> **Ojo, no comprobado aquí:** el escaneo con un móvil físico y la carga del QR desde cdnjs en el navegador no se han probado (el entorno donde se escribió no tenía móvil ni navegador). Hay que hacer la prueba del apartado anterior antes de la demo. Tampoco se ha probado con Node 22 (lo instalado era Node 26); solo se usan `node:http`, `node:crypto`, `node:fs`, `node:os` y `node:test`.

## Hallazgos

- **La cámara nativa es el camino bueno.** iOS (Cámara) y Android (Cámara / Google Lens) leen un QR con una URL y la abren en el navegador. Sin app, sin permisos y sin HTTPS: el enlace `http://IP-LAN:3000/abrir?c=…` abre sin problema.
- **`BarcodeDetector` es solo un plan B.** `getUserMedia` exige HTTPS o `localhost`, así que por `http://IP-LAN` la cámara del navegador no se puede usar en el móvil. Además, `BarcodeDetector` no está en Safari ni en Firefox (en Chrome para Android sí; según MDN es experimental). Para escáner propio habría que servir con HTTPS y aun así tener alternativa. La página `escanear.html` lo dice en pantalla si no hay soporte.
- **Un `GET` que consume el código es frágil.** Un previsualizador de enlaces (mensajería, antivirus de correo) puede abrir la URL y «gastar» el código antes que la persona. Aquí se hace con `GET` porque es lo que pide el spike (escanear y listo); en producción hay que usar el patrón de dos pasos del ADR 0006 (el `GET` solo enseña una página con un botón «Abrir» y el cambio de estado va por `POST`).
- **Atomicidad.** En el prototipo, comprobar y marcar el código ocurre en una función síncrona, así que no hay carreras. En la BD real eso es un único `UPDATE … WHERE usado_en IS NULL AND caduca_en > now() RETURNING …` (ADR 0006).
- **Tamaño del QR:** una URL con un token de 22 caracteres cabe en un QR de versión baja y se lee bien incluso pequeño; el token de 128 bits no lo complica.
