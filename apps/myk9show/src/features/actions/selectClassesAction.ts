import { getSelectClassesHref, SELECT_CLASSES } from '@/pages/secretary/selectClassesRoutes';
import type { AppAction } from './actionRegistry';

/**
 * The show-level door into Select classes (MYK9-1317). It lived as a button row on Overview; the
 * href is absolute so it works from any show tab and lands on Overview in selection mode. The
 * caller owns the `canManageShow` gate, exactly like the rest of the show group.
 *
 * On the show home itself the href is SEARCH-ONLY, so it merges into the viewer's current query
 * and the cockpit's `day`, `filter` and `focus` survive into the mode and back out of Done
 * (MYK9-1338). Everywhere else the absolute link stays: no other tab hosts the mode.
 */
export function buildSelectClassesAction(showId: string, onShowHome = false): AppAction {
  return {
    id: 'show-select-classes',
    label: 'Select classes',
    aliases: ['manage classes', 'bulk classes', 'judges'],
    href: onShowHome ? `?select=${SELECT_CLASSES}` : getSelectClassesHref(showId),
    group: 'show',
    icon: 'select-classes',
  };
}
