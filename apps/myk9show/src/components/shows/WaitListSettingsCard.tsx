/**
 * WaitListSettingsCard
 *
 * Configures wait list capacity and mail-in reservation strategy for a show,
 * and whether open spots are offered automatically (MYK9-1003).
 * NOTE: The columns read/written here are added by migration 114 but the
 * Supabase generated types do not know about them yet. Cast via ShowCapacityRow.
 */

import { useState, useEffect, useRef } from 'react';
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
import type { WaitListShowConfig, MailInStrategy } from '@/types/waitlist-types';
import type { TablesUpdate } from '@/types/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShowCapacityRow {
  default_judge_day_capacity: number | null;
  mail_in_strategy: MailInStrategy | null;
  mail_in_value: number | null;
  mail_in_deadline: string | null;
  mail_in_auto_release: boolean | null;
  mail_in_release_date: string | null;
  waitlist_payment_deadline_hours: number | null;
  waitlist_auto_offer: boolean | null;
}

interface WaitListSettings {
  config: WaitListShowConfig;
  /** shows.waitlist_auto_offer; the database default (true) is today's behaviour. */
  autoOffer: boolean;
}

interface WaitListSettingsCardProps {
  showId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToConfig(row: ShowCapacityRow): WaitListShowConfig {
  return {
    defaultJudgeDayCapacity: row.default_judge_day_capacity ?? 125,
    mailInStrategy: row.mail_in_strategy ?? 'none',
    mailInValue: row.mail_in_value,
    mailInDeadline: row.mail_in_deadline,
    mailInAutoRelease: row.mail_in_auto_release ?? false,
    mailInReleaseDate: row.mail_in_release_date,
    waitlistPaymentDeadlineHours: row.waitlist_payment_deadline_hours ?? 48,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WaitListSettingsCard({ showId }: WaitListSettingsCardProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['waitlist-settings', showId],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from('shows')
        .select(
          'default_judge_day_capacity, mail_in_strategy, mail_in_value, mail_in_deadline, mail_in_auto_release, mail_in_release_date, waitlist_payment_deadline_hours, waitlist_auto_offer'
        )
        .eq('id', showId)
        .single();

      if (error) throw error;
      const capacityRow = row as unknown as ShowCapacityRow;
      return {
        config: rowToConfig(capacityRow),
        autoOffer: capacityRow.waitlist_auto_offer ?? true,
      } satisfies WaitListSettings;
    },
  });

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

  // The automatic-offer switch saves on its own, and only its own column: it
  // is a mode, not a form field, and must never carry (or wait on) the
  // capacity edits below. `pendingAutoOffer` shows the new position while the
  // save is in flight; a failed save falls back to the stored value.
  const [pendingAutoOffer, setPendingAutoOffer] = useState<boolean | null>(null);
  const autoOfferMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('shows')
        .update({ waitlist_auto_offer: enabled })
        .eq('id', showId);
      if (error) throw error;
    },
    onMutate: enabled => setPendingAutoOffer(enabled),
    // Write the saved value into the cache before dropping the pending one, so
    // the switch never flickers back to the old position while a refetch runs.
    onSuccess: (_result, enabled) =>
      queryClient.setQueryData<WaitListSettings>(['waitlist-settings', showId], current =>
        current ? { ...current, autoOffer: enabled } : current
      ),
    onSettled: () => setPendingAutoOffer(null),
  });
  const autoOffer = pendingAutoOffer ?? data?.autoOffer ?? true;

  const mutation = useMutation({
    mutationFn: async (config: WaitListShowConfig) => {
      const payload: TablesUpdate<'shows'> = {
        default_judge_day_capacity: config.defaultJudgeDayCapacity,
        mail_in_strategy: config.mailInStrategy,
        mail_in_value: config.mailInValue,
        mail_in_deadline: config.mailInDeadline,
        mail_in_auto_release: config.mailInAutoRelease,
        mail_in_release_date: config.mailInReleaseDate,
        waitlist_payment_deadline_hours: config.waitlistPaymentDeadlineHours,
      };
      const { error } = await supabase.from('shows').update(payload).eq('id', showId);
      if (error) throw error;
    },
    onSuccess: () => {
      isDirty.current = false;
      queryClient.invalidateQueries({ queryKey: ['waitlist-settings', showId] });
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
          Choose how open spots are offered, and set judge daily capacity and mail-in rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Automatic offers (MYK9-1003) */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Switch
              id="auto-offer"
              aria-describedby="auto-offer-help"
              checked={autoOffer}
              disabled={isLoading || autoOfferMutation.isPending}
              onCheckedChange={checked => autoOfferMutation.mutate(checked)}
            />
            <Label htmlFor="auto-offer">Offer open spots automatically</Label>
          </div>
          <p className="text-sm text-muted-foreground" id="auto-offer-help">
            {autoOffer
              ? 'When a spot opens, the next dog in line is offered it within 15 minutes, and you get a notification each time.'
              : 'You offer every open spot yourself, from the queue below.'}
          </p>
          {autoOfferMutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              Couldn't save that change. Check your connection and try again.
            </p>
          )}
        </div>

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
            value={form.mailInStrategy}
            onValueChange={value => updateForm({ mailInStrategy: value as MailInStrategy })}
          >
            <SelectTrigger id="mail-in-strategy">
              <SelectValue placeholder="Select strategy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="fixed">Fixed Count</SelectItem>
              <SelectItem value="percentage">Percentage</SelectItem>
              <SelectItem value="deadline">Deadline</SelectItem>
            </SelectContent>
          </Select>
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

        {/* Conditional: deadline */}
        {strategy === 'deadline' && (
          <div className="space-y-1">
            <Label htmlFor="mail-in-deadline">Mail-In Deadline</Label>
            <Input
              id="mail-in-deadline"
              type="date"
              value={form.mailInDeadline ?? ''}
              onChange={e => updateForm({ mailInDeadline: e.target.value || null })}
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
