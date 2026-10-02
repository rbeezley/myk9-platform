import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import SimpleEditForm from '../SimpleEditForm';
import type { TrialClass } from '@/components/trials/types/trial.types';

// MYK9-931 (M13): required fields use the shared marker, not a bare asterisk a
// screen reader reads as "star".
describe('SimpleEditForm required markers', () => {
  it('names Judge, Start Time and Status "(required)" and leaves no bare asterisk', () => {
    const { baseElement } = render(
      <SimpleEditForm
        open
        onOpenChange={vi.fn()}
        trialClassData={
          {
            id: 'c1',
            element: 'Container',
            level: 'Novice',
            section: 'A',
            judgeId: 'TBD',
            judgeName: 'TBD',
            startTime: '',
            status: 'Upcoming',
            entries: 0,
          } as unknown as TrialClass
        }
        assignedJudges={[]}
        onFieldChange={vi.fn()}
        onSave={vi.fn()}
      />
    );
    for (const label of ['Judge', 'Start Time', 'Status']) {
      expect(screen.getByText(label, { selector: 'label' })).toHaveTextContent(
        new RegExp(`${label}\\*?\\(required\\)`)
      );
    }
    const bare = Array.from(baseElement.querySelectorAll('span')).filter(
      el => el.textContent?.trim() === '*' && el.getAttribute('aria-hidden') !== 'true'
    );
    expect(bare).toEqual([]);
  });
});
