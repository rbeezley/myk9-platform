/**
 * AtShowSetupSheetPage: the judge's printable setup cheat sheet (MYK9-1078).
 *
 * Renders the same `SetupCheatSheet` the secretary Reports card prints, so the two entry points
 * can never disagree. The sheet is static rulebook data, so this works offline; the registry
 * comes from the show's trials.
 *
 * Print goes through a hidden frame holding only the sheet, the same path the Reports page
 * prints through, not `window.print()` of this page: every at-show page sits inside app-wide
 * banners (install, offline notice, onboarding, announcements) that would otherwise print over
 * the sheet or push it onto an extra page.
 */
import { useEffect, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSetupSheet } from '@/features/registries';
import type { SetupSheet } from '@/features/registries';
import { SetupCheatSheet } from '@/components/reports/setupCheatSheet/SetupCheatSheet';
import { renderReportToHtml } from '@/lib/reports/reportRenderer';
import { writeMarkupIntoFrame } from '@/pages/secretary/ReportsPage/reportPreviewFrame';
import { printIframe } from '@/pages/secretary/ReportsPage/reportPreviewUtils';
import { useAtShowClassList } from './useAtShowClassList';
import { setupSheetRegistryIds } from './setupSheetRegistries';

/** The print document: the sheets alone, with the report stylesheet. */
export function setupSheetPrintHtml(sheets: readonly SetupSheet[]): string {
  return renderReportToHtml(
    renderToStaticMarkup(
      <>
        {sheets.map(sheet => (
          <SetupCheatSheet key={sheet.registryId} sheet={sheet} />
        ))}
      </>
    )
  );
}

export function AtShowSetupSheetPage() {
  const { showId } = useParams<{ showId: string }>();
  const { groups, isLoading, error, refresh } = useAtShowClassList(showId);
  const sheets = setupSheetRegistryIds(groups)
    .map(registryId => getSetupSheet(registryId))
    .filter((sheet): sheet is SetupSheet => sheet !== null && sheet !== undefined);
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const cancelWriteRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => cancelWriteRef.current?.(), []);

  const handlePrint = () => {
    const frame = printFrameRef.current;
    if (!frame) return;
    cancelWriteRef.current?.();
    cancelWriteRef.current = writeMarkupIntoFrame(frame, setupSheetPrintHtml(sheets), () => {
      printIframe(printFrameRef);
    });
  };

  return (
    <main className="ringside-root px-4 py-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button asChild variant="ghost" className="min-h-11 gap-2 px-3">
          <Link to={`/at-show/${encodeURIComponent(showId ?? '')}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to classes
          </Link>
        </Button>
        {sheets.length > 0 && (
          <Button className="min-h-11 gap-2 px-4" onClick={handlePrint}>
            <Printer className="h-4 w-4" aria-hidden />
            Print
          </Button>
        )}
      </div>

      {sheets.length === 0 && error ? (
        // A failed read is not "no sheet": the registry is unknown until the trials load.
        <div role="status" className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-muted-foreground">Couldn’t load this show’s trials.</p>
          <Button variant="outline" className="min-h-11" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : sheets.length === 0 ? (
        <p role="status" className="py-12 text-center text-muted-foreground">
          {isLoading
            ? 'Loading the setup cheat sheet...'
            : 'There is no setup cheat sheet for this show’s registry.'}
        </p>
      ) : (
        // The sheet is a fixed 10.5in wide so it prints at 100%; on a phone it scrolls sideways.
        <div className="overflow-x-auto">
          {sheets.map(sheet => (
            <SetupCheatSheet key={sheet.registryId} sheet={sheet} />
          ))}
        </div>
      )}

      {/* Off-screen, not display:none, so the browser lays it out at full page width for print. */}
      <iframe
        ref={printFrameRef}
        title="Setup cheat sheet for printing"
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none fixed -left-[200vw] top-0 h-[8.5in] w-[11in] border-0"
      />
    </main>
  );
}

export default AtShowSetupSheetPage;
