import { Link } from 'react-router-dom';
import { create } from 'zustand';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildSecretaryRegistrationPath } from '@/pages/RegistrationWizardPage.routes';
import { useEntryEligibleShows } from './useEntryEligibleShows';

interface AddEntryPickerState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** Opened by the Create group's Add Entry when more than one show can take an entry. */
export const useAddEntryPickerStore = create<AddEntryPickerState>(set => ({
  open: false,
  setOpen: open => set({ open }),
}));

/**
 * "Add entry to which show?": one register link per eligible show. Mounted once beside the
 * header, so the Actions menu and the command palette open the same dialog.
 */
export function AddEntryShowPicker() {
  const open = useAddEntryPickerStore(state => state.open);
  const setOpen = useAddEntryPickerStore(state => state.setOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <PickerContent onPick={() => setOpen(false)} />}
    </Dialog>
  );
}

/** Mounted only while open, so the header pays nothing for the list until it is asked for. */
function PickerContent({ onPick }: { onPick: () => void }) {
  const entryShows = useEntryEligibleShows();

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-sm overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Add entry to which show?</DialogTitle>
        <DialogDescription>Pick the show you are keying an entry for.</DialogDescription>
      </DialogHeader>
      <ul className="flex flex-col gap-2">
        {entryShows.map(show => (
          <li key={show.id}>
            <Link
              to={buildSecretaryRegistrationPath(show.id)}
              onClick={onPick}
              className="flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {show.name}
            </Link>
          </li>
        ))}
      </ul>
    </DialogContent>
  );
}
