import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckInStatusIndicator } from '@/components/common/CheckInStatusIndicator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Users, CheckCircle2, Hash, MessageSquare, Gift } from 'lucide-react';
import { EntryStatus } from '@/types/show-registration-types';
import { getEntryStatusBadge, getPaymentStatusBadge } from '@/utils/entryManagementUtils';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';

interface EntryListCardProps {
  entries: EntryManagementEntry[];
  selectedEntries: Set<string>;
  onSelectEntry: (entryId: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onStatusChange: (entryId: string, status: EntryStatus) => void;
  onOpenCheckInDialog: (entry: EntryManagementEntry, classEntry: EntryClass) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onCompEntry?: (entryId: string) => void;
  onUncompEntry?: (entryId: string) => void;
}

/**
 * Entry list/table card for entry management
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */
export const EntryListCard: React.FC<EntryListCardProps> = ({
  entries,
  selectedEntries,
  onSelectEntry,
  onSelectAll,
  onStatusChange,
  onOpenCheckInDialog,
  onOpenArmbandDialog,
  onCompEntry,
  onUncompEntry,
}) => {
  return (
    <TooltipProvider>
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Entries ({entries.length})</CardTitle>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedEntries.size === entries.length && entries.length > 0}
              onCheckedChange={onSelectAll}
            />
            <span className="text-sm text-muted-foreground">Select All</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {entries.map((entry) => (
            <div key={entry.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <Checkbox
                    checked={selectedEntries.has(entry.id)}
                    onCheckedChange={(checked) => onSelectEntry(entry.id, checked as boolean)}
                  />

                  <div className="flex-1">
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

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-muted-foreground mb-2">
                      <span>Owner: {entry.ownerName}</span>
                      <span>Handler: {entry.handlerName}</span>
                      <span>Classes: {entry.classes.length}</span>
                      <span>Fee: ${entry.totalFee} (Paid: ${entry.paidAmount})</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {getEntryStatusBadge(entry.entryStatus)}
                      {getPaymentStatusBadge(entry.paymentStatus)}
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

                    {/* Class Check-In Status */}
                    <div className="mt-2 space-y-1">
                      {entry.classes.map((cls) => (
                        <div key={cls.id} className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{cls.name}:</span>
                          <button
                            onClick={() => onOpenCheckInDialog(entry, cls)}
                            className="hover:scale-105 transition-transform"
                          >
                            <CheckInStatusIndicator
                              status={cls.checkInStatus || 'none'}
                              size="sm"
                              showLabel={true}
                              showTooltip={true}
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {entry.entryStatus === EntryStatus.PENDING && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => onStatusChange(entry.id, EntryStatus.ACCEPTED)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onStatusChange(entry.id, EntryStatus.WAITLIST)}
                      >
                        Waitlist
                      </Button>
                    </>
                  )}

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

                  <Select onValueChange={(value) => onStatusChange(entry.id, value as EntryStatus)}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EntryStatus.ACCEPTED}>Accept</SelectItem>
                      <SelectItem value={EntryStatus.WAITLIST}>Waitlist</SelectItem>
                      <SelectItem value={EntryStatus.REJECTED}>Reject</SelectItem>
                      <SelectItem value={EntryStatus.MISSING_INFO}>Missing Info</SelectItem>
                    </SelectContent>
                  </Select>
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
      </CardContent>
    </Card>
    </TooltipProvider>
  );
};

export default EntryListCard;
