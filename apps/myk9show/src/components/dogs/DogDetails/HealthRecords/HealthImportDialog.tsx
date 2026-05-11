import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  parseHealthRecordsCsv,
  type HealthImportResult,
  type ParsedHealthImportRow,
} from './healthImport';

interface HealthImportDialogProps {
  open: boolean;
  dogId: string;
  onOpenChange: (open: boolean) => void;
  onImportRecords?: ((records: ParsedHealthImportRow[]) => void) | undefined;
}

export function HealthImportDialog({
  open,
  dogId,
  onOpenChange,
  onImportRecords,
}: HealthImportDialogProps) {
  const [importCsv, setImportCsv] = useState('');
  const [importResult, setImportResult] = useState<HealthImportResult | null>(null);

  const handlePreviewImport = () => {
    setImportResult(parseHealthRecordsCsv(importCsv, dogId));
  };

  const handleImportRecords = () => {
    const result = importResult || parseHealthRecordsCsv(importCsv, dogId);
    setImportResult(result);

    if (result.records.length === 0 || result.errors.length > 0) return;

    onImportRecords?.(result.records);
    setImportCsv('');
    setImportResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Health Records</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Paste a CSV with columns: Type, Title, Date, Description, Veterinarian, Clinic, Cost,
            Expiration Date, Notes.
          </p>
          <Textarea
            value={importCsv}
            onChange={event => {
              setImportCsv(event.target.value);
              setImportResult(null);
            }}
            rows={8}
            placeholder="Type,Title,Date,Description&#10;Vaccination,Rabies,2026-02-14,Three-year rabies vaccine"
          />
          {importResult && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">
                {importResult.records.length} ready to import
                {importResult.errors.length > 0
                  ? `, ${importResult.errors.length} need attention`
                  : ''}
              </p>
              {importResult.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-destructive">
                  {importResult.errors.map(error => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handlePreviewImport} disabled={!importCsv.trim()}>
              Preview
            </Button>
            <Button onClick={handleImportRecords} disabled={!importCsv.trim()}>
              Import
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
