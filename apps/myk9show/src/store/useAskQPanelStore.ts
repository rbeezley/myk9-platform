import { create } from 'zustand';

interface AskQPanelState {
  isOpen: boolean;
  suggestedPrompt: string | null;
  promptRequestId: number;
  open: (suggestedPrompt?: string) => void;
  openWithPrompt: (suggestedPrompt: string) => void;
  clearSuggestedPrompt: () => void;
  close: () => void;
  toggle: () => void;
}

export const useAskQPanelStore = create<AskQPanelState>()(set => ({
  isOpen: false,
  suggestedPrompt: null,
  promptRequestId: 0,
  open: suggestedPrompt =>
    set(state => ({
      isOpen: true,
      suggestedPrompt: suggestedPrompt ?? null,
      promptRequestId: suggestedPrompt ? state.promptRequestId + 1 : state.promptRequestId,
    })),
  openWithPrompt: suggestedPrompt =>
    set(state => ({
      isOpen: true,
      suggestedPrompt,
      promptRequestId: state.promptRequestId + 1,
    })),
  clearSuggestedPrompt: () => set({ suggestedPrompt: null }),
  close: () => set({ isOpen: false, suggestedPrompt: null }),
  toggle: () =>
    set(state => ({
      isOpen: !state.isOpen,
      suggestedPrompt: null,
    })),
}));
