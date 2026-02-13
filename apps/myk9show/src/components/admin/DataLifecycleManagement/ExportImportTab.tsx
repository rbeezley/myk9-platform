/**
 * Export/Import tab panel – data export and import operations.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Download,
  Upload,
  FileText,
  Database,
  AlertTriangle,
} from 'lucide-react';
import type { ExportImportTabProps } from './types';

export function ExportImportTab({
  isLoading,
  onExportData,
}: ExportImportTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Export your data for backup, analysis, or migration purposes.
            </p>

            <div className="space-y-2">
              <Button
                className="w-full justify-start"
                onClick={onExportData}
                disabled={isLoading}
              >
                <Download className="h-4 w-4 mr-2" />
                Export All Data (ZIP)
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start !border-white/10 !bg-white/5 hover:!bg-white/10 !transition-all !duration-300"
                disabled={isLoading}
              >
                <FileText className="h-4 w-4 mr-2" />
                Export Archives Only (JSON)
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start !border-white/10 !bg-white/5 hover:!bg-white/10 !transition-all !duration-300"
                disabled={isLoading}
              >
                <Database className="h-4 w-4 mr-2" />
                Export Policies (CSV)
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import previously exported data or restore from backup.
            </p>

            <Alert className="!border-white/10 !bg-white/5">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Always run imports in dry-run mode first to validate the data.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start !border-white/10 !bg-white/5 hover:!bg-white/10 !transition-all !duration-300"
              >
                <Upload className="h-4 w-4 mr-2" />
                Choose File to Import
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
