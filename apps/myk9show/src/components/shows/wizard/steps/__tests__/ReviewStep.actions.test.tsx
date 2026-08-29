import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ReviewStep } from '../ReviewStep';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/hooks/useResolvePersonName', () => ({
  useResolvePersonName: () => (id: string) => `Person ${id}`,
}));
vi.mock('@/store/clubStore', () => ({
  useClubStore: () => ({ clubs: [{ id: 'club-1', name: 'Test Club' }] }),
}));
vi.mock('@/store/wizardStore', () => ({
  useWizardStore: () => ({
    show: {
      name: 'Spring Classic',
      organization: 'AKC',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      entryOpenDate: '2026-06-01',
      entryCloseDate: '2026-06-25',
      preEntryFee: 30,
      dayOfShowFee: 35,
      location: 'Fairgrounds',
      clubId: 'club-1',
      judgeIds: ['judge-1'],
      officials: { chairman: ['p-1'], secretary: ['p-2'] },
    },
    trials: [
      {
        id: 'trial-1',
        name: 'Trial 1',
        dateTime: '2026-07-01T09:00:00Z',
        type: 'scent_work',
        classes: [{ id: 'class-1', name: 'Novice A', level: 'novice', element: 'container' }],
      },
    ],
    judgeDetails: {},
    markStepCompleted: vi.fn(),
    setCurrentStep: vi.fn(),
  }),
}));

describe('ReviewStep completion actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers one draft-create action and leaves publishing to show management', async () => {
    const onCreateShow = vi.fn();
    const user = userEvent.setup();
    render(<ReviewStep onCreateShow={onCreateShow} />);

    expect(screen.getByRole('button', { name: /^create show$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save as draft/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^create show$/i }));

    expect(onCreateShow).toHaveBeenCalledTimes(1);
  });
});
