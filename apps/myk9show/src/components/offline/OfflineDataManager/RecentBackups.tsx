/**
 * RecentBackups - Displays a summary list of recent backups for the overview tab
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Archive, FolderArchive } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { BackupInfo } from './types';
import { formatFileSize } from './utils';

interface RecentBackupsProps {
  backups: BackupInfo[];
}

export function RecentBackups({ backups }: RecentBackupsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderArchive className="h-5 w-5" />
          Recent Backups
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {backups.slice(0, 3).map((backup) => (
            <div key={backup.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Archive className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium text-sm">{backup.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(backup.createdAt, { addSuffix: true })} • {formatFileSize(backup.size)}
                  </div>
                </div>
              </div>
              <Badge variant={backup.type === 'auto' ? 'secondary' : 'outline'}>
                {backup.type}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
