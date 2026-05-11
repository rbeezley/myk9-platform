import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  parseHealthRecordsCsv,
  type HealthImportOutcome,
  type HealthImportResult,
  type ParsedHealthImportRow,
} from './healthImport';

interface HealthImportDialogProps {
  open: boolean;
  dogId: string;
  onOpenChange: (open: boolean) => void;
  onImportRecords?:
    | ((records: ParsedHealthImportRow[]) => Promise<HealthImportOutcome>)
    | undefined;
}

export function HealthImportDialog({
  open,
  dogId,
  onOpenChange,
  onImportRecords,
}: HealthImportDialogProps) {
  const [importCsv, setImportCsv] = useState('');
  const [importResult, setImportResult] = useState<HealthImportResult | null>(null);
  const [importOutcome, setImportOutcome] = useState<HealthImportOutcome | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handlePreviewImport = () => {
    setImportResult(parseHealthRecordsCsv(importCsv, dogId));
  };

  const handleImportRecords = async () => {
    const result = importResult || parseHealthRecordsCsv(importCsv, dogId);
    setImportResult(result);
    setImportOutcome(null);

    if (result.records.length === 0 || result.errors.length > 0) {
      toast.error('Fix CSV errors before importing.');
      return;
    }

    setIsImporting(true);
    let outcome: HealthImportOutcome;
    try {
      outcome = (onImportRecords ? await onImportRecords(result.records) : null) ?? {
        succeeded: 0,
        failed: result.records.length,
        errors: ['Import is not available.'],
      };
    } catch (error) {
      outcome = {
        succeeded: 0,
        failed: result.records.length,
        errors: [error instanceof Error ? error.message : 'Import failed'],
      };
    } finally {
      setIsImporting(false);
    }
    setImportOutcome(outcome);

    if (outcome.failed > 0) {
      toast.error(`Imported ${outcome.succeeded} of ${result.records.length} records.`);
      return;
    }

    toast.success(`Imported ${outcome.succeeded} health records.`);
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
            Expiration Date, Notes. Dates must use YYYY-MM-DD. Cost applies to vet visits;
            Expiration Date applies to vaccinations.
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
                  ? `, ${importResult.errors.length} errors must be fixed first`
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
          {importOutcome && importOutcome.failed > 0 && (
            <div className="rounded-md border border-destructive/40 p-3 text-sm">
              <p className="font-medium">
                Imported {importOutcome.succeeded}; {importOutcome.failed} failed.
              </p>
              <ul className="mt-2 space-y-1 text-destructive">
                {importOutcome.errors.map(error => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handlePreviewImport} disabled={!importCsv.trim()}>
              Preview
            </Button>
            <Button onClick={handleImportRecords} disabled={!importCsv.trim() || isImporting}>
              {isImporting ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
