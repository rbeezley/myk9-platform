import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@/test/utils/testUtils';

import { readResultsTabUrlState } from '@/features/results-tab/resultsTabRoutes';
import { ClassChecklistSection } from './ClassChecklistSection';
import { SHOW_MAP_WRAP_UP_STATUS } from '../showMapTypes';
import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

describe('ClassChecklistSection judge sign-off undo (MYK9-1030)', () => {
  it('offers Undo initials as a full-size touch target that runs the undo command', async () => {
    const onCommand = vi.fn();
    render(
      <ClassChecklistSection
        showId="show-1"
        sourceClass={fromPartial<SecretaryCockpitClass>({
          id: 'c1',
          lifecycle: 'complete',
          entryCount: 2,
          scoredCount: 2,
          wrapUpStatus: SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE,
          registryId: 'AKC',
          judgeSignOffUndoCommandId: 'clear-judge-sign-off:class:c1',
        })}
        paperwork={[]}
        timeZone="America/New_York"
        onCommand={onCommand}
      />
    );

    const undo = screen.getByRole('button', { name: /undo initials/i });
    expect(undo).toHaveClass('min-h-11');
    await userEvent.click(undo);
    expect(onCommand).toHaveBeenCalledWith('clear-judge-sign-off:class:c1');
  });
});

describe('ClassChecklistSection after-scoring items (MYK9-1032)', () => {
  const completeClass = fromPartial<SecretaryCockpitClass>({
    id: 'c1',
    trialId: 't1',
    lifecycle: 'complete',
    entryCount: 2,
    scoredCount: 2,
    wrapUpStatus: SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
    registryId: 'AKC',
  });
  const printable = (reportId: string, label: string) => ({
    reportId,
    label,
    state: 'unconfirmed' as const,
    printHref: `/print/${reportId}`,
    confirmation: {
      scope: { kind: 'show' as const, showId: 'show-1' },
      coverage: {},
      fingerprint: 'f',
    },
  });
  const paperwork = [
    printable('check-in-sheet', 'Check-in sheet'),
    printable('scoresheet', 'Score sheets'),
    printable('results-sheet', 'Results'),
    printable('result-labels', 'Result labels'),
  ];

  it('links preliminary results, ribbon labels and initials to the class on Results, as links not actions', () => {
    render(
      <ClassChecklistSection
        showId="show-1"
        sourceClass={completeClass}
        paperwork={paperwork}
        timeZone="America/New_York"
        onCommand={vi.fn()}
      />
    );
    const items = within(screen.getByRole('region', { name: 'Class checklist' })).getAllByRole(
      'listitem'
    );
    for (const index of [4, 5, 6]) {
      const link = within(items[index]!).getByRole('link');
      const url = new URL(link.getAttribute('href')!, 'https://x.test');
      expect(url.pathname).toBe('/shows/show-1/results');
      expect(url.searchParams.get('classId')).toBe('c1');
      expect(url.searchParams.get('trialId')).toBe('t1');
      // The Results tab itself reads this URL back to the same class.
      expect(readResultsTabUrlState(url.searchParams)).toMatchObject({
        classId: 'c1',
        trialId: 't1',
      });
      expect(within(items[index]!).queryByRole('button')).toBeNull();
    }
  });

  it('offers print only for check-in and score sheets, never the results sheet or result labels', () => {
    render(
      <ClassChecklistSection
        showId="show-1"
        sourceClass={completeClass}
        paperwork={paperwork}
        timeZone="America/New_York"
        onCommand={vi.fn()}
      />
    );
    const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'));
    expect(hrefs).toContain('/print/check-in-sheet');
    expect(hrefs).toContain('/print/scoresheet');
    expect(hrefs).not.toContain('/print/results-sheet');
    expect(hrefs).not.toContain('/print/result-labels');
    expect(screen.queryByText('Other paperwork')).toBeNull();
  });
});
