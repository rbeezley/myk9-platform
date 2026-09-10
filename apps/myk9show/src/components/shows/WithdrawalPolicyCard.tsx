/**
 * WithdrawalPolicyCard
 *
 * Declares a club's withdrawal refund policy. One component, two scopes:
 *  - scope="club"  → writes clubs.default_withdrawal_*  (the default every show inherits)
 *  - scope="show"  → writes shows.withdrawal_*          (an optional per-show override)
 *
 * Lightly structured (cutoff + retention + prose escape hatch) — the system
 * INFORMS, it does not compute a refund. See docs/plan-refund-policy-withdrawal.md.
 *
 * The cutoff date is SHOW-ONLY (MYK9-454). It is an absolute calendar date,
 * meaningful only against one show's entry-close date; as a club-wide default it
 * governed every future show, and the day after it passed every inheriting show
 * resolved `after_cutoff` and kept the office fee with `requiresManual: false`.
 * Clubs declare retention + prose; each show declares its own date.
 *
 * Flat retention is entered in DOLLARS but stored in CENTS (the unit the refund
 * helper subtracts from entryFeeCents). Percent is a whole number 0–100.
 */

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import type { RetentionType } from '@/features/payments/withdrawalPolicy';

type Scope = 'club' | 'show';

interface ColumnSet {
  table: 'clubs' | 'shows';
  /** Absent at club scope — see MYK9-454 in the header comment. */
  cutoff?: string;
  type: string;
  value: string;
  notes: string;
}

const COLUMNS: Record<Scope, ColumnSet> = {
  club: {
    table: 'clubs',
    type: 'default_withdrawal_retention_type',
    value: 'default_withdrawal_retention_value',
    notes: 'default_withdrawal_policy_notes',
  },
  show: {
    table: 'shows',
    cutoff: 'withdrawal_cutoff_date',
    type: 'withdrawal_retention_type',
    value: 'withdrawal_retention_value',
    notes: 'withdrawal_policy_notes',
  },
};

interface FormState {
  cutoffDate: string; // '' or 'YYYY-MM-DD'
  retentionType: RetentionType;
  /** Display units: dollars when flat, whole percent when percent. '' = none. */
  retentionInput: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  cutoffDate: '',
  retentionType: 'flat',
  retentionInput: '',
  notes: '',
};

interface PolicyRow {
  cutoff: string | null;
  type: string | null;
  value: number | null;
  notes: string | null;
}

function rowToForm(row: PolicyRow): FormState {
  const retentionType: RetentionType = row.type === 'percent' ? 'percent' : 'flat';
  let retentionInput = '';
  if (row.value !== null && row.value !== undefined) {
    retentionInput = retentionType === 'flat' ? (row.value / 100).toFixed(2) : String(row.value);
  }
  return {
    cutoffDate: row.cutoff ?? '',
    retentionType,
    retentionInput,
    notes: row.notes ?? '',
  };
}

/**
 * Display input → stored integer (cents for flat, whole percent for percent).
 *
 * Exported for direct testing: `<input type="number">` will not carry a
 * non-finite literal through jsdom, so the component cannot exercise the
 * Number.isFinite guard end to end.
 */
export function inputToStored(type: RetentionType, input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  // NaN AND non-finite: <input type="number"> accepts '1e999', which becomes
  // Infinity, serializes to JSON null, and lands as {type:'flat', value:null}
  // — a row that reads as a DECLARED retention and so suppresses the club fee.
  if (!Number.isFinite(parsed)) return null;
  return type === 'flat' ? Math.round(parsed * 100) : Math.round(parsed);
}

interface WithdrawalPolicyCardProps {
  scope: Scope;
  entityId: string;
}

