import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { EntryEditDialog } from './EntryEditDialog';

// The dialog only renders its class list once canModifyEntry resolves true.
vi.mock('@/services/database/entries', () => ({
  canModifyEntry: vi.fn().mockResolvedValue({ canModify: true }),
  updateEntryDetails: vi.fn().mockResolvedValue({ error: null }),
  updateEntryHandler: vi.fn().mockResolvedValue({ error: null }),
  withdrawEntry: vi.fn().mockResolvedValue({ error: null }),
}));

const noop = () => {};

function makeEntry(trialType: string) {
  return {
    id: 'entry-1',
    showId: 'show-1',
    showName: 'Spring Trial',
    dogName: 'Ace',
    classes: [
      {
        id: 'class-1',
        name: 'Container Novice A',
        number: '101',
        fee: 30,
        trialType,
        status: 'entered' as const,
      },
    ],
  };
}

describe('EntryEditDialog — jump height visibility by discipline', () => {
  it('hides the Jump Height field for scent work entries', async () => {
    render(
      <EntryEditDialog open entry={makeEntry('Scent Work')} onOpenChange={noop} onUpdate={noop} />
    );

    // Wait for the modify-eligibility check to resolve and the class to render.
    expect(await screen.findByText(/Container Novice A/)).toBeInTheDocument();
    expect(screen.queryByText('Jump Height:')).not.toBeInTheDocument();
  });

  it('shows the Jump Height field for agility entries', async () => {
    render(
      <EntryEditDialog open entry={makeEntry('Agility')} onOpenChange={noop} onUpdate={noop} />
    );

    expect(await screen.findByText(/Container Novice A/)).toBeInTheDocument();
    expect(screen.getByText('Jump Height:')).toBeInTheDocument();
  });

  it('hides the field when the discipline is unknown (hide-by-default)', async () => {
    render(<EntryEditDialog open entry={makeEntry('')} onOpenChange={noop} onUpdate={noop} />);

    expect(await screen.findByText(/Container Novice A/)).toBeInTheDocument();
    expect(screen.queryByText('Jump Height:')).not.toBeInTheDocument();
  });
});
