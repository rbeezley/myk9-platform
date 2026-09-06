import { useId, useState } from 'react';
import { detailEntryToText } from '@/features/admin-system-health/alertDetailText';
import { formatAlertDetail } from '@/features/admin-system-health/operatorAlertsSelectors';
import type { OperatorAlert } from '@/features/admin-system-health/operatorAlertsTypes';

/** Preserve the complete diagnostic text without crowding the alert summary. */
export function OperatorAlertDetail({ detail }: Pick<OperatorAlert, 'detail'>) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const summary = formatAlertDetail(detail);
  const fullText = Object.entries(detail ?? {})
    .map(([key, value]) => detailEntryToText(key, value, { full: true }))
    .filter(Boolean)
    .join(', ');

  return (
    <div className="mt-0.5 min-w-0 text-sm text-muted-foreground">
      <p className="break-words">{summary || 'No further detail recorded.'}</p>
      {fullText !== summary && (
        <>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            onClick={() => setIsOpen(open => !open)}
            className="mt-1 inline-flex min-h-10 items-center rounded-[9px] px-2 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isOpen ? 'Hide technical details' : 'Technical details'}
          </button>
          {isOpen && (
            <p
              id={panelId}
              className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
            >
              {fullText}
            </p>
          )}
        </>
      )}
    </div>
  );
}
