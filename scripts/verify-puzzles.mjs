// Verify every puzzle in puzzles/: schema-valid, exactly one canonical minimal line, par within
// maxActions, enough sub-optimal wins. Emits puzzles/<id>.solution.json (gitignored, server-only).
// Exits non-zero on any failure — this is the CI gate.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const puzzlesDir = join(root, 'puzzles');

// The puzzle package must be built first (it's TS); import from dist.
const { verifyPuzzleFile } = await import(
  new URL('../packages/puzzle/dist/verify.js', import.meta.url).href
);

let files = [];
try {
  files = readdirSync(puzzlesDir)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.solution.json'))
    .sort();
} catch {
  console.log('No puzzles/ directory yet — nothing to verify.');
  process.exit(0);
}

if (files.length === 0) {
  console.log('No puzzles to verify.');
  process.exit(0);
}

let failed = 0;
for (const file of files) {
  const raw = JSON.parse(readFileSync(join(puzzlesDir, file), 'utf-8'));
  const started = Date.now();
  try {
    const { puzzle, verification, solution } = verifyPuzzleFile(raw);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    if (verification.ok && solution) {
      writeFileSync(
        join(puzzlesDir, `${puzzle.id}.solution.json`),
        JSON.stringify(solution, null, 2) + '\n',
      );
      console.log(
        `PASS ${file} — par ${solution.par}, ${solution.suboptimalWins}+ sub-optimal wins, ${verification.nodes} nodes, ${elapsed}s`,
      );
      console.log(`     line: ${solution.optimalLine.join(' | ')}`);
    } else {
      failed += 1;
      console.error(`FAIL ${file} (${elapsed}s)`);
      for (const error of verification.errors) console.error(`     ${error}`);
    }
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${file} — ${error.message}`);
  }
}

console.log(`\n${files.length - failed}/${files.length} puzzles verified.`);
process.exit(failed === 0 ? 0 : 1);
