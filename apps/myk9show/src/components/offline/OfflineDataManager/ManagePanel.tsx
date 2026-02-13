/**
 * ManagePanel - Data clearing and storage optimization tools
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
import { Trash2, AlertTriangle, Zap } from 'lucide-react';
import type { EntityInfo } from './types';

interface ManagePanelProps {
  availableEntities: EntityInfo[];
  selectedEntities: string[];
  onSelectedEntitiesChange: (entities: string[]) => void;
  onClearData: (entityTypes: string[]) => void;
}

export function ManagePanel({
  availableEntities,
  selectedEntities,
  onSelectedEntitiesChange,
  onClearData,
}: ManagePanelProps) {
  return (
    <div className="space-y-6">
      {/* Clear Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Clear Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <h4 className="font-medium text-destructive">Warning</h4>
                <p className="text-sm text-destructive/80">
                  Clearing data will permanently delete the selected information. This action cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Select data to clear</Label>
            <div className="grid grid-cols-2 gap-3">
              {availableEntities.map((entity) => (
                <div key={entity.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`clear-${entity.id}`}
                    onCheckedChange={(checked) => {
                      const updated = checked
                        ? [...selectedEntities, entity.id]
                        : selectedEntities.filter(e => e !== entity.id);
                      onSelectedEntitiesChange(updated);
                    }}
                  />
                  <Label htmlFor={`clear-${entity.id}`} className="flex items-center gap-2">
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

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={selectedEntities.length === 0}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Selected Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Data Clearing</AlertDialogTitle>
                <AlertDialogDescription>
                  You are about to permanently delete data for: {selectedEntities.join(', ')}.
                  This action cannot be undone. Are you absolutely sure?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onClearData(selectedEntities)}
                  className="bg-destructive text-destructive-foreground"
                >
                  Yes, Clear Data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Storage Optimization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Storage Optimization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <h4 className="font-medium">Compress Old Data</h4>
                <p className="text-sm text-muted-foreground">
                  Compress entries older than 6 months to save space
                </p>
              </div>
              <Button variant="outline" size="sm">
                Compress
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <h4 className="font-medium">Remove Orphaned Data</h4>
                <p className="text-sm text-muted-foreground">
                  Clean up data without valid references
                </p>
              </div>
              <Button variant="outline" size="sm">
                Clean Up
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <h4 className="font-medium">Rebuild Indexes</h4>
                <p className="text-sm text-muted-foreground">
                  Optimize database performance
                </p>
              </div>
              <Button variant="outline" size="sm">
                Rebuild
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
