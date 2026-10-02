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
   * Empty off a show route.
   *
   * Items the registry returns greyed are OMITTED, and that stays true now that
   * "Generate & publish premium" greys itself mid-publish and when the premium
   * is already up to date (MYK9-630 round 5): the palette has no disabled row
   * and no place to put the reason, so a row you can select but that does
   * nothing is worse than an absent one. The header menu shows the item with
   * its reason, and it is the surface a secretary reaches for when they want to
   * know WHY something is unavailable. Revisit if the palette grows a disabled
   * row that can carry a sublabel. */
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
    // Off a show route only the detail page's own actions apply (Edit dog, Edit person...);
    // the role-wide header items (Add Show...) have their own palette entries.
    const inShow = route.kind === 'show';
    return actions
      .filter(action => !action.disabledReason && (inShow || action.pageOwned))
      .map(action => ({
        id: `command-menu-action-${action.id}`,
        group: 'actions' as const,
        label: action.label,
        sublabel: inShow ? 'Current show' : 'Current page',
        ...(route.kind === 'show' ? { showScope: route.showId } : {}),
        // A registry item is either a destination or a side effect, and the
        // palette adapter already honours both. Spreading conditionally keeps
        // `href: undefined` out of the object, which `exactOptionalPropertyTypes`
        // rejects and which would also make the adapter prefer a missing href.
        ...(action.aliases ? { aliases: action.aliases } : {}),
        ...(action.href !== undefined ? { href: action.href } : {}),
        ...(action.run ? { run: action.run } : {}),
      }));
  }, [actions, route]);

  return { navigationCommands, actionCommands };
}
