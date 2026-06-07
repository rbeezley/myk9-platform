import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { EntryEditDialog } from './EntryEditDialog';

const entryServiceMocks = vi.hoisted(() => ({
  canModifyEntry: vi.fn().mockResolvedValue({ canModify: true }),
  updateEntryDetails: vi.fn().mockResolvedValue({ error: null }),
  updateEntryHandler: vi.fn().mockResolvedValue({ error: null }),
  withdrawEntry: vi.fn().mockResolvedValue({ error: null }),
}));

// The dialog only renders its class list once canModifyEntry resolves true.
vi.mock('@/services/database/entries', () => ({
  canModifyEntry: entryServiceMocks.canModifyEntry,
  updateEntryDetails: entryServiceMocks.updateEntryDetails,
  updateEntryHandler: entryServiceMocks.updateEntryHandler,
  withdrawEntry: entryServiceMocks.withdrawEntry,
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

beforeEach(() => {
  vi.clearAllMocks();
  entryServiceMocks.canModifyEntry.mockResolvedValue({ canModify: true });
  entryServiceMocks.updateEntryDetails.mockResolvedValue({ error: null });
  entryServiceMocks.updateEntryHandler.mockResolvedValue({ error: null });
  entryServiceMocks.withdrawEntry.mockResolvedValue({ error: null });
});

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

describe('EntryEditDialog — per-class handlers', () => {
  it('saves each class entry with its own handler', async () => {
    const entry = {
      ...makeEntry('Scent Work'),
      classes: [
        {
          id: 'entry-exterior',
          name: 'Exterior Novice B',
          number: '101',
          fee: 30,
          trialType: 'Scent Work',
          status: 'entered' as const,
          handler: 'Mariana Alexander',
        },
        {
          id: 'entry-container',
          name: 'Container Novice B',
          number: '102',
          fee: 30,
          trialType: 'Scent Work',
          status: 'entered' as const,
          handler: 'Jamie Walker',
        },
      ],
    };

    const { user } = render(
      <EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />
    );

    const exteriorHandler = await screen.findByRole('textbox', {
      name: 'Handler for Exterior Novice B',
    });
    const containerHandler = screen.getByRole('textbox', {
      name: 'Handler for Container Novice B',
    });

    await user.clear(exteriorHandler);
    await user.type(exteriorHandler, 'Mariana Alexander');
    await user.clear(containerHandler);
    await user.type(containerHandler, 'Chris Lee');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(entryServiceMocks.updateEntryHandler).toHaveBeenCalledTimes(1);
      expect(entryServiceMocks.updateEntryHandler).toHaveBeenCalledWith({
        entryId: 'entry-container',
        handler: 'Chris Lee',
      });
    });
  });
});
