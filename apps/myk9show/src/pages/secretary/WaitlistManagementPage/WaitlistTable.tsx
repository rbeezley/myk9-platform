/**
 * Waitlist Table component for WaitlistManagementPage
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Clock, Dog, ArrowUpCircle, Trash2, Loader2 } from 'lucide-react';
import type { WaitlistEntry, ClassWithWaitlistCount, ActionDialogState } from './types';
import { formatDateTime } from './utils';

interface WaitlistEntryRowProps {
  entry: WaitlistEntry;
  index: number;
  selectedClass: ClassWithWaitlistCount | undefined;
  onOfferSpot: (entry: WaitlistEntry) => void;
  onRemove: (entry: WaitlistEntry) => void;
}

const WaitlistEntryRow: React.FC<WaitlistEntryRowProps> = ({
  entry,
  index,
  selectedClass,
  onOfferSpot,
  onRemove,
}) => {
  const hasAvailableSpots =
    selectedClass &&
    (!selectedClass.max_entries || selectedClass.accepted_count < selectedClass.max_entries);

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-4">
        {/* Position Badge */}
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold">
          #{index + 1}
        </div>

        {/* Entry Info */}
        <div>
          <div className="flex items-center gap-2">
            <Dog className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {entry.dog?.name || 'Unknown Dog'}
            </span>
            {entry.dog?.call_name && (
              <span className="text-muted-foreground">
                ({entry.dog.call_name})
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-4">
            <span>Position: #{entry.position}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Added: {formatDateTime(entry.created_at)}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {hasAvailableSpots && (
          <Button size="sm" onClick={() => onOfferSpot(entry)}>
            <ArrowUpCircle className="h-4 w-4 mr-1" />
            Offer Spot
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onRemove(entry)}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Remove
        </Button>
      </div>
    </div>
  );
};

interface WaitlistTableProps {
  entries: WaitlistEntry[];
  selectedClass: ClassWithWaitlistCount | undefined;
  isLoading: boolean;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSetActionDialog: (state: ActionDialogState) => void;
}

export const WaitlistTable: React.FC<WaitlistTableProps> = ({
  entries,
  selectedClass,
  isLoading,
  searchTerm,
  onSearchChange,
  onSetActionDialog,
}) => {
  const handleOfferSpot = (entry: WaitlistEntry) => {
    onSetActionDialog({ open: true, action: 'offer', entry });
  };

  const handleRemove = (entry: WaitlistEntry) => {
    onSetActionDialog({ open: true, action: 'remove', entry });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Waitlist ({entries.length})
            </CardTitle>
            <CardDescription>
              Entries are ordered by submission time (first come, first served)
            </CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by dog or handler..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No entries on waitlist</p>
            <p className="text-sm">
              {searchTerm
                ? 'No entries match your search'
                : 'This class has no waitlisted entries'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, index) => (
              <WaitlistEntryRow
                key={entry.id}
                entry={entry}
                index={index}
                selectedClass={selectedClass}
                onOfferSpot={handleOfferSpot}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
