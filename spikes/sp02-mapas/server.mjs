// Servidor estático mínimo para el prototipo (los módulos ES no se cargan desde file://).
// Sin dependencias: solo sirve los ficheros de esta carpeta que aparecen en FILES.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 5180);
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.mjs': ['app.mjs', 'text/javascript; charset=utf-8'],
  '/geo.mjs': ['geo.mjs', 'text/javascript; charset=utf-8'],
};

createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  const file = FILES[path];
  if (!file) {
    response.writeHead(404).end('No encontrado');
    return;
  }
  const [name, type] = file;
  response.writeHead(200, { 'Content-Type': type });
  response.end(await readFile(new URL(name, import.meta.url)));
}).listen(PORT, () => {
  console.log(`Prototipo SP-02 en http://localhost:${PORT}`);
});
