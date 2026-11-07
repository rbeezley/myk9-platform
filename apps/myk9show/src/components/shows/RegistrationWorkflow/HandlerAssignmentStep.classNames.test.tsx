import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * MYK9-1732: on a phone the Handlers step truncated each row's class name to nothing, so a
 * secretary with several entries could not tell which row to change. Every row must name its
 * class, and each Change button must say which class it changes.
 */

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    dogs: [{ id: 'dog-1', callName: 'Ziva', breed: 'Beagle' }],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({
    classes: [
      {
        id: 'c-1',
        trialId: 't-1',
        className: 'Container Novice A',
        element: 'Container',
        level: 'Novice',
        section: 'A',
      },
      {
        id: 'c-2',
        trialId: 't-1',
        className: 'Interior Novice A',
        element: 'Interior',
        level: 'Novice',
        section: 'A',
      },
    ],
  }),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => ({ trials: [{ id: 't-1', name: 'Trial 1', trialDate: '2026-12-07' }] }),
}));

vi.mock('./HandlerSelectionDialog', () => ({ HandlerSelectionDialog: () => null }));

import { HandlerAssignmentStep } from './HandlerAssignmentStep';

describe('HandlerAssignmentStep row labels', () => {
  it('names each row by class, and each Change button by the class it changes', () => {
    render(
      <HandlerAssignmentStep
        selectedDogs={['dog-1']}
        classSelections={[
          {
            dogId: 'dog-1',
            trialId: 't-1',
            selectedClasses: [{ classId: 'c-1' }, { classId: 'c-2' }],
          },
        ]}
        handlerAssignments={
          {
            'dog-1|c-1': { handlerName: 'Reese Owner', isOwner: true },
            'dog-1|c-2': { handlerName: 'Reese Owner', isOwner: true },
          } as never
        }
        onHandlerAssignmentChange={vi.fn()}
      />
    );

    for (const name of ['Container Novice A', 'Interior Novice A']) {
      const label = screen.getByText(name);
      // A truncating label is what hid the class on a phone; below `sm` it must wrap instead.
      expect(label.className.split(' ')).not.toContain('truncate');
      expect(
        screen.getByRole('button', { name: `Change handler for ${name}` })
      ).toBeInTheDocument();
    }
  });
});
