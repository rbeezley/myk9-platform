/**
 * Archiving tab panel – archive management settings, quick actions, and statistics.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Archive } from 'lucide-react';
import type { ArchivingTabProps } from './types';

export function ArchivingTab({ archiveStats, isLoading, onRunArchiveCheck }: ArchivingTabProps) {
  return (
    <div className="space-y-6">
      <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
        <CardHeader>
          <CardTitle>Archive Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="!border-white/10 !bg-white/5">
            <Archive className="h-4 w-4" />
            <AlertDescription>
              Shows are automatically archived 30 days after completion. Archived data is compressed
              and can be restored when needed.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <h4 className="font-medium">Archive Settings</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• Archive after: 30 days</p>
                <p>• Compression: Enabled</p>
                <p>• Max size: 100MB</p>
                <p>• Retention: 365 days</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Quick Actions</h4>
              <div className="space-y-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start !border-white/10 !bg-white/5 hover:!bg-white/10 !transition-all !duration-300"
                  onClick={onRunArchiveCheck}
                  disabled={isLoading}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Run Archive Check
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Archive Statistics</h4>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total:</span>
                  <span>{archiveStats?.totalArchived || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size:</span>
                  <span>{archiveStats?.totalSizeMB.toFixed(1) || 0}MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saved:</span>
                  <span className="text-green-600">
                    {archiveStats
                      ? `${((1 - archiveStats.compressionRatio) * 100).toFixed(0)}%`
                      : '0%'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
