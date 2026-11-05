// Métricas de tests (#272): utilidades de los bugs, compartidas por bugs.yml y metricas-tests.yml.
//   node .github/scripts/bugs.mjs etiqueta <nº issue>   → pone la etiqueta hallado-* según el issue
//   node .github/scripts/bugs.mjs arreglo <nº PR>       → falla si un PR de bugfix/ o hotfix/ no toca tests
//   node .github/scripts/bugs.mjs informe               → tabla Markdown con los bugs por origen y los fallos parados por el CI
// Necesita GH_TOKEN y GITHUB_REPOSITORY (los pone GitHub Actions; en local: GITHUB_REPOSITORY=UB-ES-A1-2026/Proyecto).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 5/11/2026
import { execFileSync } from 'node:child_process';

const REPO = process.env.GITHUB_REPOSITORY ?? 'UB-ES-A1-2026/Proyecto';
const gh = (...args) =>
  execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const ghJson = (...args) => JSON.parse(gh(...args) || 'null');

// Respuesta de «¿Cómo se ha encontrado?» (plantilla bug.yml) → etiqueta. El orden es el de la plantilla.
export const ORIGENES = [
  {
    texto: 'Un test automático en local',
    etiqueta: 'hallado-por-test',
    color: '0e8a16',
    nombre: 'Test en local',
  },
  {
    texto: 'El CI de un PR',
    etiqueta: 'hallado-por-ci',
    color: '1d76db',
    nombre: 'CI de un PR',
  },
  {
    texto: 'Revisión de código',
    etiqueta: 'hallado-en-revision',
    color: 'fbca04',
    nombre: 'Revisión de código',
  },
  {
    texto: 'Probando a mano',
    etiqueta: 'hallado-a-mano',
    color: 'c5def5',
    nombre: 'A mano',
  },
  {
    texto: 'En producción o en la demo',
    etiqueta: 'hallado-en-produccion',
    color: 'b60205',
    nombre: 'Producción o demo',
  },
];
const SIN_INDICAR = {
  etiqueta: 'hallado-sin-indicar',
  color: 'ededed',
  nombre: 'Sin indicar',
};
const TODAS = [...ORIGENES, SIN_INDICAR];

