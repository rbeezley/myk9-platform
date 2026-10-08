/**
 * WaitListSettingsCard
 *
 * Configures whether the show takes wait lists at all (MYK9-1019), whether open
 * spots are offered automatically (MYK9-1003), and wait list capacity and the
 * mail-in reservation strategy.
 * The read lives in `waitListSettingsQuery.ts`, shared with the offer dialog.
 */

import { useState, useEffect, useRef, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { judgeDayCapacityKey } from '@/hooks/queries/useJudgeDayCapacity';
import { classAvailabilityQueryKey } from '@/hooks/useClassAvailability';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import type { WaitListShowConfig, MailInStrategy } from '@/types/waitlist-types';
import type { TablesUpdate } from '@/types/supabase';
import { waitListSettingsQueryOptions } from './waitListSettingsQuery';
import { useWaitListSwitch, waitListSettingsKey, type WaitListSwitch } from './useWaitListSwitch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WaitListSettingsCardProps {
  showId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** One self-saving switch, with what its position means and a calm failure line. */
function SettingSwitch({
  id,
  label,
  help,
  control,
  disabled,
}: {
  id: string;
  label: string;
  help: string;
  control: WaitListSwitch;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <Switch
          id={id}
          aria-describedby={`${id}-help`}
          checked={control.checked}
          disabled={disabled || control.isPending}
          onCheckedChange={checked => control.save(checked)}
        />
        {/* The label is the switch's 44px target (docs/INTENT.md § Accessibility First). */}
        <Label htmlFor={id} className="flex min-h-11 items-center">
          {label}
        </Label>
      </div>
      <p className="text-sm text-muted-foreground" id={`${id}-help`}>
        {help}
      </p>
      {control.isError && (
        <p className="text-sm text-destructive" role="alert">
          Couldn't save that change. Check your connection and try again.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WaitListSettingsCard({ showId }: WaitListSettingsCardProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(waitListSettingsQueryOptions(showId));

  const [form, setForm] = useState<WaitListShowConfig>({
    defaultJudgeDayCapacity: 125,
    mailInStrategy: 'none',
    mailInValue: null,
    mailInDeadline: null,
    mailInAutoRelease: false,
    mailInReleaseDate: null,
    waitlistPaymentDeadlineHours: 48,
  });
  const isDirty = useRef(false);

  // Sync remote data into form only on initial load — never overwrite in-progress edits
  useEffect(() => {
    if (data && !isDirty.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(data.config);
    }
  }, [data]);

  // Optional: the provider wraps the app; a test without it simply skips the pull.
  const syncTable = useContext(ReplicationSyncContext)?.syncTable;
  const allowWaitlists = useWaitListSwitch(
    showId,
    'allowWaitlists',
    data?.allowWaitlists,
    false,
    () => {
      // Every class without its own setting changed with it: the wizard's and
      // the cart's Full / wait-list reads, and the show row Edit class reads
      // the inherited value from.
      void queryClient.invalidateQueries({ queryKey: classAvailabilityQueryKey(showId) });
      void syncTable?.('shows');
    }
  );
  const autoOffer = useWaitListSwitch(showId, 'autoOffer', data?.autoOffer, true);

  const mutation = useMutation({
    mutationFn: async (config: WaitListShowConfig) => {
      const payload: TablesUpdate<'shows'> = {
        default_judge_day_capacity: config.defaultJudgeDayCapacity,
        mail_in_strategy: config.mailInStrategy === 'deadline' ? 'none' : config.mailInStrategy,
        mail_in_value: config.mailInValue,
        mail_in_deadline: null,
        mail_in_auto_release: config.mailInAutoRelease,
        mail_in_release_date: config.mailInReleaseDate,
        waitlist_payment_deadline_hours: config.waitlistPaymentDeadlineHours,
      };
      const { error } = await supabase.from('shows').update(payload).eq('id', showId);
      if (error) throw error;
    },
    onSuccess: () => {
      isDirty.current = false;
      queryClient.invalidateQueries({ queryKey: waitListSettingsKey(showId) });
      // The Waitlist tab's Full / spots-available cards are computed from these settings.
      queryClient.invalidateQueries({ queryKey: judgeDayCapacityKey(showId) });
    },
  });

  function updateForm(update: Partial<WaitListShowConfig>) {
    isDirty.current = true;
    setForm(f => ({ ...f, ...update }));
  }

  function handleSave() {
    mutation.mutate(form);
  }

  const strategy = form.mailInStrategy;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wait List Settings</CardTitle>
        <CardDescription>
          Choose whether full classes take a wait list and how open spots are offered, and set judge
          daily capacity and mail-in rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* The show-wide wait list switch (MYK9-1019) */}
        <SettingSwitch
          id="allow-waitlists"
          label="Allow wait lists"
          help={
            allowWaitlists.checked
              ? "When a class or a judge's day is full, new entries join the wait list. A class set on its own in Edit class keeps its own setting."
              : "When a class or a judge's day is full, new entries are turned away. A class set on its own in Edit class keeps its own setting."
          }
          control={allowWaitlists}
          disabled={isLoading}
        />

        {/* Automatic offers (MYK9-1003) */}
        <SettingSwitch
          id="auto-offer"
          label="Offer open spots automatically"
          help={
            autoOffer.checked
              ? 'When a spot opens, the next dog in line is offered it within 15 minutes, and you get a notification each time.'
              : 'You offer every open spot yourself, from the queue below.'
          }
          control={autoOffer}
          disabled={isLoading}
        />

        {/* Judge Daily Capacity */}
        <div className="space-y-1">
          <Label htmlFor="judge-daily-capacity">Judge Daily Capacity</Label>
          <Input
            id="judge-daily-capacity"
            type="number"
            min={1}
            value={isLoading ? '' : form.defaultJudgeDayCapacity}
            placeholder="125"
            onChange={e => updateForm({ defaultJudgeDayCapacity: Number(e.target.value) })}
          />
        </div>

        {/* Mail-In Strategy */}
        <div className="space-y-1">
          <Label htmlFor="mail-in-strategy">Mail-In Reservation Strategy</Label>
          <Select
            value={strategy === 'deadline' ? 'none' : strategy}
            onValueChange={value => updateForm({ mailInStrategy: value as MailInStrategy })}
          >
            <SelectTrigger id="mail-in-strategy">
              <SelectValue placeholder="Select strategy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="fixed">Fixed Count</SelectItem>
              <SelectItem value="percentage">Percentage</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {strategy === 'fixed'
              ? 'Hold this many spots per judge day for mail-in entries. Online entries cannot use them.'
              : strategy === 'percentage'
                ? 'Hold this percentage of each judge day’s capacity for mail-in entries, rounded down. Online entries cannot use them.'
                : 'No spots are reserved for mail-in entries.'}
          </p>
          {strategy === 'deadline' && (
            <p className="text-sm text-muted-foreground">
              Deadline reservations did not hold any spots. Choose Fixed Count or Percentage to
              reserve spots, or save None to clear the old setting.
            </p>
          )}
        </div>

        {/* Conditional: fixed */}
        {strategy === 'fixed' && (
          <div className="space-y-1">
            <Label htmlFor="reserved-spots">Reserved Spots</Label>
            <Input
              id="reserved-spots"
              type="number"
              min={0}
              value={form.mailInValue ?? ''}
              placeholder="0"
              onChange={e =>
                updateForm({ mailInValue: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
        )}

        {/* Conditional: percentage */}
        {strategy === 'percentage' && (
          <div className="space-y-1">
            <Label htmlFor="reserved-percentage">Reserved Percentage</Label>
            <Input
              id="reserved-percentage"
              type="number"
              min={0}
              max={100}
              value={form.mailInValue ?? ''}
              placeholder="0"
              onChange={e =>
                updateForm({ mailInValue: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
        )}

        {/* Auto-release */}
        <div className="flex items-center gap-3">
          <Switch
            id="auto-release"
            checked={form.mailInAutoRelease}
            onCheckedChange={checked => updateForm({ mailInAutoRelease: checked })}
          />
          <Label htmlFor="auto-release">Auto-release unused spots</Label>
        </div>

        {form.mailInAutoRelease && (
          <div className="space-y-1">
            <Label htmlFor="release-date">Release Date</Label>
            <Input
              id="release-date"
              type="date"
              value={form.mailInReleaseDate ?? ''}
              onChange={e => updateForm({ mailInReleaseDate: e.target.value || null })}
            />
          </div>
        )}

        {/* Payment deadline */}
        <div className="space-y-1">
          <Label htmlFor="payment-deadline-hours">Payment Deadline (hours)</Label>
          <Input
            id="payment-deadline-hours"
            type="number"
            min={1}
            value={form.waitlistPaymentDeadlineHours}
            placeholder="48"
            onChange={e => updateForm({ waitlistPaymentDeadlineHours: Number(e.target.value) })}
          />
        </div>

        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}
