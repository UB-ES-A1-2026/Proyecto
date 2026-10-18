import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export default function globalSetup(): void {
  const prismaCli = resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');

  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
}
