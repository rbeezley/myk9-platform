// PROTOTYPE — shared content primitives only; variant layouts remain separate.
import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Ellipsis,
  ExternalLink,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  PROTOTYPE_QUEUE_COUNTS,
  registrationClassCount,
  registrationEntryCount,
  type PrototypeQueue,
  type PrototypeRegistration,
} from './entryManagementPrototypeData';

export function PrototypePageHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-4', compact && 'gap-3')}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Heartland Scent Work Classic
        </p>
        <h1 className={cn('font-bold tracking-tight', compact ? 'text-2xl' : 'text-3xl')}>
          Entry Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review registrations, resolve payment, and handle exceptions.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Ellipsis className="h-4 w-4" aria-hidden />
              More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-2 py-1.5 text-sm font-semibold">Entry tools</div>
            <DropdownMenuItem>Copy view link</DropdownMenuItem>
            <DropdownMenuItem>Export CSV</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              Open Check-in desk
              <ExternalLink className="ml-auto h-4 w-4" aria-hidden />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" aria-hidden />
          Add entry
        </Button>
      </div>
    </header>
  );
}

const QUEUES: Array<{ id: PrototypeQueue; label: string }> = [
  { id: 'review', label: 'Needs review' },
  { id: 'missing', label: 'Missing information' },
  { id: 'payment', label: 'Payment due' },
  { id: 'all', label: 'All registrations' },
];

export function PrototypeQueueTabs({
  queue,
  onQueueChange,
  vertical = false,
}: {
  queue: PrototypeQueue;
  onQueueChange: (queue: PrototypeQueue) => void;
  vertical?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex gap-2',
        vertical ? 'flex-col' : 'overflow-x-auto pb-1',
        !vertical && 'items-center'
      )}
    >
      {QUEUES.map(item => (
        <button
          type="button"
          key={item.id}
          onClick={() => onQueueChange(item.id)}
          className={cn(
            'flex min-h-10 shrink-0 items-center justify-between gap-3 rounded-lg border px-3 text-sm font-medium transition-colors',
            queue === item.id
              ? 'border-primary/40 bg-primary/10 text-foreground'
              : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/60'
          )}
        >
          <span>{item.label}</span>
          <span className="tabular-nums text-xs">{PROTOTYPE_QUEUE_COUNTS[item.id]}</span>
        </button>
      ))}
      <button
        type="button"
        className={cn(
          'min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted/60',
          vertical && 'text-left'
        )}
      >
        Exceptions · 7
      </button>
    </div>
  );
}

export function PrototypeSearchAndScope({
  search,
  onSearchChange,
  compact = false,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid gap-2',
        compact ? 'grid-cols-1' : 'md:grid-cols-[minmax(18rem,1fr)_auto]'
      )}
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={event => onSearchChange(event.target.value)}
          placeholder="Search exhibitor, dog, handler, armband, confirmation, class…"
          className="min-h-11 pl-9"
        />
      </div>
      <div className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-2 text-sm">
        <button type="button" className="rounded-md px-2 py-1.5 font-medium hover:bg-muted">
          All trials <ChevronDown className="ml-1 inline h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="text-border">/</span>
        <button type="button" className="rounded-md px-2 py-1.5 font-medium hover:bg-muted">
          All classes <ChevronDown className="ml-1 inline h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function reviewClass(label: string): string {
  if (label === 'Needs review') return 'border-warning/40 bg-warning/10 text-warning';
  if (label === 'Missing information') {
    return 'border-destructive/40 bg-destructive/10 text-destructive';
  }
  return 'border-success/40 bg-success/10 text-success';
}

export function PrototypeReviewBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', reviewClass(label))}>
      {label}
    </Badge>
  );
}

export function PrototypeRegistrationSummary({
  registration,
  selected,
  checked,
  onFocus,
  onCheck,
  dense = false,
}: {
  registration: PrototypeRegistration;
  selected: boolean;
  checked: boolean;
  onFocus: () => void;
  onCheck: () => void;
  dense?: boolean;
}) {
  const entryCount = registrationEntryCount(registration);
  const classCount = registrationClassCount(registration);
  return (
    // INTENT: Focus and bulk selection are different states. Keep the focused row
    // unmistakable without adding another badge; the checkbox owns bulk selection.
    <div
      className={cn(
        'group grid cursor-pointer items-center gap-3 border-b px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/40',
        dense
          ? 'grid-cols-[auto_minmax(0,1fr)_auto]'
          : 'grid-cols-[auto_minmax(10rem,1.2fr)_minmax(8rem,.8fr)_auto_auto]',
        selected &&
          'relative z-[1] bg-primary/10 shadow-[inset_4px_0_0_hsl(var(--primary)),inset_0_0_0_1px_hsl(var(--primary)/0.55)] hover:bg-primary/10'
      )}
      aria-selected={selected}
      onClick={onFocus}
    >
      <button
        type="button"
        aria-label={`Select ${registration.confirmation}`}
        aria-pressed={checked}
        onClick={event => {
          event.stopPropagation();
          onCheck();
        }}
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded border',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input bg-background'
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" aria-hidden />}
      </button>
      <div className="min-w-0">
        <p className="truncate font-semibold">{registration.exhibitor}</p>
        <p className="truncate text-xs text-muted-foreground">
          {registration.confirmation} · {registration.submitted}
        </p>
        {dense && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {registration.dogs.map(dog => dog.name).join(', ')} · {entryCount} Entries
          </p>
        )}
      </div>
      {!dense && (
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">
            {registration.dogs.map(dog => dog.name).join(', ')}
          </p>
          <p className="text-xs text-muted-foreground">
            {entryCount} Entries · {classCount} Classes
          </p>
        </div>
      )}
      {!dense && <PrototypeReviewBadge label={registration.reviewLabel} />}
      <div className="text-right text-sm">
        <p className={cn('font-medium', registration.amountDue > 0 && 'text-destructive')}>
          {registration.paymentLabel}
        </p>
        <p className="mt-1 text-xs font-medium text-primary">{registration.primaryAction}</p>
      </div>
    </div>
  );
}

