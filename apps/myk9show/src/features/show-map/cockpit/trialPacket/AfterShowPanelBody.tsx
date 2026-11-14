import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { getTrialRegistry } from '@/features/registries';
import { useReportData } from '@/hooks/queries/useReportData';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useTrialOfficials } from '@/hooks/queries/useTrialOfficials';
import { useUKCTrialReportContext } from '@/hooks/queries/useUKCTrialReportContext';
import { resolvePrintReadiness } from '@/pages/secretary/ReportsPage/reportReadinessCopy';
import { writeMarkupIntoFrame } from '@/pages/secretary/ReportsPage/reportPreviewFrame';
import { printIframeAndWait } from '@/pages/secretary/ReportsPage/reportPreviewUtils';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';

import { getCockpitReportHref } from '../cockpitRoutes';
import { afterShowReportsFor, clubKeepsNote } from './afterShowReports';
import type { AfterShowDocuments } from './buildAfterShowPackets';
import { packetFileName, plural, savePacketPdf, usePacketFrame } from './usePacketFrame';

type Part = 'reports' | 'forms';

/**
 * The after-show packet (MYK9-1924 phase 2a), opened from Results: the trial's marked catalog and
 * High in Trial as printed pages, and the registry's own forms (chosen by the trial's registry)
 * filled in as one PDF. The entry and transfer forms the club keeps are Reports' to build per dog,
 * so this links to them. Nothing here blocks: a form that cannot be built is a note beside the rest.
 */
