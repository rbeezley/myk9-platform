import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/status';
import type { CheckInEntry } from '@/types/offline-checkin-types';

interface CheckInEntryListProps {
  entries: CheckInEntry[];
  onEntrySelect: (entry: CheckInEntry) => void;
}

export const CheckInEntryList: React.FC<CheckInEntryListProps> = ({ entries, onEntrySelect }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entries ({entries.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {entries.map(entry => (
            <div
              key={entry.id}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50',
                entry.checkInStatus === 'conflict' && 'border-destructive/20 bg-destructive/10'
              )}
              onClick={() => onEntrySelect(entry)}
            >
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="font-mono">
                  #{entry.armband}
                </Badge>
                <div>
                  <div className="font-medium">{entry.dogName}</div>
                  <div className="text-sm text-muted-foreground">
                    {entry.handlerName} • {entry.className}
                  </div>
                </div>
              </div>

              <StatusBadge family="entry" status={entry.checkInStatus} variant="outline" />
            </div>
          ))}

          {entries.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No entries match your search criteria
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
