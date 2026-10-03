// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');

/**
 * AskQ answers support questions from a generated copy of the user guides
 * (`supabase/functions/_shared/askq/documentAssets.ts`). Nothing checked that
 * copy, so it went stale across a month of guide edits and AskQ described
 * screens that no longer existed. Any guide or rulebook edit must regenerate it.
 */
describe('AskQ document assets', () => {
  it('match the current user guides and rulebooks', () => {
    let output = '';
    let failed = false;
    try {
      output = execFileSync('node', ['scripts/prepare-askq-documents.mjs', '--check'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      failed = true;
      output = String((error as { stderr?: string }).stderr ?? error);
    }
    expect(failed, output).toBe(false);
  }, 30_000);
});
