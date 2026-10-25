// Keep runtime selectors, package metadata and lockfiles in agreement.
// These are repository-contract checks, not a hosted deployment smoke test;
// they read tracked configuration only and never load application .env files.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));
const manifest = json('package.json');

describe('reproducible runtime configuration', () => {
  it('pins both runtime selectors to the root package engine', () => {
    expect(manifest.engines.node).toMatch(/^\d+\.\d+\.\d+$/);
    expect(read('.nvmrc').trim()).toBe(manifest.engines.node);
    expect(read('.node-version').trim()).toBe(manifest.engines.node);
    expect(manifest.engines.npm).toMatch(/^\d+\.\d+\.\d+$/);
  });

  // Running npm from a subdirectory must not silently bypass the root policy.
  it.each(['', 'client/', 'server/'])('keeps %s installs pinned and lockfile-backed', (directory) => {
    const pkg = json(`${directory}package.json`);
    const lock = json(`${directory}package-lock.json`);
    expect(pkg.engines).toEqual(manifest.engines);
    expect(pkg.packageManager).toBe(`npm@${manifest.engines.npm}`);
    expect(lock.packages[''].engines).toEqual(pkg.engines);
    expect(lock.packages[''].dependencies || {}).toEqual(pkg.dependencies || {});
    expect(lock.packages[''].devDependencies || {}).toEqual(pkg.devDependencies || {});
    expect(read(`${directory}.npmrc`)).toMatch(/^engine-strict=true$/m);
  });

  it('keeps production commands separate from watch and Vite development servers', () => {
    // Prefix forwarding retains the server working directory for dotenv, while
    // an explicit production mode prevents inherited development cookie policy.
    expect(manifest.private).toBe(true);
    expect(manifest.workspaces).toBeUndefined();
    expect(manifest.scripts.build).toBe('npm --prefix client run build');
    expect(manifest.scripts.start).toBe('NODE_ENV=production npm --prefix server start');
    expect(json('server/package.json').scripts.start).toBe('node src/index.js');
    expect(json('client/package.json').scripts.build).toBe('vite build');
  });
});
