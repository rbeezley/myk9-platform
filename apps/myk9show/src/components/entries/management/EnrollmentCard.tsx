import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EntryListCard } from './EntryListCard';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';
import { EntryStatus } from '@/types/show-registration-types';

interface EnrollmentCardProps {
  group: EnrollmentGroup;
  onStatusChange: (entryId: string, status: EntryStatus) => void;
  onOpenCheckInDialog: (entry: EntryManagementEntry, classEntry: EntryClass) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onCompEntry?: (entryId: string) => void;
  onUncompEntry?: (entryId: string) => void;
  selectedEntries: Set<string>;
  onSelectEntry: (entryId: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
}

const PAYMENT_BADGE: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  paid: { label: 'Paid', variant: 'default' },
  pending: { label: 'Payment Due', variant: 'destructive' },
  refunded: { label: 'Refunded', variant: 'secondary' },
  waived: { label: 'Waived', variant: 'outline' },
  paid_online: { label: 'Paid', variant: 'default' },
  paid_by_check: { label: 'Paid by Check', variant: 'default' },
  paid_by_cash: { label: 'Paid by Cash', variant: 'default' },
  partial_refund: { label: 'Partial Refund', variant: 'secondary' },
};

export const EnrollmentCard: React.FC<EnrollmentCardProps> = ({
  group,
  onStatusChange,
  onOpenCheckInDialog,
  onOpenArmbandDialog,
  onCompEntry,
  onUncompEntry,
  selectedEntries,
  onSelectEntry,
  onSelectAll,
}) => {
  const [expanded, setExpanded] = useState(true);

  const paymentBadge = PAYMENT_BADGE[group.paymentStatus] ?? {
    label: group.paymentStatus,
    variant: 'outline' as const,
  };

  const dollars = group.totalAmountUnit === 'cents' ? group.totalAmount / 100 : group.totalAmount;
  const displayTotal = `$${dollars.toFixed(2)}`;

  return (
    <Card className="border border-border/60">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <span className="font-semibold text-sm">{group.handlerName}</span>
              {group.confirmationNumber && (
                <span className="text-xs text-muted-foreground ml-2">
                  #{group.confirmationNumber}
                </span>
              )}
              {group.paymentReference && (
                <span className="text-xs text-muted-foreground ml-2 font-mono">
                  {group.paymentReference.slice(0, 16)}&hellip;
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={paymentBadge.variant}>{paymentBadge.label}</Badge>
            <span className="text-sm font-medium">{displayTotal}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded(v => !v)}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className={cn('pt-0 px-0 pb-2')}>
          <EntryListCard
            entries={group.entries}
            selectedEntries={selectedEntries}
            onSelectEntry={onSelectEntry}
            onSelectAll={onSelectAll}
            onStatusChange={onStatusChange}
            onOpenCheckInDialog={onOpenCheckInDialog}
            onOpenArmbandDialog={onOpenArmbandDialog}
            onCompEntry={onCompEntry}
            onUncompEntry={onUncompEntry}
            hidePaymentBadge={true}
          />
        </CardContent>
      )}
    </Card>
  );
};

export default EnrollmentCard;
