import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, MessageSquare, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import { useShowPresenceRoster } from '@/features/show-presence/showPresenceContext';
import { useMessageStore } from '@/store/messageStore';
import { mapSecretaryEntryToEntryManagementEntry } from '@/hooks/useEntryManagementData';
import type { SecretaryEntry } from '@/services/database/entries';
import type { ShowWorkbenchClassSummary } from '@/features/show-workbench/showWorkbenchTypes';
import { cn } from '@/lib/utils';
import {
  buildPeopleRoster,
  filterPeopleRoster,
  type PeopleRosterFilter,
  type PeopleRosterPerson,
} from './peopleRoster';

interface ShowDeskPeopleRosterProps {
  showId: string;
  classes: readonly ShowWorkbenchClassSummary[];
  entries: readonly SecretaryEntry[];
  isLoading?: boolean;
  loadError?: unknown;
  onRetry?: (() => void) | undefined;
  currentDate?: Date | null;
}

const FILTERS: Array<{ id: PeopleRosterFilter; label: string }> = [
  { id: 'all', label: 'All exhibitors' },
  { id: 'needs-check-in', label: 'Needs check-in' },
  { id: 'online', label: 'Online' },
];

export function ShowDeskPeopleRoster({
  showId,
  classes,
  entries: sourceEntries,
  isLoading = false,
  loadError,
  onRetry,
  currentDate,
}: ShowDeskPeopleRosterProps) {
  const navigate = useNavigate();
  const { present } = useShowPresenceRoster();
  const getOrCreateThread = useMessageStore(s => s.getOrCreateThread);
  const [now, setNow] = useState(() => new Date());
  const [checkedInEntryIds, setCheckedInEntryIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PeopleRosterFilter>('all');
  const [busyEntryIds, setBusyEntryIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (currentDate) return undefined;
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, [currentDate]);

  const entries = useMemo(
    () =>
      sourceEntries.map(mapSecretaryEntryToEntryManagementEntry).map(entry =>
        checkedInEntryIds.has(entry.id)
          ? {
              ...entry,
              classes: entry.classes.map(cls => ({
                ...cls,
                checkInStatus: 'checked-in' as const,
                checkInTime: new Date(),
              })),
            }
          : entry
      ),
    [checkedInEntryIds, sourceEntries]
  );

  const roster = useMemo(
    () =>
      buildPeopleRoster({
        entries,
        presence: present,
        classes: classes.map(cls => ({
          id: cls.id,
          name: cls.name,
          time: cls.time,
          ring: cls.trialName || cls.trialNumber,
          trialDate: cls.trialDate,
          timezone: cls.timezone ?? null,
        })),
        currentDate: currentDate ?? now,
      }),
    [classes, currentDate, entries, now, present]
  );
  const visibleRoster = useMemo(
    () => filterPeopleRoster(roster, search, filter),
    [filter, roster, search]
  );

  async function checkInRows(person: PeopleRosterPerson, entryIds: string[]) {
    if (entryIds.length === 0) return;
    setActionError(null);
    setBusyEntryIds(current => new Set([...current, ...entryIds]));
    const results = await Promise.allSettled(
      entryIds.map(entryId => updateReplicatedCheckInStatus(entryId, 'checked-in'))
    );
    const succeeded = entryIds.filter((_, index) => results[index]?.status === 'fulfilled');

    if (succeeded.length > 0) {
      setCheckedInEntryIds(current => new Set([...current, ...succeeded]));
    }

    if (succeeded.length !== entryIds.length) {
      setActionError(
        succeeded.length > 0
          ? `Checked in ${succeeded.length} of ${entryIds.length} for ${person.name}.`
          : `Couldn't check in ${person.name}. Try again.`
      );
    }

    setBusyEntryIds(current => {
      const next = new Set(current);
      entryIds.forEach(entryId => next.delete(entryId));
      return next;
    });
  }

  async function handleMessage(person: PeopleRosterPerson) {
    if (!person.authUserId) {
      setActionError(`${person.name} does not have a message-capable account yet.`);
      return;
    }

    setActionError(null);
    const thread = await getOrCreateThread(showId, person.authUserId);
    if (!thread) {
      setActionError(`Couldn't open a message thread for ${person.name}.`);
      return;
    }

    navigate(`/secretary/messages?showId=${showId}&threadId=${thread.id}`);
  }

  function handleManageEntries(person: PeopleRosterPerson) {
    navigate(`/shows/${showId}/entry-management?person=${encodeURIComponent(person.name)}`);
  }

  if (isLoading) {
    return <div className="py-6 text-sm text-muted-foreground">Loading exhibitors...</div>;
  }

  if (loadError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-destructive">Couldn't load exhibitors.</p>
        <p className="mt-1 text-muted-foreground">{getErrorMessage(loadError)}</p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={event => {
            setSearch(event.target.value);
            setExpandedId(null);
          }}
          placeholder="Search name, dog, armband"
          className="min-h-11 pl-9"
          aria-label="Search exhibitors"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(option => (
          <Button
            key={option.id}
            type="button"
            variant={filter === option.id ? 'default' : 'outline'}
            size="sm"
            className="min-h-10 rounded-full"
            onClick={() => {
              setFilter(option.id);
              setExpandedId(null);
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {roster.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No exhibitors are entered for this show yet.
        </div>
      ) : visibleRoster.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No exhibitors match this view.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          {visibleRoster.map(person => {
            const expanded = expandedId === person.id;
            const eligibleEntryIds = person.classRows
              .filter(row => row.eligibleForCheckIn)
              .map(row => row.entryId);
            const anyBusy = person.classRows.some(row => busyEntryIds.has(row.entryId));

            return (
              <div key={person.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  className={cn(
                    'flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    expanded && 'bg-muted/40'
                  )}
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : person.id)}
                >
                  <span
                    className={cn(
                      'h-2.5 w-2.5 shrink-0 rounded-full',
                      person.presence ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                    )}
                    aria-label={person.presence ? 'Online now' : 'Not currently online'}
                    role="img"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{person.name}</span>
                    <span className="mt-1 block truncate text-sm text-muted-foreground">
                      {person.summary}
                    </span>
                  </span>
                  {person.badge && <Badge variant="secondary">{person.badge}</Badge>}
                </button>

                {expanded && (
                  <div className="space-y-3 border-t bg-background p-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-10 gap-2"
                        onClick={() => void handleMessage(person)}
                        disabled={!person.authUserId}
                        title={!person.authUserId ? 'No message-capable account' : undefined}
                      >
                        <MessageSquare className="h-4 w-4" aria-hidden="true" />
                        Message
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-10 gap-2"
                        onClick={() => void checkInRows(person, eligibleEntryIds)}
                        disabled={eligibleEntryIds.length === 0 || anyBusy}
                      >
                        <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                        Check in all eligible
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-10"
                        onClick={() => handleManageEntries(person)}
                      >
                        Manage entries
                      </Button>
                    </div>
                    {!person.authUserId && (
                      <p className="text-xs text-muted-foreground">
                        Message unavailable: no message-capable account.
                      </p>
                    )}

                    <div className="space-y-2">
                      {person.classRows.map(row => {
                        const busy = busyEntryIds.has(row.entryId);
                        return (
                          <div
                            key={row.id}
                            className="grid gap-3 rounded-md border p-3 sm:grid-cols-[5rem_1fr_auto] sm:items-center"
                          >
                            <div className="rounded-md border bg-muted/30 px-3 py-2 text-center">
                              <span className="block text-base font-semibold">
                                {row.armband ?? 'Missing'}
                              </span>
                              <span className="block text-[11px] uppercase text-muted-foreground">
                                armband
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{row.dogName}</p>
                              <p className="text-sm text-muted-foreground">
                                {row.className}
                                {row.time ? ` - ${row.time}` : ''}
                              </p>
                              <StatusBadge
                                family="entry"
                                status={row.statusValue}
                                label={row.statusLabel}
                                className="mt-1 text-xs"
                              />
                            </div>
                            {row.eligibleForCheckIn ? (
                              <Button
                                type="button"
                                size="sm"
                                className="min-h-10"
                                disabled={busy}
                                onClick={() => void checkInRows(person, [row.entryId])}
                              >
                                {busy ? 'Checking in...' : 'Check in'}
                              </Button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}
