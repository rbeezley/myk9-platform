import { create } from 'zustand';

interface AskQPanelState {
  isOpen: boolean;
  suggestedPrompt: string | null;
  open: (suggestedPrompt?: string) => void;
  openWithPrompt: (suggestedPrompt: string) => void;
  clearSuggestedPrompt: () => void;
  close: () => void;
  toggle: () => void;
}

export const useAskQPanelStore = create<AskQPanelState>()(set => ({
  isOpen: false,
  suggestedPrompt: null,
  open: suggestedPrompt => set({ isOpen: true, suggestedPrompt: suggestedPrompt ?? null }),
  openWithPrompt: suggestedPrompt => set({ isOpen: true, suggestedPrompt }),
  clearSuggestedPrompt: () => set({ suggestedPrompt: null }),
  close: () => set({ isOpen: false, suggestedPrompt: null }),
  toggle: () =>
    set(state => ({
      isOpen: !state.isOpen,
      suggestedPrompt: null,
    })),
}));
