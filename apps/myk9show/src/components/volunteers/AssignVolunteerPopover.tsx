import { useState, useMemo } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Volunteer } from '@/types/volunteer';

interface AssignVolunteerPopoverProps {
  volunteers: Volunteer[];
  excludeIds: string[];
  conflictIds: Set<string>;
  onAssign: (volunteerId: string) => void;
  /** The job being filled ("Table Steward"); names the trigger for a screen reader. */
  roleLabel?: string | undefined;
  /**
   * Whether the handler check has finished (MYK9-2328). Until it is `ready`, a person-linked
   * volunteer cannot be picked, since they may handle a dog in this class. Omitted on the
   * Volunteers page, which does not gate.
   */
  conflictsStatus?: 'loading' | 'unavailable' | 'ready' | undefined;
}

/**
 * Why the picker is empty (MYK9-1726). Volunteers come only from the show's list, filled by
 * Add Volunteer at the top of the Volunteers page, so an empty list points there.
 */
function emptyMessage(volunteers: Volunteer[], excludeIds: string[], search: string): string {
  if (volunteers.length === 0)
    return 'No volunteers yet. Add people with Add Volunteer at the top of this page.';
  const excluded = new Set(excludeIds);
  if (volunteers.every(v => excluded.has(v.id))) {
    return 'All your volunteers already have this job.';
  }
  return `No volunteers match "${search}".`;
}

export function AssignVolunteerPopover({
  volunteers,
  excludeIds,
  conflictIds,
  onAssign,
  roleLabel,
  conflictsStatus = 'ready',
}: AssignVolunteerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const excludeSet = new Set(excludeIds);
    const q = search.toLowerCase();
    return volunteers
      .filter(v => !excludeSet.has(v.id))
      .filter(v => !search || v.name.toLowerCase().includes(q));
  }, [volunteers, excludeIds, search]);

  function handleSelect(volunteerId: string) {
    onAssign(volunteerId);
    setOpen(false);
    setSearch('');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={roleLabel ? `Assign ${roleLabel}` : 'Assign volunteer'}
          className="h-11 min-w-11 px-2"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <Input
          placeholder="Search volunteers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="mb-2 h-8 text-sm"
        />
        {conflictsStatus === 'loading' && (
          <p className="px-1 pb-2 text-xs text-muted-foreground">Checking entries…</p>
        )}
        {conflictsStatus === 'unavailable' && (
          <p className="px-1 pb-2 text-xs text-muted-foreground">
            We couldn&apos;t check which volunteers handle a dog in this class.
          </p>
        )}
        <div className="max-h-48 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-1 py-2 text-center text-sm text-muted-foreground">
              {emptyMessage(volunteers, excludeIds, search)}
            </p>
          )}
          {filtered.map(vol => (
            <button
              key={vol.id}
              type="button"
              data-testid="volunteer-option"
              disabled={conflictsStatus !== 'ready' && vol.personId !== null}
              onClick={() => handleSelect(vol.id)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              {conflictIds.has(vol.id) && (
                <span title="Conflict: entered in this class">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                </span>
              )}
              <span className="truncate">{vol.name}</span>
              {!vol.personId && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">(walk-up)</span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
