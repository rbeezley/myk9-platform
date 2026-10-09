import { useContext, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { judgeDayCapacityKey } from '@/hooks/queries/useJudgeDayCapacity';
import { classAvailabilityQueryKey } from '@/hooks/useClassAvailability';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import { setJudgeDayCapacity } from '@/services/database/judges/judgeDayCapacity';
import type { JudgeDayCapacity } from '@/types/waitlist-types';

export function JudgeDayCapacityEditor({ showId, day }: { showId: string; day: JudgeDayCapacity }) {
  const id = useId();
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const syncTable = useContext(ReplicationSyncContext)?.syncTable;
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const value = draft ?? String(day.capacity);
  const capacity = Number(value);
  const valid =
    value.trim() !== '' && Number.isInteger(capacity) && capacity > 0 && capacity <= 2147483647;
  const mutation = useMutation({
    mutationFn: (limit: number | null) =>
      setJudgeDayCapacity(showId, day.judgeId, day.showDate, limit),
    onSuccess: async () => {
      setDraft(null);
      // The figures remain the server's, including held spots and reserve.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: judgeDayCapacityKey(showId) }),
        queryClient.invalidateQueries({ queryKey: classAvailabilityQueryKey(showId) }),
      ]);
      // The write has succeeded even if a later replica pull cannot connect.
      void syncTable?.('judge_assignments').catch(() => undefined);
      setNotice('Entry limit saved.');
    },
  });
  const save = (limit: number | null) => {
    if (!isOnline || mutation.isPending) return;
    setNotice(null);
    mutation.mutate(limit);
  };
  return (
    <div className="space-y-2 border-t pt-3">
      <Label htmlFor={id}>Entry limit for this judge-day</Label>
      <Input
        id={id}
        type="number"
        min={1}
        max={2147483647}
        step={1}
        value={value}
        aria-label={`Entry limit for ${day.judgeName} on ${day.showDate}`}
        disabled={!isOnline || mutation.isPending}
        onChange={event => {
          setDraft(event.target.value);
          setNotice(null);
          mutation.reset();
        }}
      />
      <p className="text-sm text-muted-foreground">
        Applies to every class this judge has on this date.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!isOnline || !valid || mutation.isPending}
          onClick={() => save(capacity)}
        >
          {mutation.isPending ? 'Saving limit…' : 'Save limit'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!isOnline || mutation.isPending}
          onClick={() => save(null)}
        >
          Use show default
        </Button>
      </div>
      {!isOnline && (
        <p className="text-sm text-muted-foreground">Connect to change the entry limit.</p>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          We couldn’t save the entry limit. Please try again.
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}
