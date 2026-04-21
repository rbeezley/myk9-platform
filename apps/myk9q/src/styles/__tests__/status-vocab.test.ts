import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '../../../../../');

function grepCount(pattern: string, paths: string[]): number {
  try {
    const out = execSync(
      `rg --count-matches --no-messages --glob '!**/node_modules/**' -e ${JSON.stringify(pattern)} ${paths.map(p => JSON.stringify(p)).join(' ')}`,
      { cwd: REPO_ROOT, encoding: 'utf-8' }
    );
    return out
      .trim()
      .split('\n')
      .filter(Boolean)
      .reduce((sum, line) => sum + Number(line.split(':').pop() ?? 0), 0);
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string };
    if (e.status === 1) return 0;
    throw err;
  }
}

describe('design-tokens.css — Phase 3 regression (--checkin-* removed)', () => {
  it('no --checkin-* references remain in apps/myk9q/src', () => {
    const count = grepCount('--checkin-', ['apps/myk9q/src']);
    expect(count).toBe(0);
  });

  it('no --checkin-* references remain in apps/myk9q/public', () => {
    const count = grepCount('--checkin-', ['apps/myk9q/public']);
    expect(count).toBe(0);
  });

  it('no --checkin-* references remain in packages/core/src', () => {
    const count = grepCount('--checkin-', ['packages/core/src']);
    expect(count).toBe(0);
  });

  it('design-tokens.css does not define any --checkin-* aliases', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../design-tokens.css'), 'utf-8');
    expect(css).not.toMatch(/--checkin-[a-z-]+\s*:/);
  });

  it('canonical --status-* namespace still exists (smoke)', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../design-tokens.css'), 'utf-8');
    expect(css).toMatch(/--status-checked-in:/);
    expect(css).toMatch(/--status-pulled:/);
    expect(css).toMatch(/--status-in-ring:/);
    expect(css).toMatch(/--status-completed:/);
  });
});
