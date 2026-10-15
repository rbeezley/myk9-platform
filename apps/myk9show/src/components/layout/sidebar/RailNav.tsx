/**
 * RailNav — the desktop sidebar as a labeled icon rail (Slack/Teams style).
 *
 * INTENT: every rail item shows its label under the icon, always. No
 * hover-only names: ringside tablets have no hover, and this audience reads
 * labels rather than exploring icons (docs/plan-sidebar-browse-pane.md).
 */

import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  buildRailEntries,
  railAccessibleName,
  railLabel,
  type RailEntry,
  type RailMenuSection,
} from './railEntries';
import type { NavGroup, NavItem } from './types';

const RAIL_ITEM_CLASS =
  'group relative flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

// Active text stays foreground: primary text on its own 10% tint measures
// 4.21:1 on the rail surface (axe, A11y smoke on #3050). The tint and the
// primary icon (non-text, 3:1) carry the active state instead.
function railItemStateClass(active: boolean): string {
  return active
    ? 'bg-primary/10 font-semibold text-foreground'
    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground';
}

function railIconClass(active: boolean): string {
  return cn('h-5 w-5', active && 'text-primary');
}

/** Wraps at spaces only; a word too wide for the rail is renamed, never cut. */
// text-xs is the app's 14px caption step, the INTENT.md floor for any text.
const RAIL_LABEL_CLASS = 'max-w-full text-xs font-medium leading-tight';

interface RailNavProps {
  groups: NavGroup[];
  isActive: (href: string) => boolean;
}

export function RailNav({ groups, isActive }: RailNavProps) {
  const entries = React.useMemo(() => buildRailEntries(groups), [groups]);

  return (
    <nav aria-label="Main" className="space-y-1">
      {entries.map(entry => (
        <React.Fragment key={entryKey(entry)}>
          {entry.startsGroup && (
            <div className="mx-3 my-2 border-t border-border/40" aria-hidden="true" />
          )}
          {entry.kind === 'item' ? (
            <RailLink item={entry.item} active={isActive(entry.item.href)} />
          ) : (
            <RailMenu
              title={entry.menu.title}
              icon={entry.menu.icon}
              sections={entry.sections}
              isActive={isActive}
            />
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

function entryKey(entry: RailEntry): string {
  return entry.kind === 'item'
    ? `item:${entry.item.title}:${entry.item.href}`
    : `menu:${entry.menu.id}`;
}

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      aria-label={railAccessibleName(item)}
      aria-current={active ? 'page' : undefined}
      className={cn(RAIL_ITEM_CLASS, railItemStateClass(active))}
    >
      <span className="relative">
        <Icon className={railIconClass(active)} aria-hidden="true" />
        {item.badge && (
          <span className="absolute -right-2.5 -top-1.5 rounded-full bg-primary px-1 text-xs font-semibold leading-4 text-primary-foreground">
            {item.badge}
          </span>
        )}
      </span>
      <span className={RAIL_LABEL_CLASS}>{railLabel(item)}</span>
    </Link>
  );
}

interface RailMenuProps {
  title: string;
  icon: NavItem['icon'];
  sections: RailMenuSection[];
  isActive: (href: string) => boolean;
}

function RailMenu({ title, icon: Icon, sections, isActive }: RailMenuProps) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const active = sections.some(section => section.items.some(item => isActive(item.href)));
  const showSectionTitles = sections.length > 1;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // "true", not "page": the trigger holds the current page, it is not it.
          aria-current={active ? 'true' : undefined}
          className={cn(RAIL_ITEM_CLASS, railItemStateClass(active))}
        >
          <Icon className={railIconClass(active)} aria-hidden="true" />
          <span className={RAIL_LABEL_CLASS}>{title}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        aria-labelledby={headingId}
        className="max-h-[var(--available-height)] w-72 overflow-y-auto p-2"
      >
        <p id={headingId} className="px-2 pb-1 pt-1 text-sm font-semibold text-foreground">
          {title}
        </p>
        {sections.map(section => (
          <div key={section.title} className="pt-1">
            {showSectionTitles && (
              <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map(item => {
                const itemActive = isActive(item.href);
                return (
                  <li key={`${item.title}:${item.href}`}>
                    <Link
                      to={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={itemActive ? 'page' : undefined}
                      className={cn(
                        'flex min-h-11 flex-col justify-center rounded-md px-2 py-1.5 text-sm',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        itemActive
                          ? 'bg-primary/10 font-semibold text-foreground'
                          : 'text-foreground hover:bg-muted/50'
                      )}
                    >
                      <span>{item.title}</span>
                      {item.description && (
                        <span className="text-xs text-muted-foreground">{item.description}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
