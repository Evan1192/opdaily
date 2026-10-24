import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parsePuzzle, solvePuzzle } from '@opdaily/puzzle';
import { buildApp } from './app.js';
import { PgStore } from './store.js';

const here = dirname(fileURLToPath(import.meta.url));
// dist/ -> apps/api -> apps -> repo root
const repoRoot = join(here, '..', '..', '..');

const main = async () => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({ connectionString: databaseUrl });

  // Migrations are idempotent (IF NOT EXISTS), so running them on every boot is safe.
  const migrationsDir = join(repoRoot, 'apps', 'api', 'migrations');
  for (const file of readdirSync(migrationsDir).sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf-8'));
  }

  // Seed puzzles. Par always comes from a solver proof: the verify-puzzles artifact when it is
  // present (local dev), otherwise re-solved here (deploys — solution files are gitignored).
  const store = new PgStore(pool);
  const puzzlesDir = join(repoRoot, 'puzzles');
  let seeded = 0;
  for (const file of readdirSync(puzzlesDir).sort()) {
    if (!file.endsWith('.json') || file.endsWith('.solution.json')) continue;
    const payload = JSON.parse(readFileSync(join(puzzlesDir, file), 'utf-8'));
    const puzzle = parsePuzzle(payload);
    const solutionPath = join(puzzlesDir, `${puzzle.id}.solution.json`);
    let par: number;
    if (existsSync(solutionPath)) {
      par = (JSON.parse(readFileSync(solutionPath, 'utf-8')) as { par: number }).par;
    } else {
      const solved = solvePuzzle(puzzle);
      if (solved.par === null) throw new Error(`Puzzle ${puzzle.id} has no solution — refusing to seed`);
      par = solved.par;
    }
    await store.upsertPuzzle({ id: puzzle.id, date: puzzle.date, par, payload });
    seeded += 1;
  }
  console.log(`Seeded ${seeded} puzzles`);

  const app = await buildApp({ store, corsOrigin: process.env['CORS_ORIGIN'] });
  const port = Number(process.env['PORT'] ?? 3001);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`OPDaily API listening on :${port}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
