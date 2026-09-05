import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runGuard } from './migration-version-guard';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
const path = 'supabase/migrations/20260905000000_fixture.sql';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'migration-provenance-'));
  roots.push(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'fixture@example.test');
  git('config', 'user.name', 'Fixture');
  mkdirSync(join(root, 'supabase/migrations'), { recursive: true });
  writeFileSync(join(root, path), '-- original\nSELECT 1;\n');
  git('add', '.');
  git('commit', '-qm', 'accepted');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('switch', '-qc', 'feature');
  const commit = (body: string, file = path) => {
    writeFileSync(join(root, file), body);
    git('add', '.');
    git('commit', '-qm', 'candidate');
  };
  const check = (deployed = '1', files = [path], env: NodeJS.ProcessEnv = {}) =>
    runGuard(files, {
      cwd: root,
      env: {
        GITHUB_BASE_REF: 'main',
        GITHUB_HEAD_REF: 'feature',
        MYK9_MIGRATION_DATABASE_URL: 'fixture',
        ...env,
      },
      command: (command, args) => (command === 'psql' ? deployed : git(...args)),
    });
  return { git, commit, check };
}

describe('migration provenance through real git trees', () => {
  it('fails closed without DB credentials or accepted-main provenance', () => {
    const f = fixture();
    f.commit('-- revised header\nSELECT 1;\n');
    expect(() => f.check('0', [path], { MYK9_MIGRATION_DATABASE_URL: '' })).toThrow(/required/);
    f.git('update-ref', '-d', 'refs/remotes/origin/main');
    expect(() => f.check()).toThrow();
  });
  it('uses a push-before tree and allows inherited synthetic merge refs', () => {
    const f = fixture();
    const before = f.git('rev-parse', 'HEAD');
    f.git('update-ref', 'refs/remotes/origin/pull/123/merge', 'HEAD');
    f.commit('-- revised header\nSELECT 1;\n');
    expect(f.check('1', [path], { GITHUB_BASE_REF: '', GITHUB_EVENT_BEFORE: before })).toEqual([]);
  });
  it('allows an applied accepted header edit and inherited ref at another SHA', () => {
    const f = fixture();
    f.git('branch', 'inherited');
    f.commit('-- corrected provenance\nSELECT 1;\n');
    expect(f.check()).toEqual([]);
  });
  it('allows a deployed current-main rerun', () => {
    const f = fixture();
    f.commit('-- corrected provenance\nSELECT 1;\n');
    f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    expect(f.check()).toEqual([]);
  });
  it('rejects rewriting accepted SQL even when the version is not deployed', () => {
    const f = fixture();
    f.commit('SELECT 2;\n');
    expect(f.check('0').join('\n')).toMatch(/20260905000000.*accepted.*body/i);
  });
  it('rejects a distinct unmerged version claim and names its ref and file', () => {
    const f = fixture();
    const next = 'supabase/migrations/20260905000100_new.sql';
    f.git('switch', '-qc', 'competing');
    f.commit('SELECT 2;\n', next);
    f.git('switch', '-q', 'feature');
    f.commit('SELECT 3;\n', next);
    expect(f.check('0', [next]).join('\n')).toMatch(
      /20260905000100.*competing.*20260905000100_new.sql/
    );
  });
  it('allows a new unapplied version but rejects a deployed unaccepted claim', () => {
    const f = fixture();
    const next = 'supabase/migrations/20260905000100_new.sql';
    f.commit('SELECT 3;\n', next);
    expect(f.check('0', [next])).toEqual([]);
    expect(f.check('1', [next]).join('\n')).toMatch(/deployed.*accepted main/);
  });
  it('rejects duplicate versions in the candidate tree', () => {
    const f = fixture();
    f.commit('SELECT 1;\n', path.replace('fixture', 'duplicate'));
    expect(f.check().join('\n')).toMatch(/duplicate.*20260905000000/i);
  });
  it('rejects deleting or renaming accepted migration paths', () => {
    const f = fixture();
    f.git('mv', path, path.replace('fixture', 'renamed'));
    f.git('commit', '-qm', 'rename');
    expect(f.check().join('\n')).toMatch(/removed|renamed/);
  });
});
