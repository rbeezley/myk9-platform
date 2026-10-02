import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

/** The footer's "Please fix the following errors" box: two errors, then "Show N more". */
export function EditPanelErrorSummary({ errors }: { errors: string[] }) {
  const [showAll, setShowAll] = useState(false);
  const errorCount = errors.length;

  // Collapse again once the list is short enough to show whole (adjusting state during
  // render, not in an effect).
  if (errorCount <= 2 && showAll) setShowAll(false);

  if (errorCount === 0) return null;
  const visibleErrors = showAll ? errors : errors.slice(0, 2);
  const hiddenErrorCount = Math.max(0, errorCount - visibleErrors.length);

  return (
    <div
      role="alert"
      aria-live="polite"
      className="w-full rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Please fix the following errors:</p>
          <ul className="mt-1 space-y-1">
            {visibleErrors.map((error, index) => (
              <li key={`${error}-${index}`}>• {error}</li>
            ))}
          </ul>
          {errorCount > 2 && (
            <button
              type="button"
              className="mt-1 min-h-11 rounded-md font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={showAll}
              onClick={() => setShowAll(current => !current)}
            >
              {showAll
                ? 'Show fewer errors'
                : `Show ${hiddenErrorCount} more ${hiddenErrorCount === 1 ? 'error' : 'errors'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
