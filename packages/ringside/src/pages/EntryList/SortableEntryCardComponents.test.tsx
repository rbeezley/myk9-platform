import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RegularResultBadges } from './SortableEntryCardComponents';
import type { Entry } from '../../stores/entryStore';

/**
 * Regression for PR #436 review: result-badge color is keyed on the leading
 * token of the result text, so free-form values ("NQ - No Find", "Q - 1st")
 * color correctly instead of falling through to muted (the old CSS matched the
 * `.nq` / `.q` token; an exact whole-string lookup did not).
 */
function makeEntry(resultText: string): Entry {
  return {
    id: '1',
    resultText,
    isScored: true,
    showQualification: true,
    showPlacement: false,
    showTime: false,
    showFaults: false,
  } as unknown as Entry;
}

describe('RegularResultBadges — result color keyed on leading token', () => {
  const cases: Array<{ result: string; expectClass: string }> = [
    { result: 'Q', expectClass: 'bg-status-checked-in' },
    { result: 'Q - 1st', expectClass: 'bg-status-checked-in' },
    { result: 'NQ', expectClass: 'bg-red-600' },
    { result: 'NQ - No Find', expectClass: 'bg-red-600' },
    { result: 'EX - Excused', expectClass: 'bg-red-600' },
    { result: 'ABS', expectClass: 'bg-violet-600' },
    { result: 'WD - Withdrawn', expectClass: 'bg-violet-600' },
  ];

  it.each(cases)('colors "$result" with $expectClass', ({ result, expectClass }) => {
    const { container } = render(<RegularResultBadges entry={makeEntry(result)} />);
    const badge = container.querySelector('span.uppercase');
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain(expectClass);
  });

  it('falls back to muted for an unrecognized result', () => {
    const { container } = render(<RegularResultBadges entry={makeEntry('???')} />);
    const badge = container.querySelector('span.uppercase');
    expect(badge?.className).toContain('bg-muted');
  });
});
