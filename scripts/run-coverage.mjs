import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
rmSync(path.join(root, 'coverage'), { recursive: true, force: true });

for (const script of ['build', 'test:coverage:node', 'test:coverage:browser']) {
  execFileSync('npm', ['run', script], { cwd: root, stdio: 'inherit', env: process.env });
}
execFileSync(process.execPath, ['scripts/merge-coverage.mjs'], { cwd: root, stdio: 'inherit', env: process.env });
