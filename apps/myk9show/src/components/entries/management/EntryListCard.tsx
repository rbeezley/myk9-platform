import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckInStatusIndicator } from '@/components/common/CheckInStatusIndicator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users, Hash, MessageSquare, Gift, ChevronDown } from 'lucide-react';
import { EntryStatus } from '@/types/show-registration-types';
import { getEntryStatusBadge, getPaymentStatusBadge } from '@/utils/entryManagementUtils';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';
import { EmailStatusIcon } from '@/components/entries/EmailStatusIcon';
import type { EmailLogEntry } from '@/hooks/useEmailStatus';
import type { CheckInStatus } from '@myk9/core';
import { CHECKIN_STATUS } from '@myk9/core';

interface EntryListCardProps {
  entries: EntryManagementEntry[];
  onStatusChange: (entryId: string, status: EntryStatus) => void;
  onCheckInStatusChange: (entry: EntryManagementEntry, cls: EntryClass, status: CheckInStatus) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onCompEntry?: ((entryId: string) => void) | undefined;
  onUncompEntry?: ((entryId: string) => void) | undefined;
  emailStatusMap?: Record<string, EmailLogEntry> | undefined;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
  hidePaymentBadge?: boolean | undefined;
  /** Suppress the Card wrapper and title — use when nested inside EnrollmentCard */
  hideHeader?: boolean | undefined;
}

export const EntryListCard: React.FC<EntryListCardProps> = ({
  entries,
  onStatusChange,
  onCheckInStatusChange,
  onOpenArmbandDialog,
  onCompEntry,
  onUncompEntry,
  emailStatusMap,
  onResendEmail,
  isResendDisabled,
  hidePaymentBadge,
  hideHeader,
}) => {
  const entryList = (
    <div className="space-y-2">
      {entries.map(entry => (
        <div
          key={entry.id}
          className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold">{entry.dogName}</span>

            {entry.armbandNumber ? (
              <button
                className="inline-flex items-center gap-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onOpenArmbandDialog(entry)}
                title="Change armband"
              >
                <Badge variant="outline" className="font-mono">
                  {entry.armbandNumber}
                </Badge>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            ) : (
              <button
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border/50 rounded px-1.5 py-0.5"
                onClick={() => onOpenArmbandDialog(entry)}
              >
                <Hash className="h-3 w-3" />
                Assign
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-2">
            <span>Owner: {entry.ownerName}</span>
            <span>Handler: {entry.handlerName}</span>
            <span>Fee: ${entry.totalFee} (Paid: ${entry.paidAmount})</span>

            {entry.comped ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1">
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      <Gift className="h-3 w-3 mr-1" />
                      Comped
                    </Badge>
                    {onUncompEntry && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => onUncompEntry(entry.id)}
                      >
                        Undo
                      </Button>
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{entry.compedReason || 'No reason provided'}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              onCompEntry && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onCompEntry(entry.id)}
                >
                  <Gift className="h-3 w-3 mr-1" />
                  Comp
                </Button>
              )
            )}

            {!hidePaymentBadge && getPaymentStatusBadge(entry.paymentStatus)}

            {emailStatusMap && (
              <EmailStatusIcon
                status={emailStatusMap[entry.registrationId]?.status}
                errorMessage={emailStatusMap[entry.registrationId]?.error_message}
                onResend={
                  onResendEmail ? () => onResendEmail(entry.registrationId) : undefined
                }
                resendDisabled={isResendDisabled?.(entry.registrationId)}
              />
            )}

            {entry.notes && (
              <Badge variant="outline" className="text-blue-600">
                <MessageSquare className="h-3 w-3 mr-1" />
                Notes
              </Badge>
            )}
          </div>

          <div className="space-y-1">
            {entry.classes.map(cls => (
              <div key={cls.id} className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-muted-foreground font-medium min-w-[120px]">{cls.name}:</span>

                {/* Entry status — clickable dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                      {getEntryStatusBadge(entry.entryStatus)}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => onStatusChange(entry.id, EntryStatus.PENDING)}>
                      Pending
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStatusChange(entry.id, EntryStatus.ACCEPTED)}>
                      Accept
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStatusChange(entry.id, EntryStatus.WAITLIST)}>
                      Waitlist
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStatusChange(entry.id, EntryStatus.REJECTED)}>
                      Reject
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStatusChange(entry.id, EntryStatus.MISSING_INFO)}>
                      Missing Info
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Check-in status — clickable dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="inline-flex items-center gap-1 cursor-pointer border border-border/40 rounded px-1.5 py-0.5 hover:border-border transition-colors">
                      <CheckInStatusIndicator
                        status={cls.checkInStatus || 'no-status'}
                        size="sm"
                        showLabel={true}
                        showTooltip={false}
                      />
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {Object.values(CHECKIN_STATUS).map(s => (
                      <DropdownMenuItem
                        key={s.value}
                        onClick={() => onCheckInStatusChange(entry, cls, s.value)}
                      >
                        {s.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

              </div>
            ))}
          </div>
        </div>
      ))}

      {entries.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No entries match the current filters</p>
        </div>
      )}
    </div>
  );

  if (hideHeader) {
    return <TooltipProvider><div className="px-4 py-2">{entryList}</div></TooltipProvider>;
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle>Entries ({entries.length})</CardTitle>
        </CardHeader>
        <CardContent>{entryList}</CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default EntryListCard;
