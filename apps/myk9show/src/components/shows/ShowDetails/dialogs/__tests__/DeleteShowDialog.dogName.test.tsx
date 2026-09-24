/**
 * MYK9-724 F51: the delete-show dialog listed every entry as "Unknown Dog".
 *
 * The preview looked the dog up in `useDogStore().dogs`, a deprecated array that
 * nothing fills any more, so it missed every time. The replicated entry already
 * carries the dog's call name (`dog_call_name` on
 * `view_authenticated_entry_results_replication`), so the entry is built here
 * from that view row through the same two mappers the app uses.
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

/** One row as `view_authenticated_entry_results_replication` returns it to a secretary. */
const viewRow = {
  id: 'entry-1',
  show_id: SHOW_ID,
  class_id: 'class-1',
  dog_id: 'dog-acorn',
  entry_status: 'confirmed',
  dog_call_name: 'Acorn',
  dog_breed: 'Beagle',
  class_name: 'Interior Advanced A',
};

describe('DeleteShowDialog entry names', () => {
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
      entries: [replicatedToEntry(rowToEntry(viewRow as never))],
    });
  });

  afterEach(() => {
    useEntryStore.setState({ entries: saved.entries });
    useTrialStore.setState({ trials: saved.trials });
    useClassStore.setState({ classes: saved.classes });
  });

  it("names each entry's dog by its call name", () => {
    render(
      <DeleteShowDialog
        open
        onOpenChange={vi.fn()}
        showId={SHOW_ID}
        showName="ZZ Walk"
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText(/Acorn in Interior Advanced A/)).toBeInTheDocument();
    expect(screen.queryByText(/Unknown Dog/)).not.toBeInTheDocument();
  });
});
