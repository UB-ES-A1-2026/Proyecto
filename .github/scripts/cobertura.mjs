// Métricas de tests (#272): convierte los coverage-summary.json de Vitest en una tabla Markdown.
// Uso: node .github/scripts/cobertura.mjs <carpeta>
// Busca <carpeta>/cobertura-backend/coverage-summary.json y <carpeta>/cobertura-frontend/coverage-summary.json
// (lo que deja actions/download-artifact) y lee los mínimos de cada vitest.config.ts.
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 5/11/2026
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'cobertura';
const METRICAS = [
  ['lines', 'Líneas'],
  ['statements', 'Sentencias'],
  ['functions', 'Funciones'],
  ['branches', 'Ramas (if/else)'],
];

function minimos(parte) {
  const config = readFileSync(join(parte, 'vitest.config.ts'), 'utf8');
  const bloque = config.match(/thresholds:\s*\{([^}]*)\}/)?.[1] ?? '';
  return Object.fromEntries(
    [...bloque.matchAll(/(\w+):\s*(\d+)/g)].map(([, k, v]) => [k, Number(v)]),
  );
}

const lineas = ['<!-- cobertura-rentit -->', '## Cobertura de código', ''];
lineas.push(
  'Qué porcentaje del código ejecutan los tests unitarios y de API. El CI falla si algún valor baja del mínimo.',
  '',
);
lineas.push(
  '| Parte | ' + METRICAS.map(([, nombre]) => nombre).join(' | ') + ' |',
);
lineas.push('|---|' + METRICAS.map(() => '---|').join(''));

for (const parte of ['backend', 'frontend']) {
  const archivo = join(dir, `cobertura-${parte}`, 'coverage-summary.json');
  if (!existsSync(archivo)) {
    lineas.push(
      `| ${parte} | ` + METRICAS.map(() => 'sin datos').join(' | ') + ' |',
    );
    continue;
  }
  const total = JSON.parse(readFileSync(archivo, 'utf8')).total;
  const min = minimos(parte);
  const celdas = METRICAS.map(([clave]) => {
    const valor = total[clave].pct;
    const icono = min[clave] !== undefined && valor < min[clave] ? '❌' : '✅';
    return `${icono} ${valor.toFixed(1)} % (mín. ${min[clave] ?? '–'} %)`;
  });
  lineas.push(`| ${parte} | ${celdas.join(' | ')} |`);
}

lineas.push(
  '',
  '«Sin datos»: los tests de esa parte no llegaron a terminar; mira su job. Cómo se usa, en `docs/testing.md`.',
);
console.log(lineas.join('\n'));