function EntryStatusControl({ label }: { label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs">
          {label}
          <ChevronDown className="h-3 w-3" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-sm font-semibold">Change Entry status</div>
        <DropdownMenuItem>Accepted</DropdownMenuItem>
        <DropdownMenuItem>Missing information</DropdownMenuItem>
        <DropdownMenuItem>Waitlist</DropdownMenuItem>
        <DropdownMenuItem>Rejected</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PrototypeFocusPanel({
  registration,
  borderless = false,
  onBack,
}: {
  registration: PrototypeRegistration;
  borderless?: boolean;
  onBack?: (() => void) | undefined;
}) {
  const [expandedDogs, setExpandedDogs] = useState<Set<string>>(
    () => new Set(registration.dogs.slice(0, 1).map(dog => dog.id))
  );
  const entryCount = registrationEntryCount(registration);

  return (
    <section
      className={cn('overflow-hidden bg-card', !borderless && 'rounded-xl border shadow-sm')}
    >
      <div className="border-b px-5 py-4">
        {onBack && (
          <Button variant="ghost" size="sm" className="-ml-2 mb-2 gap-2" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to registrations
          </Button>
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Focused registration
            </p>
            <h2 className="mt-1 text-xl font-bold">{registration.exhibitor}</h2>
            <p className="text-sm text-muted-foreground">
              {registration.confirmation} · {registration.email}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Registration actions">
                <Ellipsis className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Edit registration</DropdownMenuItem>
              <DropdownMenuItem>Send message</DropdownMenuItem>
              <DropdownMenuItem>View history</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PrototypeReviewBadge label={registration.reviewLabel} />
          <span className="text-xs text-muted-foreground">
            Submitted {registration.submitted} · {entryCount} Entries
          </span>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Primary work
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{registration.primaryAction}</p>
              <p className="text-sm text-muted-foreground">
                Review only the Entries that still require a decision.
              </p>
            </div>
            <Button size="sm">{registration.primaryAction}</Button>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Entries</h3>
            <span className="text-xs text-muted-foreground">Grouped by Dog</span>
          </div>
          <div className="overflow-hidden rounded-lg border">
            {registration.dogs.map(dog => {
              const expanded = expandedDogs.has(dog.id);
              return (
                <div key={dog.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    className="flex min-h-12 w-full items-center gap-3 bg-muted/25 px-3 py-2 text-left hover:bg-muted/50"
                    onClick={() =>
                      setExpandedDogs(current => {
                        const next = new Set(current);
                        if (next.has(dog.id)) next.delete(dog.id);
                        else next.add(dog.id);
                        return next;
                      })
                    }
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 font-semibold">{dog.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Armband {dog.armband ?? 'not assigned'} · {dog.entries.length} Entries
                    </span>
                  </button>
                  {expanded && (
                    <div>
                      {dog.entries.map(entry => (
                        <div
                          key={entry.id}
                          className="grid gap-2 border-t px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{entry.className}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {entry.trial} · {entry.trialDate} · Handler: {entry.handler}
                            </p>
                          </div>
                          <EntryStatusControl label={entry.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" className="rounded-lg border p-3 text-left hover:bg-muted/40">
            <span className="flex items-center gap-2 font-semibold">
              <CircleDollarSign className="h-4 w-4 text-muted-foreground" aria-hidden />
              Payment
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {registration.paymentLabel}
            </span>
          </button>
          <button type="button" className="rounded-lg border p-3 text-left hover:bg-muted/40">
            <span className="font-semibold">Communication & history</span>
            <span className="mt-1 block text-sm text-muted-foreground">2 messages · 4 changes</span>
          </button>
        </div>
      </div>
    </section>
  );
}

export function PrototypeSelectionToolbar({
  selectedCount,
  affectedEntries,
  onClear,
}: {
  selectedCount: number;
  affectedEntries: number;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border bg-foreground px-3 py-2 text-background shadow-2xl">
      <span className="whitespace-nowrap px-1 text-sm font-semibold">
        {selectedCount} registrations · {affectedEntries} Entries
      </span>
      <Button size="sm" variant="secondary">
        Accept eligible
      </Button>
      <Button size="sm" variant="ghost" className="text-background hover:text-foreground">
        More actions
      </Button>
      <button
        type="button"
        onClick={onClear}
        className="rounded-md p-2 hover:bg-background/15"
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
