import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Comments stripped: the header names the things the workflow must not do.
const workflow = readFileSync(
  resolve(import.meta.dirname, '../../.github/workflows/planted-bugs-sql.yml'),
  'utf8'
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('#'))
  .join('\n');

describe('planted-bugs-sql workflow (MYK9-1659)', () => {
  it('triggers on workflow_dispatch only', () => {
    const on = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\npermissions:'));
    expect(on).toContain('workflow_dispatch');
    expect(on).not.toMatch(/push|pull_request|schedule/);
  });

  it('pins the Supabase CLI and never uses latest', () => {
    expect(workflow).toContain('supabase/setup-cli@v3');
    expect(workflow).toContain('version: 2.122.0 # exact pin, never latest; see MYK9-1662');
    expect(workflow).not.toMatch(/version:\s*latest/);
  });

  it('touches no shared database', () => {
    expect(workflow).not.toContain('secrets.');
    expect(workflow).not.toMatch(/supabase (link|db push|functions deploy)/);
    expect(workflow).not.toContain('sojmvhhwsjxmfistvzbe');
    expect(workflow).toContain('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  });

  it('starts the same stack as ci.yml sql-tests, in order', () => {
    const ci = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8');
    const start =
      'supabase start --exclude edge-runtime,imgproxy,logflare,mailpit,postgres-meta,studio,supavisor,vector';
    expect(ci).toContain(start);
    const order = [
      'bash scripts/ci/reserve-supabase-ports.sh',
      start,
      'supabase db reset --no-seed',
      'run.ts --kind ci',
    ].map(s => workflow.indexOf(s));
    expect(order.every(i => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('writes the runner table to the job summary', () => {
    expect(workflow).toContain('>> "$GITHUB_STEP_SUMMARY"');
  });
});
