import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronDown, ChevronUp, Receipt, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EntryListCard } from './EntryListCard';
import { getPaymentStatusBadge } from '@/utils/entryManagementUtils';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { CheckInStatus } from '@myk9/core';
import type { EmailLogEntry } from '@/hooks/useEmailStatus';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EnrollmentCardProps {
  group: EnrollmentGroup;
  onStatusChange: (entryId: string, status: EntryStatus) => void;
  onCheckInStatusChange: (entry: EntryManagementEntry, cls: EntryClass, status: CheckInStatus) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onCompEntry?: (entryId: string) => void;
  onUncompEntry?: (entryId: string) => void;
  onBulkStatusChange: (entryIds: string[], status: EntryStatus) => void;
  onBulkCheckIn: (entryIds: string[]) => void;
  onPaymentStatusChange: (enrollmentId: string, status: PaymentStatus, reference?: string | null) => void;
  emailStatusMap?: Record<string, EmailLogEntry> | undefined;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
}

export const EnrollmentCard: React.FC<EnrollmentCardProps> = ({
  group,
  onStatusChange,
  onCheckInStatusChange,
  onOpenArmbandDialog,
  onCompEntry,
  onUncompEntry,
  onBulkStatusChange,
  onBulkCheckIn,
  onPaymentStatusChange,
  emailStatusMap,
  onResendEmail,
  isResendDisabled,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [checkDialog, setCheckDialog] = useState<{ open: boolean; checkNumber: string }>({
    open: false,
    checkNumber: '',
  });

  const dollars = group.totalAmountUnit === 'cents' ? group.totalAmount / 100 : group.totalAmount;
  const displayTotal = `$${dollars.toFixed(2)}`;
  const enrollmentId = group.enrollmentId ?? '';

  const handlePayment = (status: PaymentStatus, reference?: string | null) => {
    if (enrollmentId) onPaymentStatusChange(enrollmentId, status, reference);
  };

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
            {/* Clickable payment status badge */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                  {getPaymentStatusBadge(group.paymentStatus)}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handlePayment(PaymentStatus.PAID_BY_CASH)}>
                  Paid — Cash
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCheckDialog({ open: true, checkNumber: '' })}>
                  Paid — Check…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlePayment(PaymentStatus.PAID_ONLINE)}>
                  Paid — Online
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handlePayment(PaymentStatus.REFUNDED)}>
                  Refunded
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlePayment(PaymentStatus.PENDING)}>
                  Pending
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="text-sm font-medium">{displayTotal}</span>

            {/* Enrollment-level bulk actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs px-2">
                  Actions
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onBulkStatusChange(group.entries.map(e => e.id), EntryStatus.ACCEPTED)}>
                  Accept All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkStatusChange(group.entries.map(e => e.id), EntryStatus.WAITLIST)}>
                  Waitlist All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkStatusChange(group.entries.map(e => e.id), EntryStatus.REJECTED)}>
                  Reject All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkStatusChange(group.entries.map(e => e.id), EntryStatus.MISSING_INFO)}>
                  Missing Info
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onBulkCheckIn(group.entries.map(e => e.id))}>
                  Check In All
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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
            onStatusChange={onStatusChange}
            onCheckInStatusChange={onCheckInStatusChange}
            onOpenArmbandDialog={onOpenArmbandDialog}
            onCompEntry={onCompEntry}
            onUncompEntry={onUncompEntry}
            hidePaymentBadge={true}
            hideHeader={true}
            emailStatusMap={emailStatusMap}
            onResendEmail={onResendEmail}
            isResendDisabled={isResendDisabled}
          />
        </CardContent>
      )}

      {/* Check number dialog — local to this card */}
      <Dialog open={checkDialog.open} onOpenChange={open => !open && setCheckDialog({ open: false, checkNumber: '' })}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Check Payment</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Check number (optional)"
              value={checkDialog.checkNumber}
              onChange={e => setCheckDialog(prev => ({ ...prev, checkNumber: e.target.value }))}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckDialog({ open: false, checkNumber: '' })}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                handlePayment(PaymentStatus.PAID_BY_CHECK, checkDialog.checkNumber || null);
                setCheckDialog({ open: false, checkNumber: '' });
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default EnrollmentCard;