export function AfterShowPanelBody({ showId, trialId }: { showId: string; trialId: string }) {
  const location = useLocation();
  const { show: currentShow } = useFastShowDetails(showId);
  const { show, trials, classes, entries, dataState, catalogProfilesReadComplete, refetch } =
    useReportData({ show: currentShow, trialId, classId: 'all' });
  const readiness = resolvePrintReadiness(dataState, 'ready');
  useEffect(() => {
    void refetch();
    // Once per open; `refetch` is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trial = ((trials ?? []) as DbTrial[]).find(item => item.id === trialId);
  const registryId = trial ? getTrialRegistry(trial).id : 'AKC';
  const ids = afterShowReportsFor(registryId);
  const officials = useTrialOfficials(show?.id, ids.forms.length > 0);
  const ukcContext = useUKCTrialReportContext(show?.id, registryId === 'UKC');
  const hostedSettled = !officials.isLoading && (registryId !== 'UKC' || !ukcContext.isLoading);

  const [attempt, setAttempt] = useState(0);
  const inputs = useMemo(
    () =>
      readiness.state === 'ready' && show && hostedSettled
        ? { show, trials, classes, entries }
        : null,
    [readiness.state, show, hostedSettled, trials, classes, entries]
  );
  const [docs, setDocs] = useState<{
    inputs: typeof inputs;
    attempt: number;
    result: AfterShowDocuments | 'error';
  } | null>(null);
  useEffect(() => {
    if (!inputs) return;
    let superseded = false;
    void (async () => {
      try {
        const { buildAfterShowDocuments } = await import('./buildAfterShowPackets');
        const result = await buildAfterShowDocuments({
          show: inputs.show,
          trials: (inputs.trials ?? []) as DbTrial[],
          classes: (inputs.classes ?? []) as DbClass[],
          entries: (inputs.entries ?? []) as DbEntry[],
          trialId,
          officials: officials.data ?? null,
          ukcTrialReportContext: ukcContext.data ?? null,
          catalogProfilesReadComplete,
        });
        if (!superseded) setDocs({ inputs, attempt, result });
      } catch {
        if (!superseded) setDocs({ inputs, attempt, result: 'error' });
      }
    })();
    return () => {
      superseded = true;
    };
    // The loaded rows are the trigger; the hosted reads are settled before `inputs` exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, attempt, trialId]);
  const current = docs && docs.inputs === inputs && docs.attempt === attempt ? docs.result : null;
  const built = current && current !== 'error' ? current : null;
  const failed = current === 'error';
  const [part, setPart] = useState<Part>('reports');
  const [printing, setPrinting] = useState(false);

  // The reports are HTML pages, the forms a PDF: each has its own frame; only the picked one shows.
  const reportsFrame = useRef<HTMLIFrameElement>(null);
  const [reportsReady, setReportsReady] = useState(false);
  const reportsHtml = built?.reportsHtml ?? null;
  useEffect(() => {
    const frame = reportsFrame.current;
    setReportsReady(false);
    if (!frame || !reportsHtml) return;
    return writeMarkupIntoFrame(frame, reportsHtml, () => setReportsReady(true));
  }, [reportsHtml]);
  const formsPdf = built?.formsPdf ?? null;
  const { frameRef: formsFrame, frameReady: formsReady } = usePacketFrame(formsPdf);

  if (readiness.blockedMessage) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 p-4 text-sm">
        <span>{readiness.blockedMessage}</span>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!trial || !show)
    return <p className="p-4 text-sm text-muted-foreground">Getting the trial ready…</p>;

  const trialName =
    trial.name?.trim() || (trial.trial_number ? `Trial ${trial.trial_number}` : 'This trial');
  const keptLinks = ids.kept;
  const keepsNote = clubKeepsNote(registryId);
  const returnTo = `${location.pathname}${location.search}`;
  const activeReady = part === 'reports' ? reportsReady : formsReady;

  const print = async () => {
    setPrinting(true);
    try {
      const closed = await printIframeAndWait(part === 'reports' ? reportsFrame : formsFrame);
      if (!closed) toast('The packet is still building. It will be ready in a moment.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-base">
        For <strong>{trialName}</strong>, the <strong>{registryId}</strong> after-show paperwork.
      </p>
      {keepsNote && <p className="text-sm text-muted-foreground">{keepsNote}</p>}
      {failed && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span>The packet could not be built.</span>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setAttempt(count => count + 1)}
          >
            Try again
          </Button>
        </div>
      )}
      {built?.notes.map(note => (
        <p
          key={note}
          className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        >
          {note}
        </p>
      ))}
      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <ul aria-label="Packets" className="flex flex-col gap-2">
          {(
            [
              ['reports', 'Printed reports', built?.reportNames ?? []],
              ['forms', 'Registry forms', built?.formNames ?? []],
            ] as const
          ).map(([key, title, names]) => (
            <li key={key}>
              <button
                type="button"
                aria-current={part === key ? 'true' : undefined}
                onClick={() => setPart(key)}
                className={`min-h-11 w-full rounded-md border px-3 py-2 text-left text-sm ${part === key ? 'border-primary bg-primary/5' : ''}`}
              >
                <span className="block font-medium">{title}</span>
                <span className="block text-muted-foreground">
                  {built ? (names.length > 0 ? names.join(', ') : 'Nothing to print') : 'Building…'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div>
          <iframe
            ref={reportsFrame}
            title="Printed reports preview"
            className={part === 'reports' ? 'h-[60vh] w-full rounded-md border bg-white' : 'hidden'}
          />
          <iframe
            ref={formsFrame}
            title="Registry forms preview"
            className={part === 'forms' ? 'h-[60vh] w-full rounded-md border bg-white' : 'hidden'}
          />
        </div>
      </div>
      {keptLinks.length > 0 && (
        <p className="text-sm">
          Entry and transfer forms for the club's records:{' '}
          {keptLinks.map((item, index) => (
            <span key={item.id}>
              {index > 0 && ', '}
              <Link
                className="underline"
                to={getCockpitReportHref({
                  reportId: item.id,
                  scope: { kind: 'trial', showId, trialId },
                  returnTo,
                })}
              >
                {item.name}
              </Link>
            </span>
          ))}
          .
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t bg-card px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {plural(
            (built?.reportNames.length ?? 0) + (built?.formNames.length ?? 0),
            'report',
            'reports'
          )}
        </span>
        <Button
          type="button"
          size="touch"
          disabled={printing || !activeReady}
          onClick={() => void print()}
        >
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          {printing
            ? 'Printing…'
            : part === 'reports'
              ? 'Print or save the reports'
              : 'Print the forms'}
        </Button>
        {part === 'forms' && (
          <Button
            type="button"
            size="touch"
            variant="outline"
            disabled={!formsPdf}
            onClick={() =>
              formsPdf &&
              savePacketPdf(
                formsPdf,
                packetFileName([show.name ?? null, trialName, 'registry forms'])
              )
            }
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Save as PDF
          </Button>
        )}
      </div>
      {part === 'reports' && (
        <p className="text-sm text-muted-foreground">
          To keep the reports as a PDF, choose Save as PDF as the printer in the print window.
        </p>
      )}
    </div>
  );
}
