import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `scripts/qa/supabase-types-drift.sh` is the report-only check MYK9-488 added
 * after MYK9-484 found the committed Supabase types 28 objects behind the
 * applied schema. These tests run the real script against fixture files
 * (`--generated` stands in for `supabase gen types`, which needs Docker), so a
 * drift shows up BY NAME and the exit-code contract holds:
 *
 *   0 no drift · 1 drift (the workflow step carries continue-on-error) ·
 *   2 could not compare, which is not a verdict.
 *
 * The workflow assertions at the bottom pin the two properties that make the
 * job safe to leave unrequired: the drift step never fails the run, and the
 * job is on the gating evaluator's informational list.
 */
const SCRIPT = resolve(import.meta.dirname, 'supabase-types-drift.sh');
const REPO_ROOT = resolve(import.meta.dirname, '../..');

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function types(objects: {
  tables?: Record<string, string>;
  functions?: Record<string, string>;
  postgrestVersion?: string;
}): string {
  const block = (section: string, entries: Record<string, string> | undefined) =>
    Object.entries(entries ?? {})
      .map(([name, body]) => `      ${name}: {\n        ${body}\n      }`)
      .join('\n');
  return [
    'export type Database = {',
    '  __InternalSupabase: {',
    `    PostgrestVersion: "${objects.postgrestVersion ?? '14.5'}"`,
    '  }',
    '  public: {',
    '    Tables: {',
    block('Tables', objects.tables),
    '    }',
    '    Functions: {',
    block('Functions', objects.functions),
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
}

function run(committed: string, generated: string) {
  const dir = mkdtempSync(join(tmpdir(), 'types-drift-'));
  dirs.push(dir);
  const committedPath = join(dir, 'committed.ts');
  const generatedPath = join(dir, 'generated.ts');
  const summaryPath = join(dir, 'summary.md');
  writeFileSync(committedPath, committed);
  writeFileSync(generatedPath, generated);
  const args = [
    SCRIPT,
    '--committed',
    committedPath,
    '--generated',
    generatedPath,
    '--summary',
    summaryPath,
  ];
  try {
    const stdout = execFileSync('bash', args, { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stdout, summary: readFileSync(summaryPath, 'utf8') };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    let summary = '';
    try {
      summary = readFileSync(summaryPath, 'utf8');
    } catch {
      summary = '';
    }
    return { status: failure.status, stdout: failure.stdout, stderr: failure.stderr, summary };
  }
}

describe('supabase-types-drift.sh', () => {
  const entries = 'Row: { id: string }';

  it('exits 0 and reports no drift when only PostgrestVersion differs', () => {
    const committed = types({ tables: { entries }, postgrestVersion: '14.1' });
    const generated = types({ tables: { entries }, postgrestVersion: '14.5' });
    const result = run(committed, generated);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('**No drift.**');
    expect(result.summary).toContain('**No drift.**');
    expect(result.stdout).not.toContain('::warning');
  });

  it('names a live object the committed file lacks, and a committed object the database lacks', () => {
    const committed = types({
      tables: { entries, sport_class_rules: entries },
      functions: { get_show_judges: 'Args: { p_show_id: string }' },
    });
    const generated = types({
      tables: { entries, show_officials: entries },
      functions: {
        get_show_judges: 'Args: { p_show_id: string }',
        trial_secretary_show_ids: 'Args: Record<PropertyKey, never>',
      },
    });
    const result = run(committed, generated);
    expect(result.status).toBe(1);
    expect(result.summary).toContain(
      '- **Live but not committed (2):** `public.Functions.trial_secretary_show_ids`, `public.Tables.show_officials`'
    );
    expect(result.summary).toContain(
      '- **Committed but not live (1):** `public.Tables.sport_class_rules`'
    );
    expect(result.stdout).toMatch(
      /^::warning title=Supabase types drift::2 live object\(s\) not committed, 1 committed object\(s\) not live/m
    );
    expect(result.summary).toContain('pnpm generate-types');
  });

  it('names an argument-less function, which the generator emits on a single line', () => {
    // The real file has `      trial_secretary_show_ids: { Args: never; Returns: string[] }`
    // on one line; a header pattern anchored on `{` at end of line misses it.
    const oneLiner = '      trial_secretary_show_ids: { Args: never; Returns: string[] }';
    const committed = types({ tables: { entries } });
    const generated = committed.replace('    Functions: {\n', `    Functions: {\n${oneLiner}\n`);
    expect(generated).not.toBe(committed);
    const result = run(committed, generated);
    expect(result.status).toBe(1);
    expect(result.summary).toContain(
      '- **Live but not committed (1):** `public.Functions.trial_secretary_show_ids`'
    );
  });

  it('still reports drift inside an existing object when no header changed', () => {
    const committed = types({ tables: { entries: 'Row: { id: string }' } });
    const generated = types({
      tables: { entries: 'Row: { id: string; deleted_at: string | null }' },
    });
    const result = run(committed, generated);
    expect(result.status).toBe(1);
    expect(result.summary).toContain('- **Live but not committed (0):** none');
    expect(result.summary).toContain('No object was added or removed');
  });

  it('generates with the committed schemas only, and the password injected into the URL', () => {
    // `--db-url` emits every schema (storage, graphql_public, …); the committed
    // file was generated with `--project-id`, which is public only. The first
    // run of #2193 reported 22 storage objects as "live but not committed".
    const dir = mkdtempSync(join(tmpdir(), 'types-drift-gen-'));
    dirs.push(dir);
    const committedPath = join(dir, 'committed.ts');
    const calls = join(dir, 'calls.txt');
    writeFileSync(committedPath, types({ tables: { entries } }));
    // Stub `supabase`: record argv, then emit the committed file (no drift).
    writeFileSync(
      join(dir, 'supabase'),
      `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > '${calls}'\ncat '${committedPath}'\n`,
      { mode: 0o755 }
    );
    const stdout = execFileSync('bash', [SCRIPT, '--committed', committedPath], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH ?? ''}`,
        MYK9_MIGRATION_DATABASE_URL: 'postgresql://postgres.ref@pooler.example:5432/postgres',
        PGPASSWORD: 'p@ss word',
      },
    });
    expect(stdout).toContain('**No drift.**');
    const argv = readFileSync(calls, 'utf8').split('\n');
    expect(argv.slice(0, 3)).toEqual(['gen', 'types', 'typescript']);
    expect(argv).toContain('postgresql://postgres.ref:p%40ss%20word@pooler.example:5432/postgres');
    expect(argv[argv.indexOf('--schema') + 1]).toBe('public');
  });

  it('exits 2, not 1, when it has nothing to compare', () => {
    let status = 0;
    let stdout = '';
    try {
      execFileSync('bash', [SCRIPT, '--committed', join(tmpdir(), 'missing.ts')], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      ({ status, stdout } = error as { status: number; stdout: string });
    }
    expect(status).toBe(2);
    expect(stdout).toContain('::warning title=Supabase types drift::did not run');
  });
});

describe('ci.yml wiring', () => {
  const workflow = readFileSync(resolve(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
  const lines = workflow.split('\n');

  function stepLines(stepName: string): string[] {
    const start = lines.findIndex(line => line.trimStart() === `- name: ${stepName}`);
    expect(start, `step "${stepName}" not found in ci.yml`).toBeGreaterThan(-1);
    const body: string[] = [];
    for (let i = start + 1; i < lines.length; i += 1) {
      const trimmed = lines[i]?.trimStart() ?? '';
      if (trimmed.startsWith('- name:') || trimmed.startsWith('- uses:')) break;
      body.push(trimmed);
    }
    return body;
  }

  it('runs the drift script with continue-on-error so the job never fails the run', () => {
    const body = stepLines('Compare committed types with the applied schema');
    expect(body).toContain('continue-on-error: true');
    expect(body).toContain('run: pnpm qa:types-drift');
    expect(body.some(line => line.startsWith('PGPASSWORD:'))).toBe(true);
    expect(body.some(line => line.startsWith('MYK9_MIGRATION_DATABASE_URL:'))).toBe(true);
  });

  it('runs this contract in Quality Checks', () => {
    expect(stepLines('Supabase types drift contract')).toContain('run: pnpm qa:types-drift:test');
  });

  it('is on the gating evaluator informational list, matching the job name in ci.yml', () => {
    expect(lines).toContain('    name: Supabase types drift (report-only)');
    const evaluator = readFileSync(
      resolve(REPO_ROOT, 'scripts/ci/evaluate-gating-jobs.sh'),
      'utf8'
    );
    const list = evaluator.match(/INFORMATIONAL_JOBS='(\[[\s\S]*?\])'/)?.[1];
    expect(list, 'INFORMATIONAL_JOBS not found').toBeDefined();
    expect(JSON.parse(list ?? '[]')).toContain('Supabase types drift (report-only)');
  });
});
