/**
 * MYK9-821 (3/3): the delete-show confirm counted every entry ever replicated
 * for the show's classes, tombstones included, so a show whose entries had
 * all been soft-deleted still read "Entries (5)". The preview must mirror the
 * same `deleted_at IS NULL` filter every other live-entry read uses
 * (`isLiveEntry` in `services/database/entries/reads.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import DeleteShowDialog from '../DeleteShowDialog';
import { useEntryStore } from '@/store/entryStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStore } from '@/store/classStore';
import { rowToEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { replicatedToEntry } from '@/store/entry-store-helpers';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SHOW_ID = 'show-1';

/** One row as `view_authenticated_entry_results_replication` returns it. */
function viewRow(id: string, dogCallName: string, deletedAt: string | null) {
  return {
    id,
    show_id: SHOW_ID,
    class_id: 'class-1',
    dog_id: `dog-${id}`,
    entry_status: 'confirmed',
    dog_call_name: dogCallName,
    dog_breed: 'Beagle',
    class_name: 'Interior Advanced A',
    deleted_at: deletedAt,
  };
}

describe('DeleteShowDialog entry count (MYK9-821)', () => {
  let saved: {
    entries: ReturnType<typeof useEntryStore.getState>['entries'];
    trials: ReturnType<typeof useTrialStore.getState>['trials'];
    classes: ReturnType<typeof useClassStore.getState>['classes'];
  };

  beforeEach(() => {
    saved = {
      entries: useEntryStore.getState().entries,
      trials: useTrialStore.getState().trials,
      classes: useClassStore.getState().classes,
    };
    useTrialStore.setState({
      trials: [{ id: 'trial-1', showId: SHOW_ID, name: 'Saturday Trial', trialDate: '2026-10-10' }],
    } as never);
    useClassStore.setState({
      classes: [{ id: 'class-1', trialId: 'trial-1', className: 'Interior Advanced A' }],
    } as never);
    useEntryStore.setState({
      entries: [
        viewRow('entry-live-1', 'Acorn', null),
        viewRow('entry-live-2', 'Birch', null),
        viewRow('entry-gone-1', 'Cedar', '2026-09-25T00:00:00Z'),
        viewRow('entry-gone-2', 'Dune', '2026-09-25T00:00:00Z'),
        viewRow('entry-gone-3', 'Ember', '2026-09-25T00:00:00Z'),
      ].map(row => replicatedToEntry(rowToEntry(row as never))),
    });
  });

  afterEach(() => {
    useEntryStore.setState({ entries: saved.entries });
    useTrialStore.setState({ trials: saved.trials });
    useClassStore.setState({ classes: saved.classes });
  });

  it('counts only live entries, not entries already soft-deleted', () => {
    render(
      <DeleteShowDialog
        open
        onOpenChange={vi.fn()}
        showId={SHOW_ID}
        showName="ZZ Walk"
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('Entries (2)')).toBeInTheDocument();
    expect(screen.queryByText('Entries (5)')).not.toBeInTheDocument();
    expect(screen.getByText(/Acorn in Interior Advanced A/)).toBeInTheDocument();
    expect(screen.getByText(/Birch in Interior Advanced A/)).toBeInTheDocument();
    expect(screen.queryByText(/Cedar in Interior Advanced A/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dune in Interior Advanced A/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ember in Interior Advanced A/)).not.toBeInTheDocument();
  });
});
