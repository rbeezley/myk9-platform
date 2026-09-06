import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  REGISTERED_TASKS,
  checkPromptParity,
  describeDivergence,
  extractPromptBlock,
  stripFrontmatter,
} from './check-prompt-parity';

const REPO_ROOT = join(__dirname, '..', '..');

const DOC = [
  '# Scheduled things',
  '',
  'Prose that happens to mention `demo-task` outside any heading.',
  '',
  '## Task 1 — `demo-task`',
  '',
  'Some explanation.',
  '',
  '```',
  'Do the thing.',
  '',
  'Working directory: /somewhere',
  '```',
  '',
  '## Task 2 — `fenced-task`',
  '',
  '````',
  'Outer prompt.',
  '',
  '```sql',
  'select 1;',
  '```',
  '````',
  '',
  '## Task 3 — `blockless-task`',
  '',
  'This task section has no prompt block at all.',
  '',
  '## Task 4 — `other-task`',
  '',
  '```',
  'Not the block you were looking for.',
  '```',
  '',
].join('\n');

const DEMO_BODY = ['Do the thing.', '', 'Working directory: /somewhere'].join('\n');

function installed(body: string): string {
  return ['---', 'name: demo-task', 'description: A demo.', '---', '', body, ''].join('\n');
}

describe('extractPromptBlock', () => {
  it('reads the block under the task heading, not an earlier mention in prose', () => {
    expect(extractPromptBlock(DOC, 'demo-task')).toBe(DEMO_BODY);
  });

  it('matches the fence length so a nested ``` does not close the block early', () => {
    expect(extractPromptBlock(DOC, 'fenced-task')).toBe(
      ['Outer prompt.', '', '```sql', 'select 1;', '```'].join('\n')
    );
  });

  it('throws rather than reading the NEXT task’s block when a section has none', () => {
    expect(() => extractPromptBlock(DOC, 'blockless-task')).toThrow(/no prompt block/);
  });

  it('throws when no heading names the task', () => {
    expect(() => extractPromptBlock(DOC, 'absent-task')).toThrow(/no heading naming/);
  });
});

describe('stripFrontmatter', () => {
  it('removes only the frontmatter', () => {
    expect(stripFrontmatter(installed(DEMO_BODY))).toBe(DEMO_BODY);
  });

  it('throws on a file with no frontmatter rather than comparing the whole text', () => {
    expect(() => stripFrontmatter(DEMO_BODY)).toThrow(/no YAML frontmatter/);
  });
});

describe('describeDivergence', () => {
  it('names the first differing line', () => {
    const detail = describeDivergence('a\nb\nc', 'a\nB\nc');
    expect(detail).toContain('line 2');
    expect(detail).toContain('"b"');
    expect(detail).toContain('"B"');
  });
});

describe('checkPromptParity', () => {
  let root: string;
  let installRoot: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'prompt-parity-'));
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'tasks.md'), DOC);

    installRoot = join(root, 'installed');
    mkdirSync(join(installRoot, 'demo-task'), { recursive: true });
    writeFileSync(join(installRoot, 'demo-task', 'SKILL.md'), installed(DEMO_BODY));
    mkdirSync(join(installRoot, 'other-task'), { recursive: true });
    writeFileSync(
      join(installRoot, 'other-task', 'SKILL.md'),
      installed('Not the block you were looking for, drifted.')
    );
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('reports a match when the installed body equals the documented block', () => {
    const [result] = checkPromptParity({
      repoRoot: root,
      installRoot,
      tasks: [{ taskId: 'demo-task', doc: 'docs/tasks.md' }],
    });
    expect(result.status).toBe('match');
  });

  it('reports drift when one line of the installed body changed', () => {
    const [result] = checkPromptParity({
      repoRoot: root,
      installRoot,
      tasks: [{ taskId: 'other-task', doc: 'docs/tasks.md' }],
    });
    expect(result.status).toBe('drift');
    expect(result.detail).toContain('line 1');
  });

  it('reports not-installed instead of a silent pass', () => {
    const [result] = checkPromptParity({
      repoRoot: root,
      installRoot,
      tasks: [{ taskId: 'fenced-task', doc: 'docs/tasks.md' }],
    });
    expect(result.status).toBe('not-installed');
  });

  it('throws when a registered task has no documented block', () => {
    expect(() =>
      checkPromptParity({
        repoRoot: root,
        installRoot,
        tasks: [{ taskId: 'blockless-task', doc: 'docs/tasks.md' }],
      })
    ).toThrow(/no prompt block/);
  });
});

describe('the real registry', () => {
  it('finds a prompt block in the repo for every registered task', () => {
    for (const { taskId, doc } of REGISTERED_TASKS) {
      const markdown = readFileSync(join(REPO_ROOT, doc), 'utf8');
      expect(() => extractPromptBlock(markdown, taskId), `${taskId} in ${doc}`).not.toThrow();
    }
  });

  it('registers every task documented in the two scheduled-task docs', () => {
    // Omission from REGISTERED_TASKS is the failure mode this check exists to
    // catch: an unregistered task is never compared, and its installed prompt
    // drifts silently. Any `## ... `<task-id>`` heading with a prompt block
    // under it must be registered.
    const docs = [...new Set(REGISTERED_TASKS.map(t => t.doc))];
    const documented: string[] = [];
    for (const doc of docs) {
      const markdown = readFileSync(join(REPO_ROOT, doc), 'utf8');
      for (const line of markdown.split('\n')) {
        const match = /^#{2,4} .*`([a-z0-9-]+)`/.exec(line);
        if (!match) continue;
        const taskId = match[1];
        try {
          extractPromptBlock(markdown, taskId);
        } catch {
          continue; // a heading naming something that is not a prompt-carrying task
        }
        documented.push(taskId);
      }
    }
    expect([...new Set(documented)].sort()).toEqual(
      [...REGISTERED_TASKS.map(t => t.taskId)].sort()
    );
  });

  it('the daily commit review prompt does not assert the Codex stream’s state', () => {
    // MYK9-408: the installed prompt said Codex "is paused for token budget"
    // long after it resumed, and told the run to assume Codex had not run.
    // A premise about a counterpart that can change is not a fact a prompt
    // may carry — the boundary row is what tells a run what is uncovered.
    const markdown = readFileSync(
      join(REPO_ROOT, 'docs/operations/scheduled-audits-claude.md'),
      'utf8'
    );
    const prompt = extractPromptBlock(markdown, 'claude-daily-commit-review');
    expect(prompt).not.toMatch(/paused for token budget/i);
    expect(prompt).not.toMatch(/Assume Codex has not run/i);
    expect(prompt).toMatch(/do not assume whether another reviewer has run/i);
  });
});
