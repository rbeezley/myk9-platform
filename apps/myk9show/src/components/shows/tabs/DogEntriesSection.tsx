/**
 * DogEntriesSection — per-dog block in the exhibitor "My entries" redesign.
 *
 * Shows a dog header (name, armband, class count) followed by a list of
 * entry rows (element | class title | day/time | result or upcoming | link).
 */

import { Link } from 'react-router-dom';
import {
  Package,
  Home,
  Leaf,
  Layers,
  Search,
  UserCheck,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Chip } from '@/components/base/Chip';
import type { DogEntriesGroup, EnrichedShowEntry } from '@/hooks/useShowEntriesForUser';

// ---------------------------------------------------------------------------
// Element icon mapping (Scent Work elements → Lucide icons)
// ---------------------------------------------------------------------------

type ElementIconConfig = { icon: React.ElementType; bg: string; fg: string };

const ELEMENT_ICONS: Record<string, ElementIconConfig> = {
  Container: { icon: Package, bg: 'bg-teal-100 dark:bg-teal-900/40', fg: 'text-teal-700 dark:text-teal-300' },
  Interior: { icon: Home, bg: 'bg-amber-100 dark:bg-amber-900/40', fg: 'text-amber-700 dark:text-amber-300' },
  Exterior: { icon: Leaf, bg: 'bg-green-100 dark:bg-green-900/40', fg: 'text-green-700 dark:text-green-300' },
  Buried: { icon: Layers, bg: 'bg-orange-100 dark:bg-orange-900/40', fg: 'text-orange-700 dark:text-orange-300' },
  Detective: { icon: Search, bg: 'bg-purple-100 dark:bg-purple-900/40', fg: 'text-purple-700 dark:text-purple-300' },
  'Handler Discrimination': { icon: UserCheck, bg: 'bg-blue-100 dark:bg-blue-900/40', fg: 'text-blue-700 dark:text-blue-300' },
};

const FALLBACK_ICON: ElementIconConfig = {
  icon: Search,
  bg: 'bg-muted',
  fg: 'text-muted-foreground',
};

function getElementIcon(element: string): ElementIconConfig {
  return ELEMENT_ICONS[element] ?? FALLBACK_ICON;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface DogEntriesSectionProps {
  group: DogEntriesGroup;
  showId: string;
}

export function DogEntriesSection({ group, showId }: DogEntriesSectionProps) {
  const { dogName, entries } = group;

  return (
    <section aria-label={`${dogName}'s entries`} className="space-y-3">
      {/* Dog header */}
      <div className="flex items-center gap-3 pb-2 border-b border-border">
        <DogInitialAvatar name={dogName} />
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-semibold truncate">{dogName}</h3>
        </div>
        <Chip color="stone" size="sm">
          {entries.length} {entries.length === 1 ? 'class' : 'classes'}
        </Chip>
      </div>

      {/* Entry rows */}
      <div className="space-y-2">
        {entries.map(entry => (
          <EntryRow key={entry.entryId} entry={entry} showId={showId} />
        ))}
      </div>
    </section>
  );
}

function DogInitialAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <span
      className="h-10 w-10 shrink-0 rounded-full bg-primary/15 flex items-center justify-center text-base font-bold text-primary"
      aria-hidden
    >
      {initial}
    </span>
  );
}

interface EntryRowProps {
  entry: EnrichedShowEntry;
  showId: string;
}

function EntryRow({ entry, showId }: EntryRowProps) {
  const { icon: Icon, bg, fg } = getElementIcon(entry.element);
  const href = `/shows/${showId}/trials/${entry.trialId}/classes/${entry.classId}`;

  const meta = [
    entry.dayLabel,
    entry.startTime,
    entry.judgeName ? `Judge ${entry.judgeName}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      to={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/40 transition-colors"
      aria-label={`${entry.classTitle} — view class`}
    >
      {/* Element icon */}
      <span className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center ${bg}`}>
        <Icon className={`h-5 w-5 ${fg}`} />
      </span>

      {/* Class info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{entry.classTitle || 'Unnamed Class'}</p>
        {meta && <p className="text-xs text-muted-foreground truncate mt-0.5">{meta}</p>}
      </div>

      {/* Result or status */}
      <EntryResultBadge entry={entry} />

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function EntryResultBadge({ entry }: { entry: EnrichedShowEntry }) {
  if (!entry.hasResult || !entry.result) {
    return (
      <Chip color="stone" size="sm">
        Upcoming
      </Chip>
    );
  }

  const { qualified, time, placement } = entry.result;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {qualified ? (
        <Chip color="green" size="sm" leadingIcon={<CheckCircle2 className="h-3 w-3" />}>
          Qualified
        </Chip>
      ) : (
        <Chip color="red" size="sm" leadingIcon={<XCircle className="h-3 w-3" />}>
          Not qualified
        </Chip>
      )}
      {qualified && time && (
        <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
          {time}
        </span>
      )}
      {qualified && placement && <PlacementPill placement={placement} />}
    </div>
  );
}

const PLACEMENT_STYLES: Record<number, string> = {
  1: 'bg-yellow-400 text-yellow-900',
  2: 'bg-zinc-300 text-zinc-800',
  3: 'bg-amber-600 text-amber-50',
  4: 'bg-indigo-400 text-indigo-50',
};

function PlacementPill({ placement }: { placement: number }) {
  const label = ['1st', '2nd', '3rd', '4th'][placement - 1] ?? `${placement}th`;
  const style = PLACEMENT_STYLES[placement] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${style}`}>{label}</span>
  );
}
