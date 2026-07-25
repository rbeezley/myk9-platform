import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/common/FormField';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Gift } from 'lucide-react';
import {
  grantEntitlement,
  revokeEntitlement,
  fetchGrantHistory,
} from '@/services/database/entitlement/admin';
import type { AdminGrantHistoryRow } from '@/services/database/entitlement/types';
import { notifications } from '@/lib/notifications';
import { ComplimentaryPremiumHistory } from './ComplimentaryPremiumHistory';
import { endOfLocalDay, toDateInputValue } from './complimentaryPremiumDates';

/** Overlap-rejection message thrown by admin_grant_entitlement() when an active grant already exists. */
const OVERLAP_ERROR_SNIPPET = 'overlapping active grant';

const grantHistoryQueryKey = (personId: string) =>
  ['entitlement', 'grantHistory', personId] as const;

interface ComplimentaryPremiumSectionProps {
  personId: string;
}

export const ComplimentaryPremiumSection: React.FC<ComplimentaryPremiumSectionProps> = ({
  personId,
}) => {
  const queryClient = useQueryClient();
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingOverlap, setPendingOverlap] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<AdminGrantHistoryRow | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Blocks a second submit from firing before the mutation's onSettled has
  // flipped `isPending` back — isPending lags by a render, the ref does not.
  const grantInFlight = useRef(false);
  const revokeInFlight = useRef(false);

  // Eligibility is the existence of an exhibitor_profiles row — NOT the
  // `exhibitor` role, which drifts from the profile in both directions. We
  // deliberately do NOT pre-check it from the client: `exhibitor_profiles_policy`
  // (migration 020) still grants admin read via `has_role('platform_admin')`, a
  // role migration 124 renamed to `site_admin` and deleted, so an admin's read of
  // another person's profile returns zero rows whether or not one exists — a
  // false "ineligible" is indistinguishable from a true one. admin_grant_entitlement()
  // is the authority (it rejects a target with no profile, SECURITY DEFINER, so it
  // sees the row); its message is surfaced on failure. See MYK9-87 for the policy fix.
  const historyQuery = useQuery({
    queryKey: grantHistoryQueryKey(personId),
    queryFn: () => fetchGrantHistory(personId),
  });

  const invalidateEntitlementQueries = () => {
    queryClient.invalidateQueries({ queryKey: grantHistoryQueryKey(personId) });
    queryClient.invalidateQueries({ queryKey: ['entitlement', 'context', personId] });
  };

  const grantMutation = useMutation({
    mutationFn: (replaceActive: boolean) => {
      // Access runs through the END of the selected local calendar day.
      const endsAt = endOfLocalDay(endDate);
      if (!endsAt) {
        return Promise.reject(new Error('Please choose a valid expiration date'));
      }
      return grantEntitlement({
        personId,
        grantType: 'complimentary',
        startsAt: new Date().toISOString(),
        endsAt: endsAt.toISOString(),
        reason: reason.trim(),
        replaceActive,
      });
    },
    onSuccess: () => {
      notifications.success('Complimentary Premium granted');
      setEndDate('');
      setReason('');
      setFormError(null);
      setPendingOverlap(false);
      invalidateEntitlementQueries();
    },
    onError: (error: Error) => {
      if (error.message.includes(OVERLAP_ERROR_SNIPPET)) {
        setPendingOverlap(true);
        setFormError(error.message);
        return;
      }
      setFormError(error.message);
      notifications.error('Failed to grant complimentary Premium');
    },
    onSettled: () => {
      grantInFlight.current = false;
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({ grantId, reason: r }: { grantId: string; reason: string }) =>
      revokeEntitlement(grantId, r),
    onSuccess: () => {
      notifications.success('Grant revoked');
      setRevokeTarget(null);
      setRevokeReason('');
      setRevokeError(null);
      invalidateEntitlementQueries();
    },
    onError: (error: Error) => {
      setRevokeError(error.message);
      notifications.error('Failed to revoke grant');
    },
    onSettled: () => {
      revokeInFlight.current = false;
    },
  });

  const validate = (): string | null => {
    if (!endDate) return 'Please choose an expiration date';
    const endsAt = endOfLocalDay(endDate);
    if (!endsAt) return 'Please choose a valid expiration date';
    if (endsAt.getTime() <= Date.now()) return 'Expiration must be in the future';
    if (!reason.trim()) return 'Please enter a reason';
    return null;
  };

  const submitGrant = (replaceActive: boolean) => {
    if (grantInFlight.current || grantMutation.isPending) return;
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    grantInFlight.current = true;
    grantMutation.mutate(replaceActive);
  };

  const handleRevokeConfirm = () => {
    if (!revokeTarget) return;
    if (revokeInFlight.current || revokeMutation.isPending) return;
    if (!revokeReason.trim()) {
      setRevokeError('Please enter a reason');
      return;
    }
    setRevokeError(null);
    revokeInFlight.current = true;
    revokeMutation.mutate({ grantId: revokeTarget.id, reason: revokeReason.trim() });
  };

  return (
    <Card
      data-testid="complimentary-premium-section"
      className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5" />
          Complimentary Premium
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Expiration date" fieldId="grant-end-date" required>
            <Input
              id="grant-end-date"
              type="date"
              min={toDateInputValue(new Date())}
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setPendingOverlap(false);
              }}
            />
          </FormField>
          <FormField label="Reason" fieldId="grant-reason" required>
            <Textarea
              id="grant-reason"
              value={reason}
              onChange={e => {
                setReason(e.target.value);
                setPendingOverlap(false);
              }}
              placeholder="Why is this user receiving complimentary Premium?"
            />
          </FormField>
        </div>

        {formError && !pendingOverlap && (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}

        {pendingOverlap && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
            <p className="text-sm text-muted-foreground">
              This user already has an active grant. Replacing it will mark the current grant as
              superseded — it will stay in history, but this new grant becomes authoritative.
            </p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={grantMutation.isPending}
              onClick={() => submitGrant(true)}
            >
              Replace active grant
            </Button>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            className="gap-2"
            disabled={grantMutation.isPending}
            onClick={() => submitGrant(false)}
          >
            <Gift className="h-4 w-4" />
            {grantMutation.isPending ? 'Granting…' : 'Grant Complimentary Premium'}
          </Button>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium">Grant history</h4>
          {historyQuery.isError ? (
            // Never render the empty state for a FAILED fetch — an admin would
            // read "no history" as truth and re-grant over an existing grant.
            <div className="space-y-2">
              <p className="text-sm text-destructive" role="alert">
                Could not load grant history. This user may still have grants — nothing was changed.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => historyQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <ComplimentaryPremiumHistory
              rows={historyQuery.data ?? []}
              isLoading={historyQuery.isLoading}
              onRevoke={row => {
                setRevokeTarget(row);
                setRevokeReason('');
                setRevokeError(null);
              }}
              revokeDisabled={revokeMutation.isPending}
            />
          )}
        </div>
      </CardContent>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={open => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke complimentary Premium?</AlertDialogTitle>
            <AlertDialogDescription>
              This ends the user&apos;s access from this grant immediately. The grant stays in
              history as revoked with the reason you provide.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormField label="Revocation reason" fieldId="revoke-reason" required>
            <Textarea
              id="revoke-reason"
              value={revokeReason}
              onChange={e => setRevokeReason(e.target.value)}
              placeholder="Why is this grant being revoked?"
            />
          </FormField>
          {revokeError && (
            <p className="text-sm text-destructive" role="alert">
              {revokeError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={revokeMutation.isPending || !revokeReason.trim()}
              onClick={e => {
                e.preventDefault();
                handleRevokeConfirm();
              }}
            >
              {revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default ComplimentaryPremiumSection;
