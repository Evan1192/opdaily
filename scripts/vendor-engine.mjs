// Re-pack the optcg_rules engine packages into vendor/ as prebuilt tarballs.
//
// The engine is a private, unpublished monorepo, so it cannot be a registry
// dependency. Each package ships `files: ["dist"]`, so the tarballs carry
// prebuilt JS — neither Railway nor Vercel ever builds the engine.
//
// The engine repo's git SHA is recorded in vendor/ENGINE_VERSION.json so an
// engine bump is an explicit, reviewable change that re-runs puzzle
// verification.
//
// The latest card snapshot is also copied into vendor/: @optcg/data resolves
// its snapshot directory relative to the *repo* layout (dist -> package root
// -> packages -> repo root -> data/cards), which does not exist inside
// node_modules, so consumers load the vendored JSON directly.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const engineRoot = resolve(root, '..', 'optcg_rules');
const vendorDir = join(root, 'vendor');
mkdirSync(vendorDir, { recursive: true });

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf-8', shell: process.platform === 'win32' }).trim();

// Pack each engine package into vendor/ under a stable (unversioned) name so
// the file: specifiers in package.json never change on a version bump.
const packages = [
  ['core', 'optcg-core.tgz'],
  ['cards', 'optcg-cards.tgz'],
  ['data', 'optcg-data.tgz'],
];

for (const [pkg, target] of packages) {
  const pkgDir = join(engineRoot, 'packages', pkg);
  const produced = run('npm', ['pack', '--pack-destination', vendorDir], pkgDir);
  renameSync(join(vendorDir, produced), join(vendorDir, target));
  console.log(`${pkg} -> vendor/${target}`);
}

// Vendor the newest card snapshot.
const snapshotDir = join(engineRoot, 'data', 'cards');
const versions = readdirSync(snapshotDir)
  .filter((f) => f.endsWith('.json'))
  .sort();
const latest = versions.at(-1);
if (!latest) throw new Error(`No card snapshots found in ${snapshotDir}`);
copyFileSync(join(snapshotDir, latest), join(vendorDir, 'card-snapshot.json'));
console.log(`snapshot ${latest} -> vendor/card-snapshot.json`);

// Record provenance.
const sha = run('git', ['rev-parse', 'HEAD'], engineRoot);
const dirty = run('git', ['status', '--porcelain'], engineRoot) !== '';
writeFileSync(
  join(vendorDir, 'ENGINE_VERSION.json'),
  `${JSON.stringify({ engineCommit: sha, dirty, snapshot: latest.replace(/\.json$/, ''), vendoredAt: new Date().toISOString() }, null, 2)}\n`,
);
console.log(`engine ${sha}${dirty ? ' (dirty)' : ''}`);
