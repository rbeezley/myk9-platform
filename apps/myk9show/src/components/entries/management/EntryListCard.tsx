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
import { Users, Hash, MessageSquare, Gift } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
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
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {/* Dog name + armband */}
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold">{entry.entryNumber}</h4>
                <span className="text-muted-foreground">•</span>
                <span className="font-medium">{entry.dogName}</span>
                {entry.armbandNumber && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <Badge variant="outline">{entry.armbandNumber}</Badge>
                  </>
                )}
              </div>

              {/* Metadata row: owner / handler / fee + payment badge + email + comped + notes */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-2">
                <span>Owner: {entry.ownerName}</span>
                <span>Handler: {entry.handlerName}</span>
                <span>Fee: ${entry.totalFee} (Paid: ${entry.paidAmount})</span>

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

                {entry.comped && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        <Gift className="h-3 w-3 mr-1" />
                        Comped
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{entry.compedReason || 'No reason provided'}</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {entry.notes && (
                  <Badge variant="outline" className="text-blue-600">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    Notes
                  </Badge>
                )}
              </div>

              {/* Class rows — each shows class name + entry status + check-in status */}
              <div className="mt-2 space-y-1">
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
                        <DropdownMenuItem onClick={() => onStatusChange(entry.id, EntryStatus.ACCEPTED)}>Accept</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onStatusChange(entry.id, EntryStatus.WAITLIST)}>Waitlist</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onStatusChange(entry.id, EntryStatus.REJECTED)}>Reject</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onStatusChange(entry.id, EntryStatus.MISSING_INFO)}>Missing Info</DropdownMenuItem>
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

            <div className="flex items-center gap-2 ml-4">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpenArmbandDialog(entry)}
                title="Assign Armband"
              >
                <Hash className="h-4 w-4" />
              </Button>

              {onCompEntry && !entry.comped && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onCompEntry(entry.id)}
                  title="Comp Entry"
                >
                  <Gift className="h-4 w-4" />
                </Button>
              )}
              {onUncompEntry && entry.comped && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onUncompEntry(entry.id)}
                  title="Remove Comp"
                  className="text-destructive"
                >
                  <Gift className="h-4 w-4" />
                </Button>
              )}
            </div>
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
