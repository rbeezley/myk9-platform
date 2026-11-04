import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-1645: "CI: <workflow> is failing" issues must close on a green run.
 *
 * The notifier closes the open issue only when it is REACHED on a green run
 * (not skipped by a failure-only gate) and is handed an outcome of `success`
 * for a green run, under the same workflow-name that opened the issue (the
 * title is the lookup key). This checks those three properties for every
 * workflow that wires the action, enumerated from disk.
 */

const workflowsDir = resolve(__dirname, '../../../../../.github/workflows');
const ACTION = './.github/actions/report-scheduled-failure';

interface Wiring {
  file: string;
  name: string;
  outcome: string;
  /** `if:` conditions on the step and on its job; empty string when absent. */
  stepIf: string;
  jobIf: string;
}

const indentOf = (line: string) => /^\s*/.exec(line)![0].length;
const stripQuotes = (v: string) => v.trim().replace(/^['"]|['"]$/g, '');

function wirings(): Wiring[] {
  const out: Wiring[] = [];
  for (const file of readdirSync(workflowsDir).filter(f => /\.ya?ml$/.test(f))) {
    const lines = readFileSync(join(workflowsDir, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.includes(`uses: ${ACTION}`)) return;
      // Step block: from the `- ` line that opens it to the next sibling step.
      let start = i;
      while (start > 0 && !/^\s*- /.test(lines[start]!)) start--;
      const stepIndent = indentOf(lines[start]!);
      let end = i + 1;
      while (
        end < lines.length &&
        (lines[end]!.trim() === '' || indentOf(lines[end]!) > stepIndent)
      )
        end++;
      const step = lines.slice(start, end);
      const grab = (block: string[], key: string, indent?: number) => {
        const l = block.find(
          x =>
            new RegExp(`^\\s*(- )?${key}:`).test(x) &&
            (indent === undefined || indentOf(x) === indent)
        );
        return l ? l.replace(new RegExp(`^\\s*(- )?${key}:`), '').trim() : '';
      };
      // Job block: nearest line at indent 2 under `jobs:` above the step.
      let jobStart = start;
      while (
        jobStart > 0 &&
        !(indentOf(lines[jobStart]!) === 2 && /^\s{2}[\w-]+:\s*$/.test(lines[jobStart]!))
      )
        jobStart--;
      const job = lines.slice(jobStart, start);
      out.push({
        file,
        name: stripQuotes(grab(step, 'workflow-name')),
        outcome: grab(step, 'outcome'),
        stepIf: grab(step, 'if'),
        jobIf: grab(job, 'if', 4),
      });
    });
  }
  return out;
}

const all = wirings();

describe('scheduled-failure notifier closes its issue on a green run', () => {
  it('finds the wired workflows (guards the guard)', () => {
    expect(all.length).toBeGreaterThanOrEqual(11);
    expect(all.every(w => w.name !== '' && w.outcome !== '')).toBe(true);
  });

  it('gives every workflow its own issue title', () => {
    // The lookup key is the exact title, so two workflows sharing a name would
    // close or refresh each other's issue.
    const names = all.map(w => w.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(all.map(w => [w.file, w] as const))(
    '%s reaches the notifier on a green run',
    (_file, w) => {
      // A failure-only gate would open the issue and never close it.
      const effective = [w.stepIf, w.jobIf].filter(Boolean);
      for (const cond of effective) {
        expect(cond).not.toMatch(/^\$?\{?\{?\s*failure\(\)/);
        expect(cond).not.toMatch(/\bcancelled\(\)/);
      }
      // One of the two gates must be `always()` (a bare step defaults to
      // `success()`, which skips the step on the failure it reports; a job
      // with `needs:` is skipped when a need fails).
      expect(effective.some(c => /\balways\(\)/.test(c))).toBe(true);
    }
  );

  it.each(all.map(w => [w.file, w] as const))(
    '%s passes `success` on a green run and a non-success otherwise',
    (_file, w) => {
      const expr = /^\$\{\{\s*(.*?)\s*\}\}$/.exec(w.outcome)?.[1];
      expect(expr, `outcome must be one expression, got: ${w.outcome}`).toBeTruthy();
      // Evaluate the expression the way Actions would, against stub contexts.
      const evaluate = (result: string) => {
        const any = new Proxy({}, { get: () => ({ result, status: result }) });
        const ctx = { needs: any, job: { status: result } };
        const js = expr!.replace(/needs\.([\w-]+)/g, "needs['$1']").replace(/==/g, '===');
        return new Function('needs', 'job', `return (${js});`)(ctx.needs, ctx.job) as string;
      };
      expect(evaluate('success')).toBe('success');
      expect(evaluate('failure')).not.toBe('success');
    }
  );
});
