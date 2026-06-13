import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { IncidentLogCard } from '../IncidentLogCard';

const mockListShowIncidents = vi.hoisted(() => vi.fn());
const mockCreateShowIncident = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());
const mockToastSuccess = vi.hoisted(() => vi.fn());
const mockAuthContext = vi.hoisted(() => ({
  user: { id: 'auth-user-1', email: 'secretary@example.com' },
  userWithRoles: {
    id: 'auth-user-1',
    email: 'secretary@example.com',
    roles: ['secretary'],
    user_metadata: { full_name: 'Jane Secretary' },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuthContext,
}));

vi.mock('@/services/database/show-incidents', () => ({
  createShowIncident: mockCreateShowIncident,
  listShowIncidents: mockListShowIncidents,
  showIncidentsQueryKey: (showId: string) => ['show-incidents', showId],
}));

const entries = [
  {
    classId: 'class-1',
    dogId: 'dog-1',
    dogName: 'Rocket',
    handlerId: 'handler-1',
    handlerName: 'Jamie Walker',
    id: 'entry-1',
    label: '#12 Rocket (Jamie Walker) - Container Novice A',
    trialId: 'trial-1',
  },
];

const judges = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Pat Judge' }];

describe('IncidentLogCard', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockAuthContext.user = { id: 'auth-user-1', email: 'secretary@example.com' };
    mockAuthContext.userWithRoles = {
      id: 'auth-user-1',
      email: 'secretary@example.com',
      roles: ['secretary'],
      user_metadata: { full_name: 'Jane Secretary' },
    };
    mockListShowIncidents.mockResolvedValue([]);
    mockCreateShowIncident.mockResolvedValue({
      id: 'incident-1',
      incident_type: 'dq',
      severity: 'reportable',
      occurred_at: '2026-05-19T15:30:00.000Z',
      summary: 'Dog excused',
      description: null,
      action_taken: null,
      dog_name: 'Rocket',
      handler_name: 'Jamie Walker',
      judge_name: 'Pat Judge',
      created_by_name: 'Jane Secretary',
      created_at: '2026-05-19T15:30:00.000Z',
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('saves a linked incident and refreshes the recent log', async () => {
    const { user } = render(
      <IncidentLogCard showId="show-1" entries={entries} judges={judges} />
    );

    // Entry / judge / description live behind the optional "Add details" disclosure.
    await user.click(screen.getByRole('button', { name: /add details/i }));

    await user.click(await screen.findByRole('combobox', { name: 'Entry / dog' }));
    await user.click(
      await screen.findByRole('option', { name: /#12 Rocket \(Jamie Walker\)/ })
    );
    await user.click(screen.getByRole('combobox', { name: 'Judge' }));
    await user.click(await screen.findByRole('option', { name: 'Pat Judge' }));
    await user.clear(screen.getByLabelText('Short summary'));
    await user.type(screen.getByLabelText('Short summary'), 'Dog excused by judge');
    await user.type(screen.getByLabelText('What happened'), 'Dog left the search area.');
    await user.type(screen.getByLabelText('Action taken'), 'Judge excused the dog.');
    await user.click(screen.getByRole('button', { name: 'Save incident' }));

    await waitFor(() => {
      expect(mockCreateShowIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          actionTaken: 'Judge excused the dog.',
          createdBy: 'auth-user-1',
          createdByName: 'Jane Secretary',
          description: 'Dog left the search area.',
          entry: entries[0],
          incidentType: 'dq',
          judge: judges[0],
          severity: 'reportable',
          showId: 'show-1',
          summary: 'Dog excused by judge',
        })
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Incident logged');
    await waitFor(() => {
      expect(mockListShowIncidents).toHaveBeenCalledTimes(2);
    });
  });

  it('renders recent incidents from the show log', async () => {
    mockListShowIncidents.mockResolvedValueOnce([
      {
        id: 'incident-1',
        incident_type: 'bite',
        severity: 'urgent',
        occurred_at: '2026-05-19T15:30:00.000Z',
        summary: 'Dog bite at gate',
        description: null,
        action_taken: null,
        dog_name: 'Rocket',
        handler_name: 'Jamie Walker',
        judge_name: 'Pat Judge',
        created_by_name: 'Jane Secretary',
        created_at: '2026-05-19T15:30:00.000Z',
      },
    ]);

    render(<IncidentLogCard showId="show-1" entries={entries} judges={judges} />);

    expect(await screen.findByText('Dog bite at gate')).toBeInTheDocument();
    expect(screen.getByText(/Bite \/ aggression/)).toBeInTheDocument();
    expect(screen.getByText('urgent')).toHaveClass('text-destructive');
    expect(screen.getByText(/Rocket/)).toBeInTheDocument();
    expect(screen.getByText(/Urgent incident logged/)).toBeInTheDocument();
  });

  it('does not save without a summary', async () => {
    const { user } = render(
      <IncidentLogCard showId="show-1" entries={entries} judges={judges} />
    );

    await user.click(screen.getByRole('button', { name: 'Save incident' }));

    expect(mockCreateShowIncident).not.toHaveBeenCalled();
  });

  it('logs and toasts create failures', async () => {
    const error = new Error('RLS denied');
    mockCreateShowIncident.mockRejectedValueOnce(error);
    const { user } = render(
      <IncidentLogCard showId="show-1" entries={entries} judges={judges} />
    );

    await user.type(screen.getByLabelText('Short summary'), 'Dog excused by judge');
    await user.click(screen.getByRole('button', { name: 'Save incident' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Could not log incident');
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[show-incidents] create failed', error);
  });

  it('shows an account-loading toast without logging an error', async () => {
    mockAuthContext.user = { id: '', email: 'secretary@example.com' };
    mockAuthContext.userWithRoles = null;
    const { user } = render(
      <IncidentLogCard showId="show-1" entries={entries} judges={judges} />
    );

    await user.type(screen.getByLabelText('Short summary'), 'Dog excused by judge');
    await user.click(screen.getByRole('button', { name: 'Save incident' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Hang on — still loading your account');
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('keeps the optional details collapsed by default', () => {
    render(<IncidentLogCard showId="show-1" entries={entries} judges={judges} />);

    // Disclosure is closed: trigger reads "Add details" and is not expanded.
    expect(screen.getByRole('button', { name: /add details/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );

    // Summary leads and is always available.
    expect(screen.getByRole('textbox', { name: /short summary/i })).toBeInTheDocument();

    // Optional fields are not perceivable while collapsed. *ByRole filters
    // hidden/unmounted subtrees, so this holds whether Base UI hides or unmounts.
    expect(screen.queryByRole('combobox', { name: 'Entry / dog' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Judge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'What happened' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Action taken' })).not.toBeInTheDocument();
  });

  it('reveals the detail fields when "Add details" is clicked', async () => {
    const { user } = render(
      <IncidentLogCard showId="show-1" entries={entries} judges={judges} />
    );

    await user.click(screen.getByRole('button', { name: /add details/i }));

    expect(await screen.findByRole('textbox', { name: 'What happened' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide details/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('saves with only a summary, sending empty/null for the untouched optional fields', async () => {
    const { user } = render(
      <IncidentLogCard showId="show-1" entries={entries} judges={judges} />
    );

    await user.type(screen.getByLabelText('Short summary'), 'Dog excused for disqualification');
    await user.click(screen.getByRole('button', { name: 'Save incident' }));

    await waitFor(() => {
      expect(mockCreateShowIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: 'Dog excused for disqualification',
          description: '',
          actionTaken: '',
          entry: null,
          judge: null,
          incidentType: 'dq',
          severity: 'reportable',
          showId: 'show-1',
          createdBy: 'auth-user-1',
        })
      );
    });
  });
});
