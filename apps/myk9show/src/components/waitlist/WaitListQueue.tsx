import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { WaitListEntry } from '@/types/waitlist-types';

interface WaitListQueueProps {
  entries: WaitListEntry[];
  pendingEntries: WaitListEntry[];
  onPromote: (entryId: string) => void;
  onRemove: (entryId: string) => void;
  isPromoting?: boolean;
}

function formatTimeRemaining(expiresAt: string): string {
  const msLeft = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const hours = Math.floor(msLeft / 3_600_000);
  const minutes = Math.floor((msLeft % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function WaitListQueue({
  entries,
  pendingEntries,
  onPromote,
  onRemove,
  isPromoting = false,
}: WaitListQueueProps) {
  return (
    <div className="space-y-4">
      {/* Pending payment section */}
      {pendingEntries.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-800">
            Pending Payment ({pendingEntries.length})
          </p>
          <div className="space-y-2">
            {pendingEntries.map(entry => (
              <div
                key={entry.id}
                className="flex items-center justify-between text-sm text-amber-700"
              >
                <span>
                  {entry.exhibitorName} — {entry.dogName} ({entry.className})
                </span>
                {entry.offerExpiresAt && (
                  <Badge variant="outline" className="border-amber-400 text-amber-700">
                    {formatTimeRemaining(entry.offerExpiresAt)} left
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Queue table */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <Users className="mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">No exhibitors on the wait list</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">#</th>
                <th className="pb-2 pr-4 font-medium">Exhibitor</th>
                <th className="pb-2 pr-4 font-medium">Dog</th>
                <th className="pb-2 pr-4 font-medium">Class</th>
                <th className="pb-2 pr-4 font-medium">Added</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-mono text-muted-foreground">{entry.position}</td>
                  <td className="py-2 pr-4">{entry.exhibitorName}</td>
                  <td className="py-2 pr-4">{entry.dogName}</td>
                  <td className="py-2 pr-4">{entry.className}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onPromote(entry.id)}
                        disabled={isPromoting}
                      >
                        Promote
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onRemove(entry.id)}
                        disabled={isPromoting}
                        className="text-destructive hover:text-destructive"
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
