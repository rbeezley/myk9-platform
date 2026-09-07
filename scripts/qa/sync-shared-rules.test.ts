import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BEGIN, END, syncSharedRules } from './sync-shared-rules';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(shared: string, claude: string, agents: string): string {
  const root = mkdtempSync(join(tmpdir(), 'shared-rules-'));
  dirs.push(root);
  mkdirSync(join(root, 'docs/agents'), { recursive: true });
  writeFileSync(join(root, 'docs/agents/shared-rules.md'), shared);
  writeFileSync(join(root, 'CLAUDE.md'), claude);
  writeFileSync(join(root, 'AGENTS.md'), agents);
  return root;
}
const wrap = (body: string, before = '# X\n\n', after = '\n## Only here\n') =>
  `${before}${BEGIN}\n${body}\n${END}${after}`;

describe('syncSharedRules', () => {
  it('passes when both files carry the shared body verbatim', () => {
    const root = repo(
      '## Rule\n\nDo the thing.\n',
      wrap('## Rule\n\nDo the thing.'),
      wrap('## Rule\n\nDo the thing.')
    );
    expect(syncSharedRules({ root, mode: 'check' })).toEqual({ changed: [], problems: [] });
  });

  it('fails check on a single-byte drift and names the file', () => {
    const root = repo(
      '## Rule\n\nDo the thing.\n',
      wrap('## Rule\n\nDo the thing.'),
      wrap('## Rule\n\nDo the thing!')
    );
    const result = syncSharedRules({ root, mode: 'check' });
    expect(result.problems).toEqual([
      'AGENTS.md: shared-rules block differs from docs/agents/shared-rules.md',
    ]);
  });

  it('fails check when a marker pair is missing', () => {
    const root = repo('## Rule\n', wrap('## Rule'), '# No markers\n');
    expect(syncSharedRules({ root, mode: 'check' }).problems).toEqual([
      'AGENTS.md: missing shared-rules markers',
    ]);
  });

  it('fails check on a second marker pair (a stale duplicate block would otherwise hide)', () => {
    const root = repo('## Rule\n', wrap('## Rule'), `${wrap('## Rule')}\n${wrap('## Stale')}`);
    expect(syncSharedRules({ root, mode: 'check' }).problems).toEqual([
      'AGENTS.md: more than one shared-rules marker pair',
    ]);
  });

  it('write rewrites only the block and keeps everything outside it', () => {
    const root = repo('## New\n', wrap('## Old', '# Head\n', '\n## Tail\n'), wrap('## Old'));
    expect(syncSharedRules({ root, mode: 'write' }).changed.sort()).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
    ]);
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toBe(
      `# Head\n${BEGIN}\n\n## New\n\n${END}\n## Tail\n`
    );
    expect(syncSharedRules({ root, mode: 'check' })).toEqual({ changed: [], problems: [] });
  });

  it('the real repo is in sync (positive control on the actual files)', () => {
    const root = join(import.meta.dirname, '../..');
    const result = syncSharedRules({ root, mode: 'check' });
    expect(result.problems).toEqual([]);
    const shared = readFileSync(join(root, 'docs/agents/shared-rules.md'), 'utf8');
    // Vacuity guard: an empty shared file would also "sync".
    expect(shared.length).toBeGreaterThan(2000);
  });
});
