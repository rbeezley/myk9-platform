/**
 * One Undo for every day-of change (MYK9-2062): every day-of Undo goes through
 * `showUndoToast` and lasts `STATUS_UNDO_WINDOW_MS` (8 seconds). A hand-rolled sonner Undo,
 * or a day-of caller with its own duration, brings back per-surface timings.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcDir = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'test' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = sourceFiles(srcDir).map(full => ({
  path: relative(srcDir, full).replaceAll('\\', '/'),
  text: readFileSync(full, 'utf8'),
}));

/** Undo toasts that are not day-of changes, each with the reason it may differ. */
const NOT_DAY_OF = new Set([
  'lib/undoToast.ts', // the helper itself
  'lib/notifications.tsx', // generic "deleted" notification (record delete, not a show-day change)
  'features/delete/deleteUndoToast.ts', // record delete: 10-minute server window, 15 s toast
  'features/show-workbench/workbenchAnnouncementPost.ts', // posted announcement, not an entry change
]);

describe('day-of Undo toasts (MYK9-2062)', () => {
  it('has one 8 second window constant', () => {
    const helper = files.find(f => f.path === 'lib/undoToast.ts')?.text ?? '';
    expect(helper).toContain('export const STATUS_UNDO_WINDOW_MS = 8000;');
    expect(helper).toContain('duration = STATUS_UNDO_WINDOW_MS');
  });

  it('builds no Undo toast by hand outside the helper', () => {
    const offenders = files
      .filter(f => !NOT_DAY_OF.has(f.path) && /label:\s*['"]Undo['"]/.test(f.text))
      .map(f => f.path);
    expect(offenders).toEqual([]);
  });

  it('gives no day-of showUndoToast call a duration of its own', () => {
    const offenders = files
      .filter(f => !NOT_DAY_OF.has(f.path) && f.text.includes('showUndoToast('))
      .filter(f =>
        [...f.text.matchAll(/\bduration:\s*([^,}\n]+)/g)].some(
          m => m[1]?.trim() !== 'STATUS_UNDO_WINDOW_MS'
        )
      )
      .map(f => f.path);
    expect(offenders).toEqual([]);
  });

  it('keeps run order hand-placing on the shared window', () => {
    const autoSort =
      files.find(f => f.path === 'features/show-map/useShowMapRunOrderAutoSort.ts')?.text ?? '';
    expect(autoSort).toContain("import { STATUS_UNDO_WINDOW_MS } from '@/lib/undoToast';");
    expect(autoSort).toContain('}, STATUS_UNDO_WINDOW_MS);');
    expect(autoSort).not.toMatch(/\b8000\b|\b8_000\b/);
  });

  it('routes every day-of surface through showUndoToast', () => {
    const surfaces = [
      'components/entries/management/checkInDesk/useDeskPull.ts',
      'features/at-show/offerPullUndo.ts',
      'pages/MyEntriesPage/modules/useMyEntriesDialogs.ts',
      'features/show-map/cockpit/useMarkEntryAbsent.tsx',
      'hooks/useEntryManagementActions.ts',
      'hooks/useBulkDispatch.ts',
      'features/show-map/useShowMapActionExecutor.ts',
    ];
    for (const path of surfaces) {
      expect(files.find(f => f.path === path)?.text, path).toContain('showUndoToast(');
    }
  });
});
