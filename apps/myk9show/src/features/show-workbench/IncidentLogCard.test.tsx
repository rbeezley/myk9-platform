import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import { IncidentLogCard } from './IncidentLogCard';
import { createShowIncident } from '@/services/database/show-incidents';
import type { IncidentEntryOption, IncidentJudgeOption } from './showIncidents';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'secretary-1', email: 'sec@example.com' },
    userWithRoles: null,
    hasRole: () => false,
    getUserRoles: () => [],
    signOut: vi.fn(),
  }),
}));

vi.mock('@/services/database/show-incidents', () => ({
  createShowIncident: vi.fn(() => Promise.resolve({ id: 'inc-1' })),
  listShowIncidents: vi.fn(() => Promise.resolve([])),
  showIncidentsQueryKey: (showId: string) => ['show-incidents', showId],
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const entries: IncidentEntryOption[] = [
  { id: 'entry-1', label: '#42 — Rex', dogId: 'dog-1', dogName: 'Rex' },
];
const judges: IncidentJudgeOption[] = [{ id: 'judge-1', name: 'Pat Jones' }];

function renderCard() {
  return render(<IncidentLogCard entries={entries} judges={judges} showId="show-1" />);
}

describe('IncidentLogCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the optional details collapsed by default', () => {
    renderCard();

    // The disclosure is closed: trigger reads "Add details" and is not expanded.
    const trigger = screen.getByRole('button', { name: /add details/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Summary leads and is always available.
    expect(screen.getByRole('textbox', { name: /short summary/i })).toBeInTheDocument();

    // The detail fields are not perceivable while collapsed. *ByRole filters
    // hidden/unmounted subtrees, so this holds whether Base UI hides or unmounts.
    expect(
      screen.queryByRole('textbox', { name: /what happened/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /action taken/i })).not.toBeInTheDocument();
  });

  it('reveals the detail fields when "Add details" is clicked', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: /add details/i }));

    expect(
      await screen.findByRole('textbox', { name: /what happened/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide details/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('saves with only a summary, sending an empty/null payload for the optional fields', async () => {
    const user = userEvent.setup();
    renderCard();

    const saveButton = screen.getByRole('button', { name: /save incident/i });
    // Gate is closed until a summary exists.
    expect(saveButton).toBeDisabled();

    await user.type(
      screen.getByRole('textbox', { name: /short summary/i }),
      'Dog excused for disqualification'
    );

    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => {
      expect(createShowIncident).toHaveBeenCalledTimes(1);
    });
    expect(createShowIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Dog excused for disqualification',
        description: '',
        actionTaken: '',
        entry: null,
        judge: null,
        incidentType: 'dq',
        severity: 'reportable',
        showId: 'show-1',
        createdBy: 'secretary-1',
      })
    );
  });
});
