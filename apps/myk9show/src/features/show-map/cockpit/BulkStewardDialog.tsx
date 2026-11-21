import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RING_ROLES, type RingRole } from '@/types/volunteer';
import { useClassStewards } from '@/hooks/queries/useClassStewards';
import {
  classesNeedingAssignment,
  useAssignToClasses,
} from '@/hooks/queries/volunteerStewardQueries';
import { volunteersPagePath } from '@/components/volunteers/volunteersPagePath';
import { bulkStewardSummary } from './bulkStewardModel';

const NO_CLASSES: ReadonlySet<string> = new Set();

interface BulkStewardClass {
  id: string;
  name: string;
}

/**
 * Select classes' Assign steward (MYK9-2328), like Assign judge: one person from the volunteer
 * list in one ring job across the ticked classes. A class that already has them in that job is
 * skipped; a class where they handle a dog is named before they are assigned.
 */
export function BulkStewardDialog({
  showId,
  classes,
  open,
  onOpenChange,
}: {
  showId: string;
  classes: readonly BulkStewardClass[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stewards = useClassStewards(showId);
  const assignMany = useAssignToClasses(showId);
  const [role, setRole] = useState<RingRole>(RING_ROLES[0]);
  const [volunteerId, setVolunteerId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stewards.volunteers.filter(v => !q || v.name.toLowerCase().includes(q));
  }, [stewards.volunteers, search]);
  const chosen = stewards.volunteers.find(v => v.id === volunteerId) ?? null;
  const classIds = classes.map(cls => cls.id);
  const toAssign = chosen
    ? classesNeedingAssignment(classIds, chosen.id, role, stewards.assignments)
    : classIds;
  const summary = bulkStewardSummary({
    classes,
    toAssignIds: toAssign,
    conflictClassIds: chosen ? (stewards.conflictMap.get(chosen.id) ?? NO_CLASSES) : NO_CLASSES,
  });

  // The handler warning must be known before the secretary assigns.
  const checkingConflicts = chosen !== null && stewards.conflictsStatus === 'loading';
  const saving = assignMany.isPending;

  const close = (next: boolean) => {
    if (!next) {
      setVolunteerId(null);
      setSearch('');
    }
    onOpenChange(next);
  };

  const confirm = () => {
    if (!chosen || toAssign.length === 0) return;
    assignMany.mutate(
      { volunteerId: chosen.id, volunteerName: chosen.name, roleName: role, classIds },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign steward</DialogTitle>
          <DialogDescription>
            {classes.length} {classes.length === 1 ? 'class' : 'classes'} selected. Stewards can
            still help at any ring.
          </DialogDescription>
        </DialogHeader>

        {stewards.status !== 'ready' ? (
          <p className="text-sm text-muted-foreground">
            {stewards.status === 'loading'
              ? 'Loading volunteers…'
              : "We couldn't load the volunteer list. Try again when you're back online."}
          </p>
        ) : (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Job</legend>
              <div className="grid grid-cols-2 gap-2">
                {RING_ROLES.map(item => (
                  <Button
                    key={item}
                    type="button"
                    variant={item === role ? 'secondary' : 'outline'}
                    aria-pressed={item === role}
                    onClick={() => setRole(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Volunteer</legend>
              {stewards.volunteers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No volunteers yet.{' '}
                  <Link to={volunteersPagePath(showId)} className="underline underline-offset-4">
                    Add them on the Volunteers page
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <Input
                    placeholder="Search volunteers..."
                    aria-label="Search volunteers"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {filtered.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No volunteers match &ldquo;{search}&rdquo;.
                      </p>
                    )}
                    {filtered.map(vol => (
                      <Button
                        key={vol.id}
                        type="button"
                        variant={vol.id === volunteerId ? 'secondary' : 'ghost'}
                        aria-pressed={vol.id === volunteerId}
                        className="w-full justify-start"
                        onClick={() => setVolunteerId(vol.id)}
                      >
                        {vol.name}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </fieldset>

            {chosen && summary.alreadyCount > 0 && (
              <p className="text-sm text-muted-foreground">{summary.alreadyText}</p>
            )}
            {checkingConflicts && (
              <p className="text-sm text-muted-foreground">Checking entries…</p>
            )}
            {chosen && stewards.conflictsStatus === 'unavailable' && (
              <p className="text-sm text-muted-foreground">
                We couldn&apos;t check whether {chosen.name} handles a dog in these classes.
              </p>
            )}
            {chosen && summary.conflictNames.length > 0 && (
              <p className="flex gap-2 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {chosen.name} handles a dog in {summary.conflictNames.join(', ')}.
                </span>
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={!chosen || toAssign.length === 0 || checkingConflicts || saving}
          >
            {summary.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
