import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import type { ClassSelectionData } from '@/types/show-registration-types';
import { RegistrationNumberNeededOffer } from '../RegistrationNumberNeededOffer';

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  offer: vi.fn(),
}));

vi.mock('@/services/database/entries', () => ({
  getEntriesForShow: vi.fn(async () => ({ data: state.rows, error: null })),
}));
vi.mock('@/services/database/trials', () => ({
  getTrialsByShow: vi.fn(async () => ({ data: [{ id: 'trial-1', registry_id: 'UKC' }] })),
}));
vi.mock('@/hooks/useEntryManagementData', () => ({
  mapSecretaryEntryToEntryManagementEntry: (row: Record<string, unknown>) => row,
}));
vi.mock('@/features/lifecycle-emails', () => ({
  useRegistrationNumberNeededEmail: () => ({
    offer: state.offer,
    dialog: <div data-testid="preview-dialog" />,
  }),
}));

const entry = (id: string, dogId: string, held: boolean, ownerEmail = 'pat@example.com') => ({
  id,
  dogId,
  dogName: `Dog ${dogId}`,
  ownerEmail,
  classes: [{ classId: 'class-1', trialId: 'trial-1' }],
  ...(held && { awaitingRegistrationNumber: true }),
});

const selections = (dogIds: string[]): ClassSelectionData[] =>
  dogIds.map(dogId => ({ dogId, trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] }));

describe('RegistrationNumberNeededOffer', () => {
  beforeEach(() => {
    state.offer.mockReset();
    state.offer.mockResolvedValue({ disabled: false, noEmail: [] });
  });

  it('offers only the entries the server holds, with the trial registry', async () => {
    state.rows = [entry('e1', 'd1', true), entry('e2', 'd2', false), entry('x', 'd9', true)];
    render(
      <RegistrationNumberNeededOffer showId="show-1" classSelections={selections(['d1', 'd2'])} />
    );

    await waitFor(() => expect(state.offer).toHaveBeenCalledTimes(1));
    const targets = state.offer.mock.calls[0]![0] as Array<{
      entry: { id: string };
      registryId: string;
    }>;
    expect(targets.map(t => t.entry.id)).toEqual(['e1']);
    expect(targets[0]!.registryId).toBe('UKC');
  });

  it('offers nothing when no saved entry is held', async () => {
    state.rows = [entry('e3', 'd3', false)];
    render(<RegistrationNumberNeededOffer showId="show-1" classSelections={selections(['d3'])} />);

    await screen.findByTestId('preview-dialog');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(state.offer).not.toHaveBeenCalled();
  });

  it('tells the secretary nothing was sent when the exhibitor has no email', async () => {
    state.rows = [entry('e4', 'd4', true, '')];
    state.offer.mockResolvedValue({
      disabled: false,
      noEmail: [{ entry: entry('e4', 'd4', true, ''), registryId: 'UKC' }],
    });
    render(<RegistrationNumberNeededOffer showId="show-1" classSelections={selections(['d4'])} />);

    expect(await screen.findByText('No email sent.')).toBeInTheDocument();
    expect(screen.getByText(/Dog d4 is held for a registration number/)).toBeInTheDocument();
  });
});
