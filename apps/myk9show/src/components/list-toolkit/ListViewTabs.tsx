/**
 * Built-in views with live counts, as a labelled "Show:" select — the list
 * toolkit's replacement for stat cards. The count in each option IS the stat,
 * and picking one applies the view (MYK9-906: a row of underlined tabs read as
 * page navigation to a novice).
 *
 * A view that lives on another page (a request queue) navigates there when
 * picked, so the list links to that surface instead of duplicating it
 * (CLAUDE.md, "consolidate, don't duplicate"). When the current filters match
 * no view, the select reads "Custom".
 */

import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ListView } from './types';

interface ListViewTabsProps {
  views: ListView[];
  /** The view the current filters match exactly, or null for a custom filter. */
  activeId: string | null;
  onSelect: (id: string) => void;
  label: string;
  className?: string;
}

const CUSTOM_ID = '__custom__';

function optionText(view: ListView): ReactNode {
  if (view.count === undefined) return view.label;
  if (view.count === null) {
    // Unknown stays distinct from zero: a dash that screen readers name in words.
    return (
      <>
        {view.label} (
        <span role="img" aria-label="count unavailable">
          —
        </span>
        )
      </>
    );
  }
  return `${view.label} (${view.count.toLocaleString()})`;
}

export function ListViewTabs({ views, activeId, onSelect, label, className }: ListViewTabsProps) {
  const navigate = useNavigate();

  const handleChange = (id: string) => {
    if (id === CUSTOM_ID) return;
    const view = views.find(candidate => candidate.id === id);
    if (view?.href) navigate(view.href);
    else if (view) onSelect(id);
  };

  return (
    <div className={cn('flex min-w-0 max-w-full items-center gap-2', className)}>
      <span className="shrink-0 text-sm font-medium text-foreground" aria-hidden="true">
        Show:
      </span>
      <Select value={activeId ?? CUSTOM_ID} onValueChange={handleChange}>
        <SelectTrigger
          aria-label={`Show: ${label}`}
          className="w-auto min-w-0 max-w-[calc(100vw-5rem)] flex-1 sm:min-w-[12rem] sm:flex-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {activeId === null && (
            <SelectItem value={CUSTOM_ID} disabled className="min-h-11">
              Custom
            </SelectItem>
          )}
          {views.map(view => (
            <SelectItem key={view.id} value={view.id} className="min-h-11">
              {optionText(view)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
