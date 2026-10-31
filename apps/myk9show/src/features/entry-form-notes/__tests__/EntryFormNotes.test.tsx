import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import {
  ENTRY_FORM_NOTES_OFFLINE_MESSAGE,
  ENTRY_FORM_NOTES_PRIVATE_LABEL,
  EntryFormNotes,
} from '../EntryFormNotes';

const h = vi.hoisted(() => ({
  online: true,
  personId: 'person-me' as string | undefined,
  siteAdmin: false,
  notes: [] as unknown[],
  list: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => h.online }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: h.personId ? { databaseUserId: h.personId } : undefined,
    hasRole: (role: UserRole) => role === UserRole.SITE_ADMIN && h.siteAdmin,
  }),
}));
vi.mock('@/services/database/entry-form-notes', () => ({
  listEntryFormNotes: (...args: unknown[]) => h.list(...args),
  addEntryFormNote: (...args: unknown[]) => h.add(...args),
  updateEntryFormNote: (...args: unknown[]) => h.update(...args),
  deleteEntryFormNote: (...args: unknown[]) => h.del(...args),
}));

function note(id: string, createdBy: string, body: string, authorName: string | null) {
  return {
    id,
    enrollmentId: 'enr-1',
    showId: 'show-1',
    body,
    createdBy,
    authorName,
    createdAt: '2026-10-31T15:00:00.000Z',
    updatedAt: '2026-10-31T15:00:00.000Z',
  };
}

describe('EntryFormNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.online = true;
    h.personId = 'person-me';
    h.siteAdmin = false;
    h.notes = [
      note('n1', 'person-me', 'paid check 1123', 'Sam Secretary'),
      note('n2', 'person-other', 'bringing copy Saturday', 'Pat Colleague'),
    ];
    h.list.mockImplementation(async () => h.notes);
    h.add.mockResolvedValue(undefined);
    h.update.mockResolvedValue(undefined);
    h.del.mockResolvedValue(undefined);
  });

  it('states the notes are private to officials and shows author and time', async () => {
    render(<EntryFormNotes enrollmentId="enr-1" />);
    expect(screen.getByText(ENTRY_FORM_NOTES_PRIVATE_LABEL)).toBeInTheDocument();
    expect(await screen.findByText('paid check 1123')).toBeInTheDocument();
    expect(screen.getByText(/Sam Secretary/)).toBeInTheDocument();
    expect(screen.getByText(/Pat Colleague/)).toBeInTheDocument();
    expect(h.list).toHaveBeenCalledWith('enr-1');
  });

  it("offers edit and delete only on the viewer's own notes", async () => {
    render(<EntryFormNotes enrollmentId="enr-1" />);
    await screen.findByText('paid check 1123');
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
  });

  it('offers edit and delete on every note to a site admin', async () => {
    h.siteAdmin = true;
    render(<EntryFormNotes enrollmentId="enr-1" />);
    await screen.findByText('paid check 1123');
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
  });

  it("adds a note under the caller's people id", async () => {
    const { user } = render(<EntryFormNotes enrollmentId="enr-1" />);
    await screen.findByText('paid check 1123');
    await user.type(screen.getByLabelText('New note'), 'asked late');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect(h.add).toHaveBeenCalledWith('enr-1', 'asked late', 'person-me'));
    await waitFor(() => expect(screen.getByLabelText('New note')).toHaveValue(''));
  });

  it('edits an own note', async () => {
    const { user } = render(<EntryFormNotes enrollmentId="enr-1" />);
    await screen.findByText('paid check 1123');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.type(screen.getByLabelText('Edit note'), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.update).toHaveBeenCalledWith('n1', 'paid check 1123!'));
  });

  it('soft deletes only after a confirm', async () => {
    const { user } = render(<EntryFormNotes enrollmentId="enr-1" />);
    await screen.findByText('paid check 1123');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(h.del).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(h.del).toHaveBeenCalledWith('n1'));
  });

  it('shows a needs-connection state offline and never reads or lists as empty', () => {
    h.online = false;
    render(<EntryFormNotes enrollmentId="enr-1" />);
    expect(screen.getByText(ENTRY_FORM_NOTES_OFFLINE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('No notes yet.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New note')).not.toBeInTheDocument();
    expect(h.list).not.toHaveBeenCalled();
  });

  it('keeps the draft and says so when adding fails', async () => {
    h.add.mockRejectedValue(new Error('boom'));
    const { user } = render(<EntryFormNotes enrollmentId="enr-1" />);
    await screen.findByText('paid check 1123');
    await user.type(screen.getByLabelText('New note'), 'keep me');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't add the note");
    expect(screen.getByLabelText('New note')).toHaveValue('keep me');
  });

  it('gives every action a 44px target', async () => {
    render(<EntryFormNotes enrollmentId="enr-1" />);
    await screen.findByText('paid check 1123');
    for (const name of ['Add note', 'Edit', 'Delete']) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-11');
    }
  });
});
