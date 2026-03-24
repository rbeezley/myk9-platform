/**
 * Cleanup tab panel – orphaned records cleanup with dry-run and execute modes.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, Trash2 } from 'lucide-react';
import type { CleanupTabProps } from './types';

export function CleanupTab({ isLoading, lastCleanupReport, onRunCleanup }: CleanupTabProps) {
  return (
    <div className="space-y-6">
      <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
        <CardHeader>
          <CardTitle>Orphaned Records Cleanup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="!border-white/10 !bg-card/5">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Cleanup operations help maintain data integrity by removing orphaned records. Always
              run in dry-run mode first to review what will be removed.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button onClick={() => onRunCleanup(true)} disabled={isLoading}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Dry Run Scan
            </Button>
            <Button variant="destructive" onClick={() => onRunCleanup(false)} disabled={isLoading}>
              <Trash2 className="h-4 w-4 mr-2" />
              Execute Cleanup
            </Button>
          </div>

          {lastCleanupReport && (
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium">Last Cleanup Report</h4>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center">
                  <p className="text-2xl font-bold text-orange-600">
                    {lastCleanupReport.orphansFound}
                  </p>
                  <p className="text-sm text-muted-foreground">Orphans Found</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {lastCleanupReport.orphansRemoved}
                  </p>
                  <p className="text-sm text-muted-foreground">Records Removed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {(lastCleanupReport.spaceReclaimed / 1024).toFixed(1)}KB
                  </p>
                  <p className="text-sm text-muted-foreground">Space Reclaimed</p>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <p>Completed: {lastCleanupReport.scanCompleted.toLocaleString()}</p>
                {lastCleanupReport.errors.length > 0 && (
                  <p className="text-red-600">Errors: {lastCleanupReport.errors.length}</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
