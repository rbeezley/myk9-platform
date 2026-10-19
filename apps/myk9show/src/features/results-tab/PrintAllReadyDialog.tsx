import { useState } from 'react';
import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { CockpitPaperworkRow } from '@/features/show-map/cockpit/CockpitPaperworkRow';
import { PrintStatusUnavailable } from './PrintStatusUnavailable';
import type { ResultsClassRow } from './buildResultsClassRows';

const PRINT_LABEL: Record<string, string> = {
  'results-sheet': 'Results sheet',
  'result-labels': 'Ribbon labels',
};

/**
 * "Print all ready": the released classes whose results sheet or ribbon labels have no current
 * print confirmation, each with the existing paperwork row (Print opens the report, Record as
 * printed writes the confirmation). A report prints one class, trial or show at a time, so this
 * lists the classes rather than inventing a batch scope.
 */
export function PrintAllReadyDialog({
  rows,
  timeZone,
  paperworkAvailable,
  onRetry,
}: {
  rows: readonly ResultsClassRow[];
  timeZone: string;
  paperworkAvailable: boolean;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ready = rows.filter(row => row.phase === 'released');
  return (
    <>
      <Button
        type="button"
        className="min-h-11 gap-2"
        disabled={ready.length === 0}
        onClick={() => setOpen(true)}
      >
        <Printer className="h-4 w-4" aria-hidden="true" />
        Print all ready
        {ready.length > 0 && <span aria-hidden="true">({ready.length})</span>}
      </Button>
      <SlideOverPanel
        open={open}
        onClose={() => setOpen(false)}
        title="Print all ready"
        subtitle="Released classes that still need their results sheet or ribbon labels printed."
        size="lg"
      >
        <div className="space-y-4 p-6">
          {!paperworkAvailable && <PrintStatusUnavailable onRetry={onRetry} />}
          {ready.map(row => (
            <section key={row.id} className="space-y-2" aria-label={row.name}>
              <h3 className="text-sm font-semibold">
                {row.name}
                <span className="font-normal text-muted-foreground"> · {row.trialLabel}</span>
              </h3>
              {row.paperwork.map(item => (
                <CockpitPaperworkRow
                  key={item.reportId}
                  item={{ ...item, label: PRINT_LABEL[item.reportId] ?? item.label }}
                  timeZone={timeZone}
                  onCommand={() => undefined}
                />
              ))}
            </section>
          ))}
          {ready.length === 0 && (
            <p className="text-sm text-muted-foreground">Everything released is printed.</p>
          )}
        </div>
      </SlideOverPanel>
    </>
  );
}
