/**
 * MYK9-2475: after a manager changes a handler, the card shows the new handler without a reload.
 * The handler RPC writes the server only, and Entry Forms' `onUpdate` re-reads the show's entries
 * from the REPLICA (`getEntriesForShow`). This runs the real dialog, the real replicated entries
 * table (fake-indexeddb), the real replica sync and the real secretary read; only the network is
 * a stand-in: the server's entries view (which the sync pulls) and the save call that changes it.
 */
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import { signInReplicatedTable } from '@/test/utils/signedInReplication';

type Row = Record<string, unknown>;

const server = vi.hoisted(() => ({ entries: [] as Row[] }));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/services/database/entries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/entries')>()),
  canModifyEntry: async () => ({ canModify: true }),
}));
// The handler RPC: it commits on the server and touches nothing on this device.
vi.mock('./saveEntryEdits', () => ({
  saveEntryEdits: async ({ classEdits }: { classEdits: Record<string, { handler?: string }> }) => {
    const handler = Object.values(classEdits)[0]?.handler;
    server.entries = server.entries.map(row => ({
      ...row,
      handler,
      updated_at: '2026-11-27T12:05:00Z',
    }));
    return { error: null };
  },
}));
vi.mock('@/services/database/supabaseClient', () => {
  const builder = (table: string): Record<string, unknown> => {
    const result = () => ({
      data: table === 'view_authenticated_entry_results_replication' ? server.entries : [],
      error: null,
      count: server.entries.length,
    });
    const self: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    for (const method of ['select', 'eq', 'in', 'gt', 'or', 'order', 'range', 'abortSignal']) {
      self[method] = () => self;
    }
    return self;
  };
  return {
    supabase: {
      from: builder,
      // "Nothing to probe": the sync reads the view every time.
      rpc: async () => ({ data: null, error: { message: 'probe unavailable' } }),
    },
    logQuery: vi.fn(),
  };
});

import { EntryEditDialog } from './EntryEditDialog';
import { getEntriesForShow } from '@/services/database/entries/secretary';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';

const serverRow = (handler: string, updatedAt: string): Row => ({
  id: 'entry-1',
  show_id: 'show-1',
  class_id: 'class-1',
  dog_id: 'dog-1',
  handler,
  entry_status: 'confirmed',
  payment_status: 'paid',
  version: 1,
  created_at: '2026-11-01T10:00:00Z',
  updated_at: updatedAt,
});

const dialogEntry = {
  id: 'entry-1',
  showId: 'show-1',
  showName: 'Fall Show',
  dogName: 'COCO',
  handler: 'Mariana Alexander',
  classes: [
    {
      id: 'class-1',
      name: 'Container Novice A',
      number: '101',
      fee: 30,
      trialType: 'Scent Work',
      status: 'entered' as const,
      handler: 'Mariana Alexander',
    },
  ],
};

/** What Entry Forms does: re-read the show's entries after a save and print the handler. */
function EntryFormsCard() {
  const [handler, setHandler] = useState('Mariana Alexander');
  const reload = async () => {
    const { data } = await getEntriesForShow('show-1');
    setHandler(data?.[0]?.handler ?? 'missing');
  };
  return (
    <>
      <p>Handler: {handler}</p>
      <EntryEditDialog
        open
        entry={dialogEntry}
        onOpenChange={vi.fn()}
        onUpdate={reload}
        asShowManager
      />
    </>
  );
}

beforeEach(async () => {
  server.entries = [serverRow('Mariana Alexander', '2026-11-27T12:00:00Z')];
  await replicatedEntriesTable.clearCache();
  signInReplicatedTable(replicatedEntriesTable, 'user-test');
  await replicatedEntriesTable.batchSet([
    {
      id: 'entry-1',
      showId: 'show-1',
      classId: 'class-1',
      dogId: 'dog-1',
      handler: 'Mariana Alexander',
      entryStatus: 'confirmed',
    },
  ] as never);
  await replicatedEntriesTable.updateSyncMetadata(
    { lastIncrementalSyncAt: Date.now(), totalRows: 1 },
    { scopeValue: 'show-1', scopeSyncedBy: 'user-test' }
  );
});

describe('the entry card after a manager changes the handler (MYK9-2475)', () => {
  it('shows the new handler once Save finishes, read back from the replica', async () => {
    const user = userEvent.setup();
    render(<EntryFormsCard />);
    await screen.findByText(/Container Novice A/);
    expect(screen.getByText('Handler: Mariana Alexander')).toBeInTheDocument();

    const field = screen.getByDisplayValue('Mariana Alexander');
    await user.clear(field);
    await user.type(field, 'John Smoth');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText('Handler: John Smoth')).toBeInTheDocument());
  });
});
