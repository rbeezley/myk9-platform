import { getSelectClassesHref } from '@/pages/secretary/selectClassesRoutes';
import type { AppAction } from './actionRegistry';

/**
 * The show-level door into Select classes (MYK9-1317). It lived as a button row on Overview; the
 * href is absolute so it works from any show tab and lands on Overview in selection mode. The
 * caller owns the `canManageShow` gate, exactly like the rest of the show group.
 */
export function buildSelectClassesAction(showId: string): AppAction {
  return {
    id: 'show-select-classes',
    label: 'Select classes',
    aliases: ['manage classes', 'bulk classes', 'judges'],
    href: getSelectClassesHref(showId),
    group: 'show',
    icon: 'select-classes',
  };
}
