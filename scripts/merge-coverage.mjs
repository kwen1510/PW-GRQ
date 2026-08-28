import { readFileSync } from 'node:fs';
import path from 'node:path';
import istanbulCoverage from 'istanbul-lib-coverage';
import istanbulReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';

const { createCoverageMap } = istanbulCoverage;
const { createContext } = istanbulReport;

const root = process.cwd();
const coverageMap = createCoverageMap({});
for (const relative of ['coverage/node/coverage-final.json', 'coverage/browser/coverage-final.json']) {
  coverageMap.merge(JSON.parse(readFileSync(path.join(root, relative), 'utf8')));
}

const context = createContext({ dir: path.join(root, 'coverage'), coverageMap });
reports.create('lcovonly', { file: 'lcov.info' }).execute(context);
reports.create('text').execute(context);
reports.create('text-summary').execute(context);

const summary = coverageMap.getCoverageSummary();
const minimum = Number(process.env.COVERAGE_THRESHOLD || 80);
const required = ['lines', 'statements'];
const failures = required.filter((metric) => summary[metric].pct < minimum);
if (failures.length) {
  throw new Error(`Coverage below ${minimum}%: ${failures.map((metric) => `${metric}=${summary[metric].pct}%`).join(', ')}`);
}

console.log(JSON.stringify({
  threshold: minimum,
  files: coverageMap.files().length,
  lines: summary.lines.pct,
  statements: summary.statements.pct,
  functions: summary.functions.pct,
  branches: summary.branches.pct
}, null, 2));