export function WithdrawalPolicyCard({ scope, entityId }: WithdrawalPolicyCardProps) {
  const queryClient = useQueryClient();
  const cols = COLUMNS[scope];

  const { data, isLoading, isError } = useQuery({
    queryKey: ['withdrawal-policy', scope, entityId],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from(cols.table)
        .select([cols.cutoff, cols.type, cols.value, cols.notes].filter(Boolean).join(', '))
        .eq('id', entityId)
        .single();
      if (error) throw error;
      // A runtime (non-literal) select string defeats supabase-js's typed-row
      // inference, so route the cast through unknown.
      const r = row as unknown as Record<string, unknown>;
      return rowToForm({
        cutoff: cols.cutoff ? ((r[cols.cutoff] as string | null) ?? null) : null,
        type: (r[cols.type] as string | null) ?? null,
        value: (r[cols.value] as number | null) ?? null,
        notes: (r[cols.notes] as string | null) ?? null,
      });
    },
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const isDirty = useRef(false);

  // Sync remote data into the form only on initial load — never clobber edits.
  useEffect(() => {
    if (data && !isDirty.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(data);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (next: FormState) => {
      const storedValue = inputToStored(next.retentionType, next.retentionInput);
      const payload: Record<string, unknown> = {
        ...(cols.cutoff ? { [cols.cutoff]: next.cutoffDate || null } : {}),
        // Retention type/value only mean something together; null them as a pair.
        [cols.type]: storedValue === null ? null : next.retentionType,
        [cols.value]: storedValue,
        [cols.notes]: next.notes.trim() || null,
      };
      const { error } = await supabase
        .from(cols.table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(payload as any)
        .eq('id', entityId);
      if (error) throw error;
    },
    onSuccess: () => {
      isDirty.current = false;
      queryClient.invalidateQueries({ queryKey: ['withdrawal-policy', scope, entityId] });
    },
  });

  function updateForm(update: Partial<FormState>) {
    isDirty.current = true;
    setForm(f => ({ ...f, ...update }));
  }

  const isShow = scope === 'show';
  const retentionUnitLabel = form.retentionType === 'flat' ? 'Amount kept (USD)' : 'Percent kept';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Withdrawal Refund Policy</CardTitle>
        <CardDescription>
          {isShow
            ? 'Override this show’s withdrawal refund policy. Leave blank to inherit the club default.'
            : 'Default withdrawal refund policy for all of this club’s shows. A show can override it.'}{' '}
          Shown to exhibitors before they pay.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Refund cutoff — show scope only (MYK9-454) */}
        {isShow && (
          <div className="space-y-1">
            <Label htmlFor="withdrawal-cutoff">Full-refund cutoff date</Label>
            <Input
              id="withdrawal-cutoff"
              type="date"
              value={isLoading ? '' : form.cutoffDate}
              onChange={e => updateForm({ cutoffDate: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Full refund on or before this date (show’s timezone). After it, the retention below
              applies unless the policy notes describe a different refund schedule. Leave blank to
              use the policy notes only.
            </p>
          </div>
        )}

        {/* Retention type */}
        <div className="space-y-1">
          <Label htmlFor="withdrawal-retention-type">
            {isShow ? 'After the cutoff, keep' : 'After a show’s cutoff, keep'}
          </Label>
          <Select
            value={form.retentionType}
            onValueChange={value => updateForm({ retentionType: value as RetentionType })}
          >
            <SelectTrigger id="withdrawal-retention-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flat">A flat office fee (USD)</SelectItem>
              <SelectItem value="percent">A percentage of the entry fee</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Retention value */}
        <div className="space-y-1">
          <Label htmlFor="withdrawal-retention-value">{retentionUnitLabel}</Label>
          <Input
            id="withdrawal-retention-value"
            type="number"
            min={0}
            max={form.retentionType === 'percent' ? 100 : undefined}
            step={form.retentionType === 'flat' ? '0.01' : '1'}
            value={form.retentionInput}
            placeholder={form.retentionType === 'flat' ? '10.00' : '0'}
            onChange={e => updateForm({ retentionInput: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            {isShow
              ? 'Leave blank to inherit the club default; if none is set, withdrawals need manual review. Enter 0 for a full refund even after the cutoff.'
              : 'Applies once a show sets its own full-refund cutoff date. Leave blank for manual review.'}
          </p>
        </div>

        {/* Prose escape hatch */}
        <div className="space-y-1">
          <Label htmlFor="withdrawal-notes">Policy notes (optional)</Label>
          <Textarea
            id="withdrawal-notes"
            rows={3}
            value={form.notes}
            placeholder="e.g. Full refund until closing, then 50% until 7 days out, none after."
            onChange={e => updateForm({ notes: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            For multi-tier or unusual policies. Service fees are always non-refundable on a
            voluntary withdrawal.
            {!isShow &&
              ' Applies to shows that set no policy of their own; a show that sets one states its own notes.'}
          </p>
        </div>

        {/*
          The form starts as EMPTY_FORM, so saving before the row arrives writes
          nulls over a declared policy — and every show under the club now
          inherits that retention, so one stray wipe rewrites several shows'
          refund basis.

          `isLoading` alone does NOT cover this: react-query derives it as
          `isPending && isFetching`, which is false once a load ERRORS and false
          while a fetch is PAUSED offline (the app sets networkMode 'online').
          Both leave a blank, editable form. `isError` and `!data` close those.
        */}
        {isError && (
          <p className="text-sm text-destructive" role="alert">
            Could not load the current policy. Reload before editing — saving now would overwrite
            it.
          </p>
        )}
        <Button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending || isLoading || isError || !data}
        >
          {mutation.isPending ? 'Saving…' : 'Save policy'}
        </Button>
      </CardContent>
    </Card>
  );
}
