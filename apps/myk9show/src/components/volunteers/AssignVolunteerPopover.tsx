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
}

export function AssignVolunteerPopover({
  volunteers,
  excludeIds,
  conflictIds,
  onAssign,
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
        <Button variant="ghost" size="sm" aria-label="Assign volunteer" className="h-6 px-1.5">
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
        <div className="max-h-48 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">No volunteers found</p>
          )}
          {filtered.map(vol => (
            <button
              key={vol.id}
              type="button"
              data-testid="volunteer-option"
              onClick={() => handleSelect(vol.id)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
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
