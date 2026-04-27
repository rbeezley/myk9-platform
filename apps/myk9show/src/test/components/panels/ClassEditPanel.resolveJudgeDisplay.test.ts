import { describe, it, expect } from 'vitest';
import { resolveJudgeDisplay } from '@/components/panels/edit/ClassEditPanel';

/**
 * Regression coverage for the `SelectValue` placeholder fallback. Radix
 * `SelectValue` renders its children verbatim — `''` suppresses the placeholder
 * while `undefined` lets the placeholder show. The helper had a brief stint
 * returning `''` for missing-name cases (caught in code review) which broke
 * "Select a judge" from rendering during roster-load.
 */
describe('resolveJudgeDisplay', () => {
  const roster = [{ judgeId: 'p-1', judgeName: 'Jane Smith' }];

  it("returns 'TBD' when the form holds the literal 'TBD' sentinel", () => {
    expect(resolveJudgeDisplay('TBD', undefined, roster)).toBe('TBD');
    expect(resolveJudgeDisplay('TBD', 'something', roster)).toBe('TBD');
  });

  it('returns undefined when no judgeId is set (placeholder shows)', () => {
    expect(resolveJudgeDisplay(undefined, undefined, roster)).toBeUndefined();
    expect(resolveJudgeDisplay('', undefined, roster)).toBeUndefined();
  });

  it('returns the roster name when the id matches', () => {
    expect(resolveJudgeDisplay('p-1', undefined, roster)).toBe('Jane Smith');
  });

  it('falls back to the form-stored judgeName when the roster has no match', () => {
    expect(resolveJudgeDisplay('p-99', 'Stale Name', roster)).toBe('Stale Name');
  });

  it('returns undefined (not empty string) when both roster and stored name are missing', () => {
    // Critical: must be undefined so Radix renders the placeholder.
    expect(resolveJudgeDisplay('p-99', undefined, roster)).toBeUndefined();
    expect(resolveJudgeDisplay('p-99', undefined, [])).toBeUndefined();
  });
});
