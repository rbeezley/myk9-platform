import { useMemo } from 'react';
import { useCommandMenuContext } from './commandMenuContextStore';
import { buildContextualNavigationCommands } from './contextualCommands';
import type { CommandMenuCommand } from './commandMenuTypes';

export interface CommandMenuCommands {
  /** Static, show-scoped navigation commands (task 2.1/2.3) — empty when no
   * context is registered. */
  navigationCommands: CommandMenuCommand[];
}

/**
 * Composes the registered command-menu context (from
 * `commandMenuContextStore`) with the pure command builders into the set of
 * contextual commands the palette can render. Kept as a hook (rather than
 * inlining into `CommandPalette.tsx`) so the palette component stays under
 * the 500-line budget and the composition logic is independently testable.
 */
export function useCommandMenuCommands(): CommandMenuCommands {
  const context = useCommandMenuContext();

  const navigationCommands = useMemo(
    () => buildContextualNavigationCommands(context),
    [context]
  );

  return { navigationCommands };
}
