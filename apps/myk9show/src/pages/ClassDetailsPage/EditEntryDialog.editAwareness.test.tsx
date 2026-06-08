import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ShowPresenceContext,
  type ShowPresenceContextValue,
} from '@/features/show-presence/showPresenceContext';
import { EditEntryDialog } from './EditEntryDialog';
import type { ShowPresence } from '@/features/show-presence/types';

// Phase 3 kill switch — force ON so the badge is allowed to render.
const enabled = vi.fn(() => true);
vi.mock('@/features/show-presence/editAwarenessFlag', () => ({
  showEditAwarenessEnabled: () => enabled(),
}));

const editor: ShowPresence = {
  userId: 'her',
  name: 'Jane',
  role: 'secretary',
  location: { page: '' },
  activity: 'editing',
  editing: { entityType: 'entry', entityId: 'e1' },
  ts: 1,
};

const renderDialog = (value: ShowPresenceContextValue) =>
  render(
    <ShowPresenceContext.Provider value={value}>
      <EditEntryDialog
        open
        onOpenChange={vi.fn()}
        entryId="e1"
        rawEntries={[]}
        dogs={[]}
        onSave={vi.fn()}
      />
    </ShowPresenceContext.Provider>
  );

beforeEach(() => {
  enabled.mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('EditEntryDialog — soft edit awareness (Phase 3 entry-level acceptance)', () => {
  it('advertises this entry as being edited while open', () => {
    const setEditing = vi.fn();
    renderDialog({ present: [], viewerId: 'me', setEditing, clearEditing: vi.fn() });
    expect(setEditing).toHaveBeenCalledWith({ entityType: 'entry', entityId: 'e1' });
  });

  it('surfaces the other editor when someone else has the same entry open', () => {
    renderDialog({
      present: [editor],
      viewerId: 'me',
      setEditing: vi.fn(),
      clearEditing: vi.fn(),
    });
    expect(screen.getByText(/Jane is editing this/)).toBeTruthy();
  });

  it('shows no badge when the local user is the only editor', () => {
    renderDialog({
      present: [{ ...editor, userId: 'me', name: 'Me' }],
      viewerId: 'me',
      setEditing: vi.fn(),
      clearEditing: vi.fn(),
    });
    expect(screen.queryByText(/is editing this/)).toBeNull();
  });
});
