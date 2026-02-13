/**
 * BackupPanel - Create and manage backups
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Download, Trash2, Archive, RefreshCw, CloudUpload } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { BackupInfo, EntityInfo } from './types';
import { formatFileSize } from './utils';

interface BackupPanelProps {
  backups: BackupInfo[];
  availableEntities: EntityInfo[];
  selectedEntities: string[];
  onSelectedEntitiesChange: (entities: string[]) => void;
  isCreatingBackup: boolean;
  onCreateBackup: () => void;
}

export function BackupPanel({
  backups,
  availableEntities,
  selectedEntities,
  onSelectedEntitiesChange,
  isCreatingBackup,
  onCreateBackup,
}: BackupPanelProps) {
  return (
    <div className="space-y-6">
      {/* Create Backup */}
      <Card>
        <CardHeader>
          <CardTitle>Create New Backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Entity Selection for Backup */}
          <div className="space-y-3">
            <Label>Data to Include</Label>
            <div className="grid grid-cols-2 gap-3">
              {availableEntities.map((entity) => (
                <div key={entity.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`backup-${entity.id}`}
                    checked={selectedEntities.includes(entity.id)}
                    onCheckedChange={(checked) => {
                      const updated = checked
                        ? [...selectedEntities, entity.id]
                        : selectedEntities.filter(e => e !== entity.id);
                      onSelectedEntitiesChange(updated);
                    }}
                  />
                  <Label htmlFor={`backup-${entity.id}`} className="flex items-center gap-2">
                    <span>{entity.icon}</span>
                    <span>{entity.label}</span>
                    <Badge variant="outline" className="text-xs">
                      {entity.count}
                    </Badge>
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={onCreateBackup}
            disabled={isCreatingBackup}
            className="w-full"
          >
            {isCreatingBackup ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Creating Backup...
              </>
            ) : (
              <>
                <Archive className="h-4 w-4 mr-2" />
                Create Backup
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Existing Backups */}
      <Card>
        <CardHeader>
          <CardTitle>Existing Backups</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {backups.map((backup) => (
              <div key={backup.id} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{backup.name}</h4>
                      <Badge variant={backup.type === 'auto' ? 'secondary' : 'outline'}>
                        {backup.type}
                      </Badge>
                      {backup.compressed && (
                        <Badge variant="outline" className="text-xs">
                          Compressed
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Created {formatDistanceToNow(backup.createdAt, { addSuffix: true })} • {formatFileSize(backup.size)} • {backup.metadata.entryCount} entries
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Includes: {backup.entities.join(', ')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download backup</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <CloudUpload className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Restore Backup</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will restore data from &quot;{backup.name}&quot;. Current data may be overwritten. Are you sure?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction>Restore</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Backup</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete &quot;{backup.name}&quot;? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
