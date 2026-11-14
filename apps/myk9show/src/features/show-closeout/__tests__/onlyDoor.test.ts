import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', '..');
const CLOSE_STEP = 'features/show-workbench/CloseOutShowAction.tsx';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [path] : [];
  });
}

// A show write that names the completed status: `updateShow(id, { status: 'completed' })`.
const SHOW_COMPLETED_WRITE = /update(?:Show|Shows)\w*\([^;]*?status:\s*['"]completed['"]/gs;

// Show-status code paths where a status choice could be offered. Trial, class and entry
// status pickers live beside these (TrialEditPanel.tsx, trialsTabViews.ts) and offer
// 'completed' legitimately, so the edit-panel scope is the show editor only.
function inShowStatusScope(rel: string): boolean {
  if (rel.startsWith('components/shows/')) return true;
  if (/^features\/show-[^/]+\//.test(rel)) return true;
  return /^components\/panels\/edit\/Show[^/]*\.tsx?$/.test(rel);
}

// Literals only a show has. A trial or class status union never names these.
const SHOW_ONLY_LITERAL = /['"](?:draft|published|cancelled)['"]/;
// A JSX option `<SelectItem value="completed"` or an options object `{ value: 'completed' }`.
const JSX_COMPLETED_OPTION = /<SelectItem\b[^>]*?\bvalue=(["'])completed\1/g;
const OBJECT_COMPLETED_OPTION = /\bvalue:\s*(['"])completed\1/g;
// The show editor's gated option: listed only when the panel opened on a closed show.
const CLOSED_SHOW_GATE = /initialStatus\s*===\s*['"]completed['"]\s*&&\s*\(\s*$/;
// A type alias whose body is only string literals, e.g. `type ShowStatus = 'completed' | 'cancelled';`.
const LITERAL_UNION =
  /\btype\s+\w+\s*=\s*((?:\|\s*)?['"][\w-]+['"](?:\s*\|\s*['"][\w-]+['"])*)\s*;/g;

/**
 * Kinds of show-status choice that offer 'completed' in one source file: `option` for a
 * picker entry, `union` for a show-status type that includes it. Empty when the file is
 * outside show-status scope, or when the only 'completed' choice is the closed-show gate.
 */
export function offersCompleted(source: string, rel: string): ('option' | 'union')[] {
  if (!inShowStatusScope(rel)) return [];
  const kinds: ('option' | 'union')[] = [];

  if (SHOW_ONLY_LITERAL.test(source)) {
    for (const match of source.matchAll(JSX_COMPLETED_OPTION)) {
      const before = source.slice(Math.max(0, match.index - 200), match.index);
      if (!CLOSED_SHOW_GATE.test(before)) kinds.push('option');
    }
    kinds.push(...[...source.matchAll(OBJECT_COMPLETED_OPTION)].map(() => 'option' as const));
  }

  for (const match of source.matchAll(LITERAL_UNION)) {
    const literals = [...match[1].matchAll(/['"]([\w-]+)['"]/g)].map(hit => hit[1]);
    if (literals.includes('completed') && literals.some(l => SHOW_ONLY_LITERAL.test(`'${l}'`))) {
      kinds.push('union');
    }
  }
  return kinds;
}

describe('no path sets a show to completed except the close step (MYK9-1945)', () => {
  it('only CloseOutShowAction writes status completed to a show', () => {
    const writers = sourceFiles(SRC)
      .filter(file => {
        SHOW_COMPLETED_WRITE.lastIndex = 0;
        return SHOW_COMPLETED_WRITE.test(readFileSync(file, 'utf8'));
      })
      .map(file => relative(SRC, file));

    expect(writers).toEqual([CLOSE_STEP]);
  });

  it('no show-status picker or type offers completed outside the close step', () => {
    const offers = sourceFiles(SRC).flatMap(file => {
      const rel = relative(SRC, file);
      if (rel === CLOSE_STEP) return [];
      return offersCompleted(readFileSync(file, 'utf8'), rel).map(kind => `${rel}: ${kind}`);
    });

    expect(offers).toEqual([]);
  });
});

// Known answers for the offer scan: it must fail the shape the bulk bar had, and pass the
// shapes that are legitimate, so the guard is proven to bite and to stay quiet.
describe('offersCompleted known answers', () => {
  it('fails the old bulk bar shape: a completed union and a Mark Completed option', () => {
    const oldBulkBar = `
type ShowStatus = 'completed' | 'cancelled';
const STATUS_OPTIONS: { value: ShowStatus; label: string }[] = [
  { value: 'completed', label: 'Mark Completed' },
  { value: 'cancelled', label: 'Mark Cancelled' },
];
`;
    const kinds = offersCompleted(oldBulkBar, 'components/shows/browse/ShowBulkActionsBar.tsx');
    expect(kinds.sort()).toEqual(['option', 'union']);
  });

  it('fails an ungated completed SelectItem in the show edit panel', () => {
    const ungated = `
<Select>
  <SelectItem value="completed">Completed</SelectItem>
  <SelectItem value="cancelled">Cancelled</SelectItem>
</Select>
`;
    expect(offersCompleted(ungated, 'components/panels/edit/ShowEditBasicInfoTab.tsx')).toEqual([
      'option',
    ]);
  });

  it('passes the closed-show gated completed option in the show edit panel', () => {
    const gated = `
<Select>
  {initialStatus === 'completed' && (
    <SelectItem value="completed">Closed from the Results tab</SelectItem>
  )}
  <SelectItem value="cancelled">Cancelled</SelectItem>
</Select>
`;
    expect(offersCompleted(gated, 'components/panels/edit/ShowEditBasicInfoTab.tsx')).toEqual([]);
  });

  it('passes a trial status picker that offers completed', () => {
    const trialPicker = `
<Select>
  <SelectItem value="completed">Completed</SelectItem>
  <SelectItem value="cancelled">Cancelled</SelectItem>
</Select>
`;
    expect(offersCompleted(trialPicker, 'components/panels/edit/TrialEditPanel.tsx')).toEqual([]);
  });

  it('passes a trial tab filter union that includes completed', () => {
    const trialTabs = `export type TrialsTabStatus = 'all' | 'pending' | 'completed';`;
    expect(offersCompleted(trialTabs, 'components/shows/tabs/trialsTabViews.ts')).toEqual([]);
  });

  it('passes a read that compares a show status to completed', () => {
    const read = `if (show.status === 'completed' || show.status === 'cancelled') return 'past';`;
    expect(offersCompleted(read, 'components/shows/browse/showsPaneGroups.ts')).toEqual([]);
  });
});
