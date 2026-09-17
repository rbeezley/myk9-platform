import { useMemo } from 'react';
import { useCommandMenuContext } from './commandMenuContextStore';
import { buildContextualNavigationCommands } from './contextualCommands';
import { useCurrentActions } from '@/features/actions/useCurrentActions';
import type { CommandMenuCommand } from './commandMenuTypes';

export interface CommandMenuCommands {
  /** Static, show-scoped navigation commands (task 2.1/2.3) — empty when no
   * context is registered. */
  navigationCommands: CommandMenuCommand[];
  /** The SAME per-route action list the header Actions menu renders
   * (`features/actions`), so the two doors can never disagree (MYK9-630).
   * Empty off a show route. Items the registry returns greyed are omitted:
   * the palette has no disabled row, and a dead row is worse than an absent
   * one — the header menu is where the reason is shown. */
  actionCommands: CommandMenuCommand[];
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
  const { route, actions } = useCurrentActions();

  const navigationCommands = useMemo(() => buildContextualNavigationCommands(context), [context]);

  const actionCommands = useMemo<CommandMenuCommand[]>(() => {
    if (route.kind !== 'show') return [];
    return actions
      .filter(action => !action.disabledReason)
      .map(action => ({
        id: `command-menu-action-${action.id}`,
        group: 'actions' as const,
        label: action.label,
        sublabel: 'Current show',
        showScope: route.showId,
        // A registry item is either a destination or a side effect, and the
        // palette adapter already honours both. Spreading conditionally keeps
        // `href: undefined` out of the object, which `exactOptionalPropertyTypes`
        // rejects and which would also make the adapter prefer a missing href.
        ...(action.href !== undefined ? { href: action.href } : {}),
        ...(action.run ? { run: action.run } : {}),
      }));
  }, [actions, route]);

  return { navigationCommands, actionCommands };
}
