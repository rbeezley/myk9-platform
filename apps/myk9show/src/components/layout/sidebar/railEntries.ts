/**
 * The desktop rail's entries, derived from the same groups the mobile drawer
 * renders. A group with `railMenu` folds into one item that opens a labeled
 * panel; groups sharing a menu id fold into the same item, placed where the
 * first of them sits. A group with `railLink` folds into one link to the item used last (Browse).
 * Everything else stays one rail item per nav item.
 */

import type { NavGroup, NavItem, NavRailLink, NavRailMenu } from './types';

export interface RailMenuSection {
  title: string;
  items: NavItem[];
}

export type RailEntry =
  | { kind: 'item'; item: NavItem; startsGroup: boolean }
  | { kind: 'menu'; menu: NavRailMenu; sections: RailMenuSection[]; startsGroup: boolean }
  | { kind: 'link'; link: NavRailLink; items: NavItem[]; startsGroup: boolean };

export function buildRailEntries(groups: readonly NavGroup[]): RailEntry[] {
  const entries: RailEntry[] = [];
  const menus = new Map<string, Extract<RailEntry, { kind: 'menu' }>>();

  groups.forEach((group, groupIndex) => {
    if (group.items.length === 0) return;
    const startsGroup = groupIndex > 0 && entries.length > 0;

    if (group.railLink) {
      entries.push({ kind: 'link', link: group.railLink, items: group.items, startsGroup });
      return;
    }

    if (group.railMenu) {
      const existing = menus.get(group.railMenu.id);
      const section = { title: group.title, items: group.items };
      if (existing) {
        existing.sections.push(section);
        return;
      }
      const entry = {
        kind: 'menu' as const,
        menu: group.railMenu,
        sections: [section],
        startsGroup,
      };
      menus.set(group.railMenu.id, entry);
      entries.push(entry);
      return;
    }

    group.items.forEach((item, itemIndex) => {
      entries.push({ kind: 'item', item, startsGroup: startsGroup && itemIndex === 0 });
    });
  });

  return entries;
}

/** The label a rail item shows: its short rail title, else its title. */
export function railLabel(item: NavItem): string {
  return item.railTitle ?? item.title;
}

/**
 * The rail item's accessible name. It starts with the visible label (WCAG
 * 2.5.3, label in name) and keeps the full title when the label is shortened.
 */
export function railAccessibleName(item: NavItem): string {
  return item.railTitle ? `${item.railTitle}: ${item.title}` : item.title;
}
