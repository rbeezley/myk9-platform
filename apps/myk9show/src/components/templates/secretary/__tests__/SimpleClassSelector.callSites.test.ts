/**
 * COMPLETENESS guard for F4 — every mount of `SimpleClassSelector` must supply
 * `addJudge`, or that surface silently keeps the original dead end.
 *
 * This is deliberately a source scan, and it is honest about what that can and cannot
 * prove. It does NOT prove the notice works — `SimpleClassSelector.noJudges.test.tsx`
 * renders the component and asserts the rendered affordance for that. What no rendering
 * test can check is whether some OTHER file mounts the component and forgets the prop,
 * because that file has no test of its own and the prop is optional, so typecheck stays
 * silent too.
 *
 * Three consumers exist and the third was missed twice: I wired the wizard and the
 * dialog, and Codex found `AddClassesToTrialPanel` still bare. A structural rule is the
 * only thing that fails when a fourth appears.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Files containing a `<SimpleClassSelector` JSX mount, excluding its own definition. */
function findMountSites(): Array<{ file: string; hasAddJudge: boolean }> {
  return walk(SRC)
    .map(file => ({ file, source: readFileSync(file, 'utf8') }))
    .filter(
      ({ file, source }) =>
        source.includes('<SimpleClassSelector') && !file.endsWith('SimpleClassSelector.tsx')
    )
    .map(({ file, source }) => {
      // Slice the JSX element's own attribute list rather than searching the whole
      // file, so an unrelated `addJudge` elsewhere cannot satisfy this.
      const start = source.indexOf('<SimpleClassSelector');
      const end = source.indexOf('/>', start);
      const attrs = source.slice(start, end === -1 ? undefined : end);
      return { file: file.replace(SRC, ''), hasAddJudge: attrs.includes('addJudge') };
    });
}

describe('every SimpleClassSelector mount offers a way to add a judge', () => {
  it('finds the known consumers', () => {
    // A guard that matched nothing would pass forever. Pin that it sees real sites.
    const sites = findMountSites();
    expect(sites.length).toBeGreaterThanOrEqual(3);
  });

  it('passes addJudge at every mount', () => {
    const missing = findMountSites()
      .filter(site => !site.hasAddJudge)
      .map(site => site.file);

    expect(missing).toEqual([]);
  });
});
