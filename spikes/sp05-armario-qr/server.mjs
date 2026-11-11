// SP-05 (#94): taquilla simulada con QR de un solo uso. Solo node:*, sin dependencias.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createCodeStore } from './codes.mjs'

const SLOT = 3 // la taquilla simulada
const store = createCodeStore()

/** Primera IPv4 de la LAN (para que el móvil pueda abrir el enlace). */
export function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) return i.address
  }
  return '127.0.0.1'
}

/** Límite sencillo por IP: 30 intentos por minuto en /abrir (frena la fuerza bruta). */
const attempts = new Map()
function tooMany(ip, now = Date.now()) {
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  attempts.set(ip, recent)
  return recent.length > 30
}

const page = (title, body, color) => `<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font-family:system-ui;text-align:center;padding:3rem 1rem;background:${color};color:#fff">
<h1 style="font-size:2.2rem">${title}</h1><p style="font-size:1.1rem">${body}</p></body></html>`

const MESSAGES = {
  abierta: (r) => [`Taquilla ${r.slot} abierta`, 'Recoge tu artículo. Este código ya no se puede volver a usar.', '#1a7f37', 200],
  usada: () => ['Este código ya se ha usado', 'Cada código abre la taquilla una sola vez.', '#b35900', 410],
  caducada: () => ['Este código ha caducado', 'Pide uno nuevo al propietario.', '#b35900', 410],
  invalida: () => ['Código no válido', 'Revisa el QR o pide uno nuevo.', '#b42318', 404],
}

export function createApp({ baseUrl }) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const send = (status, type, body) => {
      res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' })
      res.end(body)
    }
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        return send(200, 'text/html', await readFile(fileURLToPath(new URL('./taquilla.html', import.meta.url))))
      }
      if (req.method === 'GET' && url.pathname === '/escanear') {
        return send(200, 'text/html', await readFile(fileURLToPath(new URL('./escanear.html', import.meta.url))))
      }
      if (req.method === 'POST' && url.pathname === '/api/codigos') {
        const c = store.createCode({ slot: SLOT })
        return send(201, 'application/json', JSON.stringify({
          slot: c.slot, expiresAt: c.expiresAt, url: `${baseUrl}/abrir?c=${c.token}`,
        }))
      }
      if (req.method === 'GET' && url.pathname === '/api/estado') {
        return send(200, 'application/json', JSON.stringify(store.summary()))
      }
      if (req.method === 'GET' && url.pathname === '/abrir') {
        if (tooMany(req.socket.remoteAddress)) {
          return send(429, 'text/html', page('Demasiados intentos', 'Espera un minuto.', '#b42318'))
        }
        const r = store.consumeCode(url.searchParams.get('c'))
        const [title, body, color, status] = MESSAGES[r.status](r)
        console.log(`[abrir] ${r.status}${r.slot ? ` taquilla ${r.slot}` : ''}`) // nunca se registra el token
        return send(status, 'text/html', page(title, body, color))
      }
      send(404, 'text/plain', 'No encontrado')
    } catch (err) {
      console.error(err)
      send(500, 'text/plain', 'Error interno')
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000)
  const baseUrl = process.env.BASE_URL ?? `http://${lanAddress()}:${port}`
  createServer(createApp({ baseUrl })).listen(port, '0.0.0.0', () => {
    console.log(`Taquilla en el portátil:  http://localhost:${port}/`)
    console.log(`URL de los QR (LAN):      ${baseUrl}/abrir?c=<token>`)
    console.log('Abre la URL LAN desde el móvil (misma Wi-Fi).')
  })
}
