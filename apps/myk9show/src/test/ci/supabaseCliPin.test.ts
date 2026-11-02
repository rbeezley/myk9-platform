// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-1662: on 2026-11-02 Supabase CLI 3.0.0 became `latest`, and every
 * workflow that installed `version: latest` started rejecting
 * supabase/config.toml. Every `supabase/setup-cli` step now names one exact
 * version, so a CLI upgrade arrives through a reviewed PR, not an upstream
 * release. The pin is not tied to pnpm-lock.yaml: the npm `supabase` package
 * rides Dependabot's catch-all group, and a lockfile tie would turn every
 * grouped update red. Move the pin and the lockfile together when upgrading.
 */
const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');
const WORKFLOW_DIR = join(REPO_ROOT, '.github/workflows');

interface SetupCliStep {
  file: string;
  line: number;
  version: string | null;
}

/** Every `supabase/setup-cli` step in a workflow, with its `with.version` (null when absent). */
function setupCliSteps(file: string, text: string): SetupCliStep[] {
  const lines = text.split('\n');
  const steps: SetupCliStep[] = [];
  lines.forEach((line, index) => {
    const uses = /^(\s*)(?:-\s+)?uses:\s*supabase\/setup-cli@/.exec(line);
    if (!uses) return;
    const stepIndent = (uses[1] ?? '').length;
    let version: string | null = null;
    for (let i = index + 1; i < lines.length; i += 1) {
      const next = lines[i] ?? '';
      if (next.trim() === '') continue;
      const indent = next.length - next.trimStart().length;
      // The next step (`- ...` at the step's indent) or anything shallower ends this step.
      if (indent < stepIndent || (indent === stepIndent && next.trimStart().startsWith('-'))) {
        break;
      }
      const match = /^\s*version:\s*['"]?([^'"\s#]+)/.exec(next);
      if (match) {
        version = match[1] ?? null;
        break;
      }
    }
    steps.push({ file, line: index + 1, version });
  });
  return steps;
}

describe('Supabase CLI pin (MYK9-1662)', () => {
  const steps = readdirSync(WORKFLOW_DIR)
    .filter(name => /\.ya?ml$/.test(name))
    .flatMap(name => setupCliSteps(name, readFileSync(join(WORKFLOW_DIR, name), 'utf8')));

  it('pins every setup-cli step to one exact version', () => {
    expect(steps.length).toBeGreaterThan(0);
    const unpinned = steps
      .filter(step => !/^\d+\.\d+\.\d+$/.test(step.version ?? ''))
      .map(step => `${step.file}:${step.line} version=${step.version ?? '(none)'}`);
    const versions = [...new Set(steps.map(step => step.version))];

    expect(unpinned).toEqual([]);
    expect(versions).toHaveLength(1);
  });

  it('reads the version of each step and fails a latest or missing pin (known answers)', () => {
    const workflow = [
      'jobs:',
      '  a:',
      '    steps:',
      '      - uses: supabase/setup-cli@v3',
      '        with:',
      '          version: latest',
      '      - uses: supabase/setup-cli@v3',
      '      - name: next step',
      '        with:',
      '          version: 9.9.9',
      '      - uses: supabase/setup-cli@v3',
      '        with:',
      "          version: '2.122.0' # pinned",
    ].join('\n');

    expect(setupCliSteps('x.yml', workflow).map(step => step.version)).toEqual([
      'latest',
      null,
      '2.122.0',
    ]);
  });
});
