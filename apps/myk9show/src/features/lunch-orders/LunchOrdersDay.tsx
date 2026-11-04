import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useShowOfficials } from '@/hooks/queries/useShowOfficials';
import { useTrialJudges } from '@/features/judge-supplies/useTrialJudges';
import { collectLunchCandidates } from './lunchCandidates';
import { LunchOrderRow, type LunchOrderPatch } from './LunchOrderRow';
import {
  buildLunchOrderList,
  LUNCH_NAME_MAX,
  LUNCH_ROLES,
  type LunchListItem,
  type LunchRole,
} from './lunchOrders';
import { useTrialLunchOrders, type VolunteersOnDaysResult } from './useLunchOrders';

interface LunchOrdersDayProps {
  showId: string;
  trialId: string;
  volunteers: VolunteersOnDaysResult;
}

/** The Lunch orders list for one show day: the day's assignments first, then "Add person". */
export function LunchOrdersDay({ showId, trialId, volunteers }: LunchOrdersDayProps) {
  const { query, save, remove } = useTrialLunchOrders(trialId);
  const judges = useTrialJudges(trialId);
  const officials = useShowOfficials(showId);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<LunchRole>('club_member');
  const [addError, setAddError] = useState(false);

  if (query.isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Lunch orders could not load. Check your connection and reopen this tool.
      </p>
    );
  }
  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading lunch orders...</p>;
  }

  const items = buildLunchOrderList(
    query.data ?? [],
    collectLunchCandidates({
      trialId,
      judges: judges.data ?? [],
      officials: officials.data,
      volunteers: volunteers.data ?? [],
    })
  );

  async function saveItem(item: LunchListItem, patch: LunchOrderPatch) {
    await save.mutateAsync({
      savedId: item.savedId,
      personId: item.personId,
      name: item.name,
      role: item.role,
      ...patch,
    });
  }

  async function addPerson() {
    const name = newName.trim();
    if (!name) return;
    setAddError(false);
    try {
      await save.mutateAsync({
        savedId: null,
        personId: null,
        name,
        role: newRole,
      });
      setNewName('');
    } catch {
      setAddError(true);
    }
  }

  const rosterFailed = judges.isError || officials.isError || volunteers.isError;
  const rosterLoading = judges.isLoading || officials.isLoading || volunteers.isLoading;

  return (
    <div className="space-y-3">
      {rosterFailed && (
        <p className="text-sm text-destructive" role="alert">
          Some people could not be loaded, so this list may be missing names.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              if (judges.isError) void judges.refetch();
              if (officials.isError) void officials.refetch();
              volunteers.refetch();
            }}
          >
            Retry
          </button>
        </p>
      )}
      {rosterLoading && !rosterFailed && (
        <p className="text-sm text-muted-foreground">Loading the day's people...</p>
      )}
      {items.length === 0 && (rosterFailed || rosterLoading) ? null : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No one is assigned to this day yet. Use Add person to start the list.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map(item => (
            <LunchOrderRow
              key={item.key}
              item={item}
              onSave={saveItem}
              onRemove={async target => {
                if (target.savedId) await remove.mutateAsync(target.savedId);
              }}
            />
          ))}
        </ul>
      )}

      <form
        className="grid grid-cols-1 gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
        onSubmit={event => {
          event.preventDefault();
          void addPerson();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={`lunch-new-name-${trialId}`}>Add person</Label>
          <Input
            id={`lunch-new-name-${trialId}`}
            placeholder="Name"
            maxLength={LUNCH_NAME_MAX}
            value={newName}
            onChange={event => setNewName(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label id={`lunch-new-role-${trialId}`}>Role</Label>
          <Select value={newRole} onValueChange={value => setNewRole(value as LunchRole)}>
            <SelectTrigger aria-labelledby={`lunch-new-role-${trialId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LUNCH_ROLES.map(role => (
                <SelectItem key={role.id} value={role.id}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={newName.trim() === '' || save.isPending}>
          Add to list
        </Button>
        {addError && (
          <p className="text-xs text-destructive sm:col-span-3" role="alert">
            Could not add that person. Check your connection and try again.
          </p>
        )}
      </form>
    </div>
  );
}
