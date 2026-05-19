import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { within } from '@testing-library/react';
import { IncidentCloseoutSummary } from '../IncidentCloseoutSummary';

const mockListShowIncidentCloseout = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/show-incidents', () => ({
  listShowIncidentCloseout: mockListShowIncidentCloseout,
  showIncidentCloseoutQueryKey: (showId: string) => ['show-incidents', showId, 'closeout'],
}));

describe('IncidentCloseoutSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListShowIncidentCloseout.mockResolvedValue([]);
  });

  it('renders reportable and urgent closeout counts', async () => {
    mockListShowIncidentCloseout.mockResolvedValueOnce([
      {
        id: 'incident-urgent',
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
      {
        id: 'incident-note',
        incident_type: 'complaint',
        severity: 'note',
        occurred_at: '2026-05-19T14:30:00.000Z',
        summary: 'Parking complaint handled',
        description: null,
        action_taken: null,
        dog_name: null,
        handler_name: null,
        judge_name: null,
        created_by_name: 'Jane Secretary',
        created_at: '2026-05-19T14:30:00.000Z',
      },
    ]);

    render(<IncidentCloseoutSummary showId="show-1" />);

    expect(await screen.findByText('1 reportable')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'All incidents' })).getByText('2')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Reportable incidents' })).getByText('1')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Urgent incidents' })).getByText('1')
    ).toBeInTheDocument();
    expect(screen.getByText(/Latest reportable: Bite \/ aggression - Dog bite at gate/)).toBeInTheDocument();
  });

  it('renders a calm empty state when no reportable incidents exist', async () => {
    render(<IncidentCloseoutSummary showId="show-1" />);

    expect(await screen.findByText('No reportable incidents')).toBeInTheDocument();
    expect(screen.getByText('No reportable incident follow-up is waiting in this show.')).toBeInTheDocument();
  });
});
