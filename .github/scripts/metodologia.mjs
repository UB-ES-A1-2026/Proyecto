// Check «Metodología» (US-12.02, #277): comprueba que la rama y los commits de un PR dicen a qué historia
// pertenecen, para que el network graph se pueda leer punto a punto. Reglas en CONTRIBUTING.md.
//   node .github/scripts/metodologia.mjs <nº PR>
//   node .github/scripts/metodologia.mjs --rama <rama> --destino <rama destino> [--commit "<mensaje>"]...  (sin GitHub)
// Necesita GH_TOKEN y GITHUB_REPOSITORY en el primer modo (los pone GitHub Actions).
// Generado con asistencia de IA (Claude) – revisado por Marc Sanz, 11/11/2026
import { execFileSync } from 'node:child_process';

const REPO = process.env.GITHUB_REPOSITORY ?? 'UB-ES-A1-2026/Proyecto';
const CODIGO = String.raw`(?:US-\d{2}\.\d{1,2}|SP-\d{2})`;
const DESC = String.raw`[a-z0-9]+(?:-[a-z0-9]+)*`;
const TIPOS = 'feat|fix|docs|test|refactor|chore|style|perf|build|ci';

const FEATURE = new RegExp(String.raw`^feature/(${CODIGO})-${DESC}$`);
const TASK = new RegExp(String.raw`^task/(${CODIGO})-\d+-${DESC}$`);
const BUGFIX = new RegExp(String.raw`^bugfix/(${CODIGO})-\d+-${DESC}$`);
const HOTFIX = new RegExp(String.raw`^hotfix/(${CODIGO})-\d+-${DESC}$`);

// Ramas que admite cada destino. `release/sprint-N` ya no se usa desde US-12.03: la sustituye `staging`.
function reglas(destino) {
  if (destino === 'develop')
    return {
      admite: [FEATURE, BUGFIX, HOTFIX, /^staging$/],
      texto:
        '`feature/US-XX.YY-<desc>`, `bugfix/US-XX.YY-<nº>-<desc>`, `hotfix/US-XX.YY-<nº>-<desc>` o `staging`',
    };
  if (destino === 'staging')
    return {
      admite: [/^develop$/, BUGFIX],
      texto: '`develop` o `bugfix/US-XX.YY-<nº>-<desc>`',
    };
  if (destino === 'main')
    return {
      admite: [/^staging$/, HOTFIX],
      texto: '`staging` o `hotfix/US-XX.YY-<nº>-<desc>`',
    };
  const historia = destino.match(FEATURE)?.[1];
  if (historia) {
    const escapado = historia.replace('.', String.raw`\.`);
    return {
      admite: [new RegExp(String.raw`^task/${escapado}-\d+-${DESC}$`)],
      texto: `\`task/${historia}-<nº tarea>-<desc>\``,
    };
  }
  return null;
}

export function comprobar(rama, destino, commits) {
  const errores = [];
  const r = reglas(destino);
  if (!r) {
    errores.push(
      `No se puede abrir un PR hacia \`${destino}\`. Los destinos válidos son \`develop\`, \`staging\`, \`main\` o la rama \`feature/\` de una historia.`,
    );
    return errores;
  }
  if (!r.admite.some((re) => re.test(rama))) {
    errores.push(
      `La rama \`${rama}\` no puede ir a \`${destino}\`. Hacia \`${destino}\` solo van: ${r.texto}. El código es el de la historia (\`US-04.01\`, \`SP-05\`); el resto, en minúsculas, con guiones y sin tildes.`,
    );
  }
  // Los PR de integración (develop → staging, staging → main/develop) traen commits ya comprobados.
  if (/^(develop|staging)$/.test(rama)) return errores;
  const codigo = [FEATURE, TASK, BUGFIX, HOTFIX]
    .map((re) => rama.match(re)?.[1])
    .find(Boolean);
  if (!codigo) return errores;
  const formato = new RegExp(
    String.raw`^(${TIPOS})(\([a-z0-9áéíóúñü-]+\))?: ${codigo.replace('.', String.raw`\.`)} .+ \(#\d+\)$`,
  );
  const malos = commits.filter(
    (m) =>
      !/^Merge (pull request|branch|remote-tracking)/.test(m) &&
      !formato.test(m),
  );
  if (malos.length) {
    errores.push(
      `Estos commits no tienen la forma \`tipo(ámbito): ${codigo} descripción (#nº tarea)\`:\n` +
        malos.map((m) => `  - ${m}`).join('\n') +
        `\nCámbialos en tu rama (por ejemplo, \`git rebase -i origin/${destino}\` y *reword*) y súbela con \`git push --force-with-lease\`.`,
    );
  }
  return errores;
}

function desdeGitHub(numero) {
  const gh = (...a) =>
    execFileSync('gh', a, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const pr = JSON.parse(
    gh('pr', 'view', numero, '-R', REPO, '--json', 'headRefName,baseRefName'),
  );
  // La API de commits da el mensaje completo; `messageHeadline` corta las líneas largas con «…».
  const commits = gh(
    'api',
    '--paginate',
    `repos/${REPO}/pulls/${numero}/commits`,
    '--jq',
    '.[].commit.message | split("\n")[0]',
  )
    .split('\n')
    .filter(Boolean);
  return { rama: pr.headRefName, destino: pr.baseRefName, commits };
}

const args = process.argv.slice(2);
let datos;
if (args[0] === '--rama') {
  const leer = (flag) =>
    args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
  datos = {
    rama: leer('--rama')[0],
    destino: leer('--destino')[0],
    commits: leer('--commit'),
  };
} else if (args[0]) {
  datos = desdeGitHub(args[0]);
} else {
  console.error(
    'Uso: node .github/scripts/metodologia.mjs <nº PR> | --rama <rama> --destino <destino> [--commit "<mensaje>"]...',
  );
  process.exit(2);
}
const errores = comprobar(datos.rama, datos.destino, datos.commits);
if (errores.length) {
  for (const e of errores) console.log(`::error::${e.replaceAll('\n', '%0A')}`);
  process.exit(1);
}
console.log(
  `Bien: \`${datos.rama}\` → \`${datos.destino}\` y ${datos.commits.length} commits con el código de su historia.`,
);
