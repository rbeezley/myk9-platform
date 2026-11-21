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
 *
 * MYK9-1976: the card also holds the policy TEXT exhibitors read (the show's, else the
 * club's, else a default built from these fields and the show's registry). The text is words
 * only; the suggested refund still follows the structured fields, and the card says so when
 * the two could disagree. Data and payload live in `withdrawalPolicyCardData.ts`.
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
import type { RetentionType } from '@/features/payments/withdrawalPolicy';
import { describeWithdrawalPolicyTextConflict } from '@/features/payments/withdrawalPolicyText';
import { WithdrawalPolicyTextField } from './WithdrawalPolicyTextField';
import {
  EMPTY_FORM,
  buildPayload,
  inheritedText,
  loadPolicy,
  policyFromForm,
  savePolicy,
  type FormState,
  type Scope,
} from './withdrawalPolicyCardData';

interface WithdrawalPolicyCardProps {
  scope: Scope;
  entityId: string;
}

export function WithdrawalPolicyCard({ scope, entityId }: WithdrawalPolicyCardProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['withdrawal-policy', scope, entityId],
    queryFn: () => loadPolicy(scope, entityId),
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const isDirty = useRef(false);

  // Sync remote data into the form only on initial load — never clobber edits.
  useEffect(() => {
    if (data && !isDirty.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(data.form);
    }
  }, [data]);

  const inheritance = data?.inheritance ?? null;

  const mutation = useMutation({
    mutationFn: (next: FormState) => savePolicy(entityId, buildPayload(scope, next, inheritance)),
    onSuccess: () => {
      isDirty.current = false;
      // Every reader of the policy: this card, the About summary, the checkout disclosure
      // and the Pull or withdraw dialogs. A club save changes every show that inherits.
      queryClient.invalidateQueries({ queryKey: ['withdrawal-policy'] });
      queryClient.invalidateQueries({ queryKey: ['effective-withdrawal-policy'] });
    },
  });

  function updateForm(update: Partial<FormState>) {
    isDirty.current = true;
    setForm(f => ({ ...f, ...update }));
  }

  const isShow = scope === 'show';
  const inherited = inheritedText(scope, form, inheritance);
  const ownText = form.textCustom ? form.text : null;
  // Only words the club wrote can disagree with the fields; the default is built from them.
  const appliedWrittenText = ownText ?? (inherited.source === 'club' ? inherited.text : null);
  const conflictNote = describeWithdrawalPolicyTextConflict(
    appliedWrittenText,
    policyFromForm(scope, form, inheritance),
    inheritance?.entryFeeCents ?? null
  );
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

        <WithdrawalPolicyTextField
          isShow={isShow}
          ownText={ownText}
          inherited={inherited}
          conflictNote={conflictNote}
          disabled={isLoading || isError || !data}
          onChange={text => updateForm({ text, textCustom: true })}
          onReset={() => updateForm({ text: '', textCustom: false })}
        />

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
            We could not load the current policy. Restart the app before editing, or saving now
            would overwrite it.
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
