// Convierte los wireframes HTML de docs/wireframes/ en PNG (norma: docs/wireframes/README.md).
// Uso, desde e2e/:
//   npm run wireframes                              → todas las carpetas US-* de docs/wireframes/
//   npm run wireframes -- US-01.1-registro          → solo esa carpeta (nombre o ruta)
// Genera flujo.png (el documento entero) y un PNG por cada <section data-captura="...">.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 22/10/2026
import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const WIREFRAMES_DIR = resolve(import.meta.dirname, '../../docs/wireframes');

async function findTargets(args) {
  if (args.length === 0) {
    const entries = await readdir(WIREFRAMES_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => join(WIREFRAMES_DIR, entry.name));
  }
  return args.map((arg) => (existsSync(resolve(arg)) ? resolve(arg) : join(WIREFRAMES_DIR, arg)));
}

const targets = await findTargets(process.argv.slice(2));
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1800, height: 900 },
  deviceScaleFactor: 2,
});
let failed = false;

for (const dir of targets) {
  const html = join(dir, 'index.html');
  if (!existsSync(html)) {
    console.error(`✘ No existe ${html}`);
    failed = true;
    continue;
  }

  // Los PNG se regeneran siempre: así no quedan capturas de pantallas que ya no existen.
  for (const file of await readdir(dir)) {
    if (file.endsWith('.png')) await rm(join(dir, file));
  }

  await page.goto(pathToFileURL(html).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(dir, 'flujo.png'), fullPage: true });

  const screens = await page.locator('[data-captura]').all();
  for (const screen of screens) {
    const name = await screen.getAttribute('data-captura');
    await screen.screenshot({ path: join(dir, `${name}.png`) });
  }
  console.log(`✔ ${dir}: flujo.png + ${screens.length} pantallas`);
}

await browser.close();
if (failed) process.exitCode = 1;
