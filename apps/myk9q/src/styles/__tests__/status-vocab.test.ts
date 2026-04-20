import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('design-tokens.css — status vocabulary consolidation', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../design-tokens.css'), 'utf-8');
  });

  it('aliases --checkin-none to --status-no-status (not a literal hex)', () => {
    expect(css).toMatch(/--checkin-none:\s*var\(--status-no-status\)/);
  });

  it('aliases --checkin-conflict to --status-conflict (not a literal hex)', () => {
    expect(css).toMatch(/--checkin-conflict:\s*var\(--status-conflict\)/);
  });

  it('aliases --checkin-pulled to --status-pulled (not a literal hex)', () => {
    expect(css).toMatch(/--checkin-pulled:\s*var\(--status-pulled\)/);
  });

  it('aliases --checkin-at-gate to --status-at-gate (not a literal hex)', () => {
    expect(css).toMatch(/--checkin-at-gate:\s*var\(--status-at-gate\)/);
  });

  it('marks the --checkin-* block as @deprecated', () => {
    expect(css).toMatch(/@deprecated.*--status-\*/);
  });

  it('keeps --checkin-checked-in as alias (already was — guard against regression)', () => {
    expect(css).toMatch(/--checkin-checked-in:\s*var\(--status-checked-in\)/);
  });

  it('keeps --checkin-in-ring as alias (already was — guard against regression)', () => {
    expect(css).toMatch(/--checkin-in-ring:\s*var\(--status-in-ring\)/);
  });
});
