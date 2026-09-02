import { create } from 'zustand';
import type { CommandMenuContext } from './commandMenuTypes';

interface CommandMenuContextState {
  context: CommandMenuContext | null;
  /** Monotonic token identifying the current registration, so a stale
   * unregister (from an unmounting page whose context was already replaced)
   * cannot clear a newer registration — last-write-wins. */
  token: number;
  register: (ctx: CommandMenuContext) => number;
  unregister: (token: number) => void;
}

export const useCommandMenuContextStore = create<CommandMenuContextState>((set, get) => ({
  context: null,
  token: 0,
  register: ctx => {
    const nextToken = get().token + 1;
    set({ context: ctx, token: nextToken });
    return nextToken;
  },
  unregister: token => {
    if (get().token === token) {
      set({ context: null });
    }
  },
}));

/**
 * Register a command-menu context. Owner pages call this from an effect and
 * return the unregister function from that effect for unmount cleanup.
 * Last-write-wins: a later registration always supersedes an earlier one,
 * and an unregister only clears the store if it is still the active
 * registration (guards against unmount-order races).
 */
export function registerCommandMenuContext(ctx: CommandMenuContext): () => void {
  const token = useCommandMenuContextStore.getState().register(ctx);
  return () => useCommandMenuContextStore.getState().unregister(token);
}

/** Read the currently registered command-menu context, or null if none. */
export function useCommandMenuContext(): CommandMenuContext | null {
  return useCommandMenuContextStore(state => state.context);
}
