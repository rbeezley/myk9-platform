import { create } from 'zustand';

interface AddEntryPickerState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** Opened by the Create group's Add Entry when more than one show can take an entry. */
export const useAddEntryPickerStore = create<AddEntryPickerState>(set => ({
  open: false,
  setOpen: open => set({ open }),
}));
