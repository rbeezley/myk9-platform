import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, Loader2, Tag } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  usePromoCodesByTrialQuery,
  usePromoCodesByShowQuery,
  useCreatePromoCodeMutation,
  useDeletePromoCodeMutation,
} from '@/hooks/queries/usePromoCodeDatabase';
import { AddPromoCodeDialog } from './AddPromoCodeDialog';
import type { PromoCode, PromoCodeFormData, PromoCodeTarget } from '@/types/promo-codes';

/** Exactly one of showId or trialId must be provided */
type PromoCodesSectionProps =
  | { showId: string; trialId?: never }
  | { showId?: never; trialId: string };

const getStatusBadge = (promoCode: PromoCode) => {
  const isExpired = promoCode.expires_at && new Date(promoCode.expires_at) < new Date();
  const isExhausted =
    promoCode.usage_limit !== null && promoCode.usage_count >= promoCode.usage_limit;

  if (isExpired) return <Badge variant="secondary">Expired</Badge>;
  if (isExhausted) return <Badge variant="secondary">Exhausted</Badge>;
  return (
    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
      Active
    </Badge>
  );
};

const getScopeBadge = (promoCode: PromoCode) => {
  if (promoCode.show_id) {
    return (
      <Badge variant="outline" className="text-xs">
        Show-wide
      </Badge>
    );
  }
  return null;
};

const formatDiscount = (promoCode: PromoCode) => {
  if (promoCode.discount_type === 'percentage') {
    return `${promoCode.discount_value}%`;
  }
  return `$${promoCode.discount_value.toFixed(2)}`;
};

const formatUsage = (promoCode: PromoCode) => {
  if (promoCode.usage_limit === null) {
    return `${promoCode.usage_count} used`;
  }
  return `${promoCode.usage_count} / ${promoCode.usage_limit}`;
};

const formatExpiry = (promoCode: PromoCode) => {
  if (!promoCode.expires_at) return 'Never';
  return new Date(promoCode.expires_at).toLocaleDateString();
};

export const PromoCodesSection: React.FC<PromoCodesSectionProps> = ({ showId, trialId }) => {
  const isShowMode = !!showId;
  const { user } = useAuthContext();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PromoCode | null>(null);

  const showQuery = usePromoCodesByShowQuery(showId ?? '');
  const trialQuery = usePromoCodesByTrialQuery(trialId ?? '');

  const promoCodes = isShowMode ? (showQuery.data ?? []) : (trialQuery.data ?? []);
  const isLoading = isShowMode ? showQuery.isLoading : trialQuery.isLoading;

  const createMutation = useCreatePromoCodeMutation();
  const deleteMutation = useDeletePromoCodeMutation();

  const existingCodes = useMemo(() => promoCodes.map(pc => pc.code), [promoCodes]);

  const handleCreate = (form: PromoCodeFormData, target: PromoCodeTarget) => {
    if (!user?.id) return;
    createMutation.mutate(
      { form, target, createdBy: user.id },
      { onSuccess: () => setAddDialogOpen(false) }
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const deleteVars: { id: string; showId?: string; trialId?: string } = {
      id: deleteTarget.id,
    };
    if (deleteTarget.show_id) deleteVars.showId = deleteTarget.show_id;
    if (deleteTarget.trial_id) deleteVars.trialId = deleteTarget.trial_id;
    deleteMutation.mutate(deleteVars, { onSuccess: () => setDeleteTarget(null) });
  };

  const scopeLabel = isShowMode ? 'this show' : 'this trial';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Promo Codes</h3>
          <p className="text-sm text-muted-foreground">Manage discount codes for {scopeLabel}</p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Promo Code
        </Button>
      </div>

      {promoCodes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Tag className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No promo codes yet. Create one to offer discounts on entry fees.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {promoCodes.length} {promoCodes.length === 1 ? 'Code' : 'Codes'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  {isShowMode && <TableHead>Scope</TableHead>}
                  <TableHead>Discount</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {promoCodes.map(pc => (
                  <TableRow key={pc.id}>
                    <TableCell className="font-mono font-semibold">{pc.code}</TableCell>
                    {isShowMode && <TableCell>{getScopeBadge(pc)}</TableCell>}
                    <TableCell>{formatDiscount(pc)}</TableCell>
                    <TableCell>{formatUsage(pc)}</TableCell>
                    <TableCell>{formatExpiry(pc)}</TableCell>
                    <TableCell>{getStatusBadge(pc)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(pc)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AddPromoCodeDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSubmit={handleCreate}
        isLoading={createMutation.isPending}
        existingCodes={existingCodes}
        defaultTarget={showId ? { showId } : { trialId: trialId! }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Promo Code</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the code &ldquo;{deleteTarget?.code}&rdquo;? This
              cannot be undone. Entries that already used this code will keep their discount.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
