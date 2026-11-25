// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkGuides,
  repoSourceRoots,
  type Allowlist,
} from '../../../../../scripts/qa/guide-ui-strings';

/**
 * MYK9-2397: a guide that quotes UI text the app no longer has fails CI with file and line.
 * The fixture is a tiny fake guide plus a fake source tree; the last test runs the real guides.
 */
const repoRoot = resolve(import.meta.dirname, '../../../../..');
const none: Allowlist = { nonUi: [], knownDrift: [] };

describe('guide UI strings (fixture)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'guide-ui-'));
    mkdirSync(join(dir, 'guides'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(
      join(dir, 'src', 'Page.tsx'),
      "export const P = () => <button>Show Desk</button>;\nconst t = 'Needs attention';\n"
    );
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const run = (guide: string, allow: Allowlist = none) => {
    writeFileSync(join(dir, 'guides', 'fake-guide.md'), guide);
    return checkGuides(join(dir, 'guides'), [join(dir, 'src')], allow);
  };

  it('passes a label the app has, bold or quoted, in any case', () => {
    expect(run('Open **Show Desk**.\n\nThe "needs attention" strip.\n')).toEqual([]);
  });

  it('fails a removed label with the guide file and line', () => {
    const findings = run('Intro.\n\nChoose **Show Desk**, then **Judge Supplies**.\n');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 3, text: 'Judge Supplies' });
    expect(findings[0]?.file).toMatch(/fake-guide\.md$/);
  });

  it('passes an allowlisted quote and checks each part of a path', () => {
    expect(run('Dog **Maple Leaf** won.\n', { nonUi: ['Maple Leaf'], knownDrift: [] })).toEqual([]);
    const findings = run('Go to **Show Desk → Old Tab**.\n');
    expect(findings.map(f => f.text)).toEqual(['Old Tab']);
  });

  it('ignores outlines, headings echoed in text, code fences and sub-heading lines', () => {
    writeFileSync(join(dir, 'guides', 'x-guide-outline.md'), 'Open **Gone Label**.\n');
    const guide =
      '## Status meanings\n\nSee **Status meanings**.\n\n**A lead-in line**\n\n```\n**Fenced**\n```\n';
    expect(run(guide)).toEqual([]);
  });
});

describe('guide UI strings (matching rules)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'guide-ui-'));
    mkdirSync(join(dir, 'guides'));
    mkdirSync(join(dir, 'src'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const run = (source: string, guide: string) => {
    writeFileSync(join(dir, 'src', 'Page.tsx'), source);
    writeFileSync(join(dir, 'guides', 'fake-guide.md'), guide);
    return checkGuides(join(dir, 'guides'), [join(dir, 'src')], none).map(f => f.text);
  };

  it('does not count a label that appears only in a comment', () => {
    const source = '// Gone Label was removed\n/** Old Panel */\nexport const x = 1;\n';
    expect(run(source, 'Open **Gone Label** or **Old Panel**.\n')).toEqual([
      'Gone Label',
      'Old Panel',
    ]);
  });

  it('does not match a short label inside a longer word', () => {
    const source = "export const a = 'desktop payment';\n";
    expect(run(source, 'Open **Desk**, then **Pay**.\n')).toEqual(['Desk', 'Pay']);
    expect(run(source, 'See **desktop** and **payment**.\n')).toEqual([]);
  });

  it('splits a path only on arrows or a spaced greater-than', () => {
    const source = "export const a = ['Show Desk', 'Thing'];\n";
    expect(run(source, 'Go to **Gone > Thing**.\n')).toEqual(['Gone']);
    expect(run(source, 'Go to **Gone>Thing**.\n')).toEqual(['Gone>Thing']);
    expect(run(source, 'Go to **Show Desk > Gone**.\n')).toEqual(['Gone']);
    expect(run(source, 'Go to **Show Desk -> Gone**.\n')).toEqual(['Gone']);
  });

  it('matches the static text of a template literal and JSX attribute strings', () => {
    const source =
      'export const a = (n: number) => `Check in ${n} entries`;\n' +
      'export const b = <input placeholder="Search dogs" aria-label="Dog name" />;\n';
    expect(
      run(source, 'Press **Check in**, **entries**, **Search dogs**, **Dog name**.\n')
    ).toEqual([]);
  });
});

describe('the published guides', () => {
  it('quote no UI text the app has removed', () => {
    const allow = JSON.parse(
      readFileSync(join(repoRoot, 'scripts/qa/guide-ui-strings.allowlist.json'), 'utf8')
    ) as Allowlist;
    const findings = checkGuides(
      join(repoRoot, 'docs/user-guides'),
      repoSourceRoots(repoRoot),
      allow
    ).map(f => `${f.file.replace(repoRoot + '/', '')}:${f.line} "${f.text}"`);
    expect(findings).toEqual([]);
  });
});
