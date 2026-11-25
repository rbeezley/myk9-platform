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
