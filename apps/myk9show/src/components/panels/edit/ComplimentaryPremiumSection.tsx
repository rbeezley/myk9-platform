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

/** Overlap-rejection message thrown by admin_grant_entitlement() when an active grant already exists. */
const OVERLAP_ERROR_SNIPPET = 'overlapping active grant';

const grantHistoryQueryKey = (personId: string) =>
  ['entitlement', 'grantHistory', personId] as const;

/** Formats a Date as `YYYY-MM-DD` for a native date input's default value. */
function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface ComplimentaryPremiumSectionProps {
  personId: string;
  hasExhibitorProfile: boolean;
}

export const ComplimentaryPremiumSection: React.FC<ComplimentaryPremiumSectionProps> = ({
  personId,
  hasExhibitorProfile,
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

  const historyQuery = useQuery({
    queryKey: grantHistoryQueryKey(personId),
    queryFn: () => fetchGrantHistory(personId),
    enabled: hasExhibitorProfile,
  });

  const invalidateEntitlementQueries = () => {
    queryClient.invalidateQueries({ queryKey: grantHistoryQueryKey(personId) });
    queryClient.invalidateQueries({ queryKey: ['entitlement', 'context', personId] });
  };

  const grantMutation = useMutation({
    mutationFn: (replaceActive: boolean) =>
      grantEntitlement({
        personId,
        grantType: 'complimentary',
        startsAt: new Date().toISOString(),
        endsAt: new Date(endDate).toISOString(),
        reason: reason.trim(),
        replaceActive,
      }),
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

  if (!hasExhibitorProfile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Complimentary Premium
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This user has no exhibitor profile, so complimentary Premium cannot be granted.
          </p>
        </CardContent>
      </Card>
    );
  }

  const validate = (): string | null => {
    if (!endDate) return 'Please choose an expiration date';
    if (new Date(endDate).getTime() <= Date.now()) return 'Expiration must be in the future';
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
    <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
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
