/**
 * MYK9-832 #10: a dog entered in the identical class ("Vehicle Novice B") in
 * two trials on the same day showed the same row twice on the Handlers step,
 * with nothing telling them apart.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';

const { mockUseDogStoreCompat, mockUseClassStoreCompat, mockUseTrialStore } = vi.hoisted(() => ({
  mockUseDogStoreCompat: vi.fn(),
  mockUseClassStoreCompat: vi.fn(),
  mockUseTrialStore: vi.fn(),
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: mockUseDogStoreCompat }));
vi.mock('@/hooks/useClassStoreCompat', () => ({ useClassStoreCompat: mockUseClassStoreCompat }));
vi.mock('@/store/trialStore', () => ({ useTrialStore: mockUseTrialStore }));

import { HandlerAssignmentStep } from '../HandlerAssignmentStep';

const DOG = { id: 'dog-1', name: 'Rover', callName: 'Rover', breed: 'Labrador' };

describe('HandlerAssignmentStep same-day trials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDogStoreCompat.mockReturnValue({ dogs: [DOG], isLoading: false });
  });

  it('names the trial when two same-day trials hold the identical class', () => {
    mockUseTrialStore.mockReturnValue({
      trials: [
        { id: 'trial-1', name: 'Saturday Trial 1', trialDate: '2026-10-10' },
        { id: 'trial-2', name: 'Saturday Trial 2', trialDate: '2026-10-10' },
      ],
    });
    mockUseClassStoreCompat.mockReturnValue({
      classes: [
        {
          id: 'class-t1',
          trialId: 'trial-1',
          element: 'Vehicle',
          level: 'Novice',
          section: 'B',
          className: 'Vehicle Novice B',
        },
        {
          id: 'class-t2',
          trialId: 'trial-2',
          element: 'Vehicle',
          level: 'Novice',
          section: 'B',
          className: 'Vehicle Novice B',
        },
      ],
    });

    render(
      <HandlerAssignmentStep
        selectedDogs={['dog-1']}
        classSelections={[
          {
            dogId: 'dog-1',
            trialId: 'trial-1',
            selectedClasses: [{ classId: 'class-t1' }, { classId: 'class-t2' }],
          },
        ]}
        handlerAssignments={{}}
        onHandlerAssignmentChange={vi.fn()}
      />
    );

    expect(screen.getByText('Vehicle Novice B — Saturday Trial 1')).toBeInTheDocument();
    expect(screen.getByText('Vehicle Novice B — Saturday Trial 2')).toBeInTheDocument();
    // The old bug: the identical, unqualified name rendered twice.
    expect(screen.queryByText('Vehicle Novice B')).not.toBeInTheDocument();
  });

  it('adds no trial suffix for the ordinary one-trial-per-day case', () => {
    mockUseTrialStore.mockReturnValue({
      trials: [{ id: 'trial-1', name: 'Saturday Trial 1', trialDate: '2026-10-10' }],
    });
    mockUseClassStoreCompat.mockReturnValue({
      classes: [
        {
          id: 'class-t1',
          trialId: 'trial-1',
          element: 'Vehicle',
          level: 'Novice',
          section: 'B',
          className: 'Vehicle Novice B',
        },
      ],
    });

    render(
      <HandlerAssignmentStep
        selectedDogs={['dog-1']}
        classSelections={[
          { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-t1' }] },
        ]}
        handlerAssignments={{}}
        onHandlerAssignmentChange={vi.fn()}
      />
    );

    expect(screen.getByText('Vehicle Novice B')).toBeInTheDocument();
  });
});