function origenDe(body) {
  // Los issue forms escriben «### ¿Cómo se ha encontrado?», una línea en blanco y la opción elegida.
  const respuesta =
    body
      ?.match(/###\s*¿?C[oó]mo se ha encontrado\??\s*\n+([^\n]+)/i)?.[1]
      ?.trim() ?? '';
  return ORIGENES.find((o) => respuesta.startsWith(o.texto)) ?? SIN_INDICAR;
}

function etiqueta(numero) {
  const issue = ghJson(
    'issue',
    'view',
    numero,
    '-R',
    REPO,
    '--json',
    'body,labels',
  );
  const actuales = issue.labels.map((l) => l.name);
  if (!actuales.includes('bug'))
    return console.log(`#${numero} no es un bug: no se toca.`);
  const origen = origenDe(issue.body);
  for (const o of TODAS) {
    try {
      gh(
        'label',
        'create',
        o.etiqueta,
        '-R',
        REPO,
        '--color',
        o.color,
        '--description',
        `Bug encontrado: ${o.nombre} (#272)`,
      );
    } catch {
      // ya existe
    }
  }
  const quitar = TODAS.map((o) => o.etiqueta).filter(
    (e) => e !== origen.etiqueta && actuales.includes(e),
  );
  const args = [
    'issue',
    'edit',
    numero,
    '-R',
    REPO,
    '--add-label',
    origen.etiqueta,
  ];
  for (const e of quitar) args.push('--remove-label', e);
  gh(...args);
  console.log(`#${numero}: ${origen.etiqueta}`);
}

function arreglo(numero) {
  const pr = ghJson(
    'pr',
    'view',
    numero,
    '-R',
    REPO,
    '--json',
    'headRefName,body,labels,files',
  );
  if (!/^(bugfix|hotfix)\//.test(pr.headRefName))
    return console.log(
      `${pr.headRefName} no es bugfix/ ni hotfix/: no se comprueba.`,
    );
  const errores = [];
  const tests = pr.files
    .map((f) => f.path)
    .filter((p) => /^(backend\/tests|frontend\/tests|e2e\/tests)\//.test(p));
  const excepcion = pr.labels.some((l) => l.name === 'bug-sin-test');
  if (tests.length === 0 && !excepcion) {
    errores.push(
      'No cambia ningún test en backend/tests, frontend/tests ni e2e/tests. Todo arreglo lleva el test que reproduce el bug ' +
        '(falla sin el arreglo y pasa con él). Si de verdad no se puede probar, explícalo en el PR y pon la etiqueta bug-sin-test.',
    );
  }
  const referencias = [...(pr.body ?? '').matchAll(/#(\d+)/g)].map((m) => m[1]);
  const bugs = referencias.filter((n) => {
    try {
      const issue = ghJson('api', `repos/${REPO}/issues/${n}`);
      return !issue.pull_request && issue.labels.some((l) => l.name === 'bug'); // un PR no cuenta
    } catch {
      return false; // no existe
    }
  });
  if (bugs.length === 0) {
    errores.push(
      'La descripción no enlaza ningún issue con la etiqueta bug («Closes #<nº>»). Crea el bug con la plantilla «Bug» antes del arreglo.',
    );
  }
  if (errores.length) {
    for (const e of errores) console.log(`::error::${e}`);
    process.exit(1);
  }
  console.log(
    `Bien: tests cambiados (${tests.length || 'excepción bug-sin-test'}) y bug enlazado (#${bugs.join(', #')}).`,
  );
}

function informe() {
  const bugs = ghJson(
    'issue',
    'list',
    '-R',
    REPO,
    '--label',
    'bug',
    '--state',
    'all',
    '--limit',
    '500',
    '--json',
    'number,title,labels,milestone',
  );
  const sprints = [
    ...new Set(bugs.map((b) => b.milestone?.title ?? 'Sin sprint')),
  ].sort();
  const origenDeBug = (b) =>
    TODAS.find((o) => b.labels.some((l) => l.name === o.etiqueta)) ??
    SIN_INDICAR;
  const out = ['## Bugs por origen', ''];
  out.push(
    'Cuántos bugs se han abierto y cómo se encontraron, según «¿Cómo se ha encontrado?» de la plantilla.',
    '',
  );
  out.push(
    '| Sprint | ' + TODAS.map((o) => o.nombre).join(' | ') + ' | Total |',
  );
  out.push('|---|' + TODAS.map(() => '---|').join('') + '---|');
  for (const s of sprints) {
    const delSprint = bugs.filter(
      (b) => (b.milestone?.title ?? 'Sin sprint') === s,
    );
    out.push(
      `| ${s} | ` +
        TODAS.map(
          (o) => delSprint.filter((b) => origenDeBug(b) === o).length,
        ).join(' | ') +
        ` | ${delSprint.length} |`,
    );
  }
  const porTest = bugs.filter((b) =>
    ['hallado-por-test', 'hallado-por-ci'].includes(origenDeBug(b).etiqueta),
  );
  out.push(
    '',
    `**Encontrados por tests (en local o en el CI): ${porTest.length} de ${bugs.length}.**`,
  );
  for (const b of porTest) out.push(`- #${b.number} ${b.title}`);

  // PRs en los que un paso de tests del CI falló: el CI paró un fallo antes de integrarlo.
  const runs = ghJson(
    'api',
    `repos/${REPO}/actions/workflows/ci.yml/runs?event=pull_request&status=failure&per_page=100`,
  ).workflow_runs;
  const filas = [];
  for (const run of runs) {
    const jobs = ghJson(
      'api',
      `repos/${REPO}/actions/runs/${run.id}/jobs?per_page=50`,
    ).jobs;
    const pasos = jobs.flatMap((j) =>
      (j.steps ?? [])
        .filter((s) => s.conclusion === 'failure')
        .map((s) => `${j.name}: ${s.name}`),
    );
    const deTests = pasos.filter((p) => /test/i.test(p));
    if (deTests.length)
      filas.push(
        `| ${run.created_at.slice(0, 10)} | \`${run.head_branch}\` | ${deTests.join('<br>')} | [ver](${run.html_url}) |`,
      );
  }
  out.push('', '## Fallos parados por el CI', '');
  out.push(
    'Ejecuciones del CI en PRs en las que falló un paso de tests (las de lint o build no cuentan).',
    '',
  );
  if (filas.length)
    out.push(
      '| Fecha | Rama | Paso | Ejecución |',
      '|---|---|---|---|',
      ...filas,
    );
  else out.push('Ninguna por ahora.');
  console.log(out.join('\n'));
}

const [accion, numero] = process.argv.slice(2);
if (accion === 'etiqueta') etiqueta(numero);
else if (accion === 'arreglo') arreglo(numero);
else if (accion === 'informe') informe();
else {
  console.error(
    'Uso: node .github/scripts/bugs.mjs etiqueta <issue> | arreglo <pr> | informe',
  );
  process.exit(2);
}
