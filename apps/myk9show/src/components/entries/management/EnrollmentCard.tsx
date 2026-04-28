import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Receipt, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EntryListCard } from './EntryListCard';
import { getPaymentStatusBadge } from '@/utils/entryManagementUtils';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';
import { EntryStatus } from '@/types/show-registration-types';
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
  onOpenCheckInDialog: (entry: EntryManagementEntry, classEntry: EntryClass) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onCompEntry?: (entryId: string) => void;
  onUncompEntry?: (entryId: string) => void;
  onBulkStatusChange: (entryIds: string[], status: EntryStatus) => void;
  onBulkCheckIn: (entryIds: string[]) => void;
  emailStatusMap?: Record<string, EmailLogEntry> | undefined;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
}

export const EnrollmentCard: React.FC<EnrollmentCardProps> = ({
  group,
  onStatusChange,
  onOpenCheckInDialog,
  onOpenArmbandDialog,
  onCompEntry,
  onUncompEntry,
  onBulkStatusChange,
  onBulkCheckIn,
  emailStatusMap,
  onResendEmail,
  isResendDisabled,
}) => {
  const [expanded, setExpanded] = useState(true);

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
            {getPaymentStatusBadge(group.paymentStatus)}
            <span className="text-sm font-medium">{displayTotal}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs px-2">
                  Actions
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    onBulkStatusChange(
                      group.entries.map(e => e.id),
                      EntryStatus.ACCEPTED
                    )
                  }
                >
                  Accept All
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onBulkStatusChange(
                      group.entries.map(e => e.id),
                      EntryStatus.WAITLIST
                    )
                  }
                >
                  Waitlist All
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onBulkStatusChange(
                      group.entries.map(e => e.id),
                      EntryStatus.REJECTED
                    )
                  }
                >
                  Reject All
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onBulkStatusChange(
                      group.entries.map(e => e.id),
                      EntryStatus.MISSING_INFO
                    )
                  }
                >
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
            onOpenCheckInDialog={onOpenCheckInDialog}
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
    </Card>
  );
};

export default EnrollmentCard;
