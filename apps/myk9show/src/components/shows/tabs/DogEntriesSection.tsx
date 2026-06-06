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
  Clock,
  Hash,
} from 'lucide-react';
import { Chip } from '@/components/base/Chip';
import { PlacementPill } from '@/components/base/PlacementPill';
import { PersonAvatar } from '@/components/common/PersonAvatar';
import type { DogEntriesGroup, EnrichedShowEntry } from '@/hooks/useShowEntriesForUser';

type ElementIconConfig = { icon: React.ElementType; bg: string; fg: string };

const ELEMENT_ICONS: Record<string, ElementIconConfig> = {
  Container: {
    icon: Package,
    bg: 'bg-teal-100 dark:bg-teal-900/40',
    fg: 'text-teal-700 dark:text-teal-300',
  },
  Interior: {
    icon: Home,
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    fg: 'text-amber-700 dark:text-amber-300',
  },
  Exterior: {
    icon: Leaf,
    bg: 'bg-green-100 dark:bg-green-900/40',
    fg: 'text-green-700 dark:text-green-300',
  },
  Buried: {
    icon: Layers,
    bg: 'bg-orange-100 dark:bg-orange-900/40',
    fg: 'text-orange-700 dark:text-orange-300',
  },
  Detective: {
    icon: Search,
    bg: 'bg-purple-100 dark:bg-purple-900/40',
    fg: 'text-purple-700 dark:text-purple-300',
  },
  'Handler Discrimination': {
    icon: UserCheck,
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    fg: 'text-blue-700 dark:text-blue-300',
  },
};

const FALLBACK_ICON: ElementIconConfig = {
  icon: Search,
  bg: 'bg-muted',
  fg: 'text-muted-foreground',
};

function getElementIcon(element: string): ElementIconConfig {
  return ELEMENT_ICONS[element] ?? FALLBACK_ICON;
}

interface DogEntriesSectionProps {
  group: DogEntriesGroup;
  showId: string;
}

export function DogEntriesSection({ group, showId }: DogEntriesSectionProps) {
  const { dogName, entries } = group;

  return (
    <section aria-label={`${dogName}'s entries`} className="space-y-3">
      <div className="flex items-center gap-3 pb-2 border-b border-border">
        <PersonAvatar name={dogName} size="sm" className="h-10 w-10" />
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-semibold truncate">{dogName}</h3>
        </div>
        <Chip color="stone" size="sm">
          {entries.length} {entries.length === 1 ? 'class' : 'classes'}
        </Chip>
      </div>

      <div className="space-y-2">
        {entries.map(entry => (
          <EntryRow key={entry.entryId} entry={entry} showId={showId} />
        ))}
      </div>
    </section>
  );
}

interface EntryRowProps {
  entry: EnrichedShowEntry;
  showId: string;
}

function EntryRow({ entry, showId }: EntryRowProps) {
  const { icon: Icon, bg, fg } = getElementIcon(entry.element);
  const href = `/shows/${showId}/trials/${entry.trialId}/classes/${entry.classId}`;

  const meta = [entry.dayLabel, entry.startTime, entry.judgeName ? `Judge ${entry.judgeName}` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      to={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/40 transition-colors"
      aria-label={`${entry.classTitle} — view class`}
    >
      <span className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center ${bg}`}>
        <Icon className={`h-5 w-5 ${fg}`} />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{entry.classTitle || 'Unnamed Class'}</p>
        {meta && <p className="text-xs text-muted-foreground truncate mt-0.5">{meta}</p>}
      </div>

      <div className="hidden shrink-0 flex-col items-end gap-0.5 text-right sm:flex">
        <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums text-foreground">
          <Clock className="h-3.5 w-3.5 text-primary" />
          {entry.startTime || 'TBD'}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Hash className="h-3 w-3" />
          {entry.armband || 'No #'}
        </span>
      </div>

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
        <span className="font-mono text-xs font-semibold tabular-nums text-foreground">{time}</span>
      )}
      {qualified && placement && <PlacementPill placement={placement} size="sm" />}
    </div>
  );
}
