import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import {
  ShowPresenceContext,
  type ShowPresenceContextValue,
} from '@/features/show-presence/showPresenceContext';
import { EntryEditDialog } from './EntryEditDialog';
import type { ShowPresence } from '@/features/show-presence/types';

// Phase 3 kill switch — force ON so the badge is allowed to render.
const enabled = vi.fn(() => true);
vi.mock('@/features/show-presence/editAwarenessFlag', () => ({
  showEditAwarenessEnabled: () => enabled(),
}));

// The dialog only renders its class list (where the badges live) once
// canModifyEntry resolves true.
const entryServiceMocks = vi.hoisted(() => ({
  canModifyEntry: vi.fn().mockResolvedValue({ canModify: true }),
  updateEntryDetails: vi.fn().mockResolvedValue({ error: null }),
  updateEntryHandler: vi.fn().mockResolvedValue({ error: null }),
  withdrawEntry: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('@/services/database/entries', () => ({
  canModifyEntry: entryServiceMocks.canModifyEntry,
  updateEntryDetails: entryServiceMocks.updateEntryDetails,
  updateEntryHandler: entryServiceMocks.updateEntryHandler,
  withdrawEntry: entryServiceMocks.withdrawEntry,
}));

// A staff editor who has the SECOND class row's entry open. Its entityId 'e2' is
// the per-class entries.id — NOT the grouped card id ('e1').
const editor: ShowPresence = {
  userId: 'her',
  name: 'Jane',
  role: 'secretary',
  location: { page: '' },
  activity: 'editing',
  editing: { entityType: 'entry', entityId: 'e2' },
  ts: 1,
};

// Grouped exhibitor card: entry.id is the FIRST class row's entries.id ('e1'); the
// card also holds a SECOND class row ('e2'). This is the multi-class shape a single
// header badge keyed on entry.id would silently miss for class 'e2'.
const entry = {
  id: 'e1',
  showId: 'show-1',
  showName: 'Spring Trial',
  dogName: 'Ace',
  classes: [
    { id: 'e1', name: 'Container Novice B', number: '101', fee: 30, status: 'entered' as const },
    { id: 'e2', name: 'Exterior Novice B', number: '102', fee: 30, status: 'entered' as const },
  ],
};

const renderDialog = (value: ShowPresenceContextValue) =>
  render(
    <ShowPresenceContext.Provider value={value}>
      <EntryEditDialog open entry={entry} onOpenChange={vi.fn()} onUpdate={vi.fn()} />
    </ShowPresenceContext.Provider>
  );

beforeEach(() => {
  enabled.mockReturnValue(true);
  entryServiceMocks.canModifyEntry.mockResolvedValue({ canModify: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('EntryEditDialog — soft edit awareness (Phase 3 exhibitor-side acceptance)', () => {
  it("advertises the group's primary entry id as being edited while open", () => {
    const setEditing = vi.fn();
    renderDialog({ present: [], viewerId: 'me', setEditing, clearEditing: vi.fn() });
    expect(setEditing).toHaveBeenCalledWith({ entityType: 'entry', entityId: 'e1' });
  });

  it('surfaces a secretary editing ANY class row, keyed per-class not on the grouped card id', async () => {
    renderDialog({ present: [editor], viewerId: 'me', setEditing: vi.fn(), clearEditing: vi.fn() });
    // Badge lives on the 'e2' row, which 'entry.id' (='e1') alone would never match.
    expect(await screen.findByText(/Jane is editing this/)).toBeTruthy();
  });

  it('shows no badge when the local user is the only editor', async () => {
    renderDialog({
      present: [{ ...editor, userId: 'me', name: 'Me' }],
      viewerId: 'me',
      setEditing: vi.fn(),
      clearEditing: vi.fn(),
    });
    // Wait for the class list to render, then assert no badge anywhere.
    expect(await screen.findByText(/Exterior Novice B/)).toBeTruthy();
    expect(screen.queryByText(/is editing this/)).toBeNull();
  });
});
