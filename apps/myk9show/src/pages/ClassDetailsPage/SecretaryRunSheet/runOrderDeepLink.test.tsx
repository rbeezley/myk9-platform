/**
 * F29b phase 2a, review finding — the "Set run order" deep link must carry the DAY,
 * not just the focused class.
 *
 * Show Desk's `focusClass` searches only the selected day's classes and silently falls
 * back to `in-progress ?? not-started ?? classes[0]` when the focused id is not among
 * them. So on a multi-day show, a link to a Sunday class opens Show Desk on its default
 * day, focuses a DIFFERENT class, and the run-order menu there would auto-sort that
 * one — a destructive write to a class the secretary never chose.
 *
 * My own browser check missed this because it passed `day=` explicitly in the URL,
 * which the real link did not.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';

vi.mock('./useRunSheetState', () => ({
  useRunSheetState: () => ({
    sortedEntries: [
      { id: 'e1', dogName: 'Ranger', armband: '101' },
      { id: 'e2', dogName: 'Juni', armband: '102' },
    ],
    checkInBusyId: null,
    onCheckInChange: vi.fn(),
  }),
}));
vi.mock('./RunSheetRow', () => ({
  RunSheetRow: () => <div data-testid="run-sheet-row" />,
}));

import { SecretaryRunSheet } from './index';

const CLASS = { id: 'class-1', name: 'Container Novice A' } as never;

function renderSheet(classDay?: string | null) {
  render(
    <SecretaryRunSheet
      currentClass={CLASS}
      dbRawEntries={[] as never}
      userId="user-1"
      dogs={[] as never}
      parentShowId="show-1"
      {...(classDay !== undefined ? { classDay } : {})}
    />
  );
  return screen.getByRole('link', { name: /set run order/i });
}

describe('run-order deep link', () => {
  it('carries the class day so Show Desk focuses the right class', () => {
    const href = renderSheet('2026-08-02').getAttribute('href') ?? '';

    expect(href).toContain('/shows/show-1/show-desk');
    expect(href).toContain('focus=class-1');
    // Without this, a Sunday class opens on Saturday and the run-order menu
    // would act on whatever class Show Desk fell back to.
    expect(href).toContain('day=2026-08-02');
  });

  it('omits the day when the trial is unresolved rather than inventing one', () => {
    const href = renderSheet(null).getAttribute('href') ?? '';

    expect(href).toContain('focus=class-1');
    expect(href).not.toContain('day=');
  });

  it('normalizes a datetime trial date to the day Show Desk accepts', () => {
    // normalizeCockpitUrlState matches ^\d{4}-\d{2}-\d{2}$ and silently drops
    // anything else, which would put us back on the wrong class. trials.date is a
    // DATE column today, so this is defence against a future shape change rather
    // than a live defect.
    const href = renderSheet('2026-08-02T00:00:00.000Z').getAttribute('href') ?? '';

    expect(href).toContain('day=2026-08-02');
    expect(href).not.toContain('T00');
  });
});
