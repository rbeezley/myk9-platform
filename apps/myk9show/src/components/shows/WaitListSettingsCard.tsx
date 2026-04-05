/**
 * WaitListSettingsCard
 *
 * Configures wait list capacity and mail-in reservation strategy for a show.
 * NOTE: The columns read/written here are added by migration 114 but the
 * Supabase generated types do not know about them yet. Cast via ShowCapacityRow.
 */

import { useState, useEffect } from 'react';
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
import type { WaitListShowConfig, MailInStrategy } from '@/types/waitlist-types';

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
          'default_judge_day_capacity, mail_in_strategy, mail_in_value, mail_in_deadline, mail_in_auto_release, mail_in_release_date, waitlist_payment_deadline_hours'
        )
        .eq('id', showId)
        .single();

      if (error) throw error;
      return rowToConfig(row as unknown as ShowCapacityRow);
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

  // Sync remote data into local form state whenever the query resolves
  useEffect(() => {
    if (data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(data);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (config: WaitListShowConfig) => {
      const payload: Record<string, unknown> = {
        default_judge_day_capacity: config.defaultJudgeDayCapacity,
        mail_in_strategy: config.mailInStrategy,
        mail_in_value: config.mailInValue,
        mail_in_deadline: config.mailInDeadline,
        mail_in_auto_release: config.mailInAutoRelease,
        mail_in_release_date: config.mailInReleaseDate,
        waitlist_payment_deadline_hours: config.waitlistPaymentDeadlineHours,
      };
      const { error } = await supabase
        .from('shows')
        .update(payload as Record<string, unknown>)
        .eq('id', showId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist-settings', showId] });
    },
  });

  function handleSave() {
    mutation.mutate(form);
  }

  const strategy = form.mailInStrategy;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wait List Settings</CardTitle>
        <CardDescription>
          Configure judge daily capacity and mail-in reservation rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Judge Daily Capacity */}
        <div className="space-y-1">
          <Label htmlFor="judge-daily-capacity">Judge Daily Capacity</Label>
          <Input
            id="judge-daily-capacity"
            type="number"
            min={1}
            value={isLoading ? '' : form.defaultJudgeDayCapacity}
            placeholder="125"
            onChange={e =>
              setForm(f => ({ ...f, defaultJudgeDayCapacity: Number(e.target.value) }))
            }
          />
        </div>

        {/* Mail-In Strategy */}
        <div className="space-y-1">
          <Label htmlFor="mail-in-strategy">Mail-In Reservation Strategy</Label>
          <Select
            value={form.mailInStrategy}
            onValueChange={value =>
              setForm(f => ({ ...f, mailInStrategy: value as MailInStrategy }))
            }
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
                setForm(f => ({
                  ...f,
                  mailInValue: e.target.value ? Number(e.target.value) : null,
                }))
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
                setForm(f => ({
                  ...f,
                  mailInValue: e.target.value ? Number(e.target.value) : null,
                }))
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
              onChange={e => setForm(f => ({ ...f, mailInDeadline: e.target.value || null }))}
            />
          </div>
        )}

        {/* Auto-release */}
        <div className="flex items-center gap-3">
          <Switch
            id="auto-release"
            checked={form.mailInAutoRelease}
            onCheckedChange={checked => setForm(f => ({ ...f, mailInAutoRelease: checked }))}
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
              onChange={e => setForm(f => ({ ...f, mailInReleaseDate: e.target.value || null }))}
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
            onChange={e =>
              setForm(f => ({ ...f, waitlistPaymentDeadlineHours: Number(e.target.value) }))
            }
          />
        </div>

        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}
