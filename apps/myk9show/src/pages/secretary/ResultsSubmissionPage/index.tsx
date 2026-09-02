// apps/myk9show/src/pages/secretary/ResultsSubmissionPage/index.tsx

import { useEffect, useMemo, useState } from 'react';
import { formatEntryDateTime } from '@/lib/format/dates';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { supabase } from '@/services/database/supabaseClient';
import {
  listFormatters,
  AKCScentWorkFormatter,
  countUnscoredAKCEntries,
} from '@myk9/secretary';
import { useAKCSubmissionData } from '@/hooks/queries/useAKCSubmissionData';
import { useResultSubmission, useResultSubmissions } from '@/hooks/mutations/useResultSubmission';
import { buildFilename, buildAKCSubmissionReadiness, downloadXml } from './helpers';
import { SubmissionHistory } from './SubmissionHistory';
import { RegistrySubmissionGuidance } from './RegistrySubmissionGuidance';
import {
  buildRegistrySubmissionOptions,
  chooseDefaultSubmissionOptionKey,
} from './submissionOptions';
import { ShowDeskReturnLink } from '@/features/show-map/cockpit/ShowDeskReturnLink';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** How long to wait for the submission record before reporting it unconfirmed. */
const RECORD_SUBMISSION_TIMEOUT_MS = 8000;

export default function ResultsSubmissionPage() {
  const params = useParams<{ showId?: string; id?: string }>();
  const showId = params.showId ?? params.id;
  const { show } = useFastShowDetails(showId);

  const formatters = useMemo(() => listFormatters(), []);
  const submissionOptions = useMemo(() => buildRegistrySubmissionOptions(formatters), [formatters]);
  const [submissionOptionKeyValue, setSubmissionOptionKeyValue] = useState<string>('');
  const [hasUserSelectedSubmissionOption, setHasUserSelectedSubmissionOption] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showMarkConfirm, setShowMarkConfirm] = useState(false);
  const [markSuccess, setMarkSuccess] = useState(false);
  /** The send reached the registry but the local record of it did not land. */
  /**
   * The registry the last send actually reached, captured at send time.
   * Reading the live selection here let the banner name a registry nothing was
   * sent to, once the secretary switched organisations after sending.
   */
  const [recordFailed, setRecordFailed] = useState<string | null>(null);

  const defaultSubmissionOptionKey = useMemo(
    () => chooseDefaultSubmissionOptionKey(show?.organization, submissionOptions),
    [show?.organization, submissionOptions]
  );

  useEffect(() => {
    const currentOptionExists = submissionOptions.some(
      option => option.key === submissionOptionKeyValue
    );
    if (!currentOptionExists) {
      setSubmissionOptionKeyValue(defaultSubmissionOptionKey);
      setHasUserSelectedSubmissionOption(false);
      return;
    }

    if (
      !hasUserSelectedSubmissionOption &&
      submissionOptionKeyValue !== defaultSubmissionOptionKey
    ) {
      setSubmissionOptionKeyValue(defaultSubmissionOptionKey);
    }
  }, [
    defaultSubmissionOptionKey,
    hasUserSelectedSubmissionOption,
    submissionOptionKeyValue,
    submissionOptions,
  ]);

  const handleSubmissionOptionChange = (nextOptionKey: string) => {
    // Clear every per-submission claim. The banner used to survive the switch,
    // so "Results sent successfully" read as a statement about the registry the
    // secretary had just moved to.
    setSendSuccess(false);
    setMarkSuccess(false);
    setSendError(null);
    setRecordFailed(null);
    setHasUserSelectedSubmissionOption(true);
    setSubmissionOptionKeyValue(nextOptionKey);
  };

  const activeSubmissionOption = submissionOptions.find(
    option => option.key === submissionOptionKeyValue
  );
  const activeFormatter =
    activeSubmissionOption?.mode === 'electronic' ? activeSubmissionOption.formatter : undefined;
  const selectedOrgLabel = activeSubmissionOption?.label;

  const isAKCScentWork =
    activeSubmissionOption?.organization === 'AKC' &&
    activeSubmissionOption?.sportType === 'scent_work';
  const isElectronicSubmission = activeSubmissionOption?.mode === 'electronic';

  // Fetch real AKC data when AKC scent work formatter is selected
  const {
    data: akcData,
    isLoading: isAKCLoading,
    refetch: refetchAKCData,
  } = useAKCSubmissionData(isAKCScentWork ? (showId ?? '') : '');
  /**
   * The AKC results read settled without producing data.
   *
   * This query inherits React Query's 'online' networkMode, so offline it
   * pauses: `isLoading` false, `data` undefined, and no error. The page then
   * printed "No results data is available for this show yet." -- an
   * authoritative claim about the show -- for a fully scored show whose data
   * simply had not been read.
   */
  const akcDataUnavailable = isAKCScentWork && !isAKCLoading && !akcData;

  const xmlPreview = isAKCScentWork && akcData ? AKCScentWorkFormatter.formatXml(akcData) : '';

  // Pre-flight: count entries missing AKC reg numbers
  const missingAKCCount = akcData ? akcData.entries.filter(e => !e.registrationNumber).length : 0;
  /**
   * Entries with no result recorded (MYK9-323). AKC's schema has no "unscored"
   * code, so these can only leave as NQ — a permanent record against a real
   * dog. Block sending, the same way a missing registration number does.
   */
  const unscoredAKCCount = akcData ? countUnscoredAKCEntries(akcData.entries) : 0;
  /** Nothing to send. An empty XML is still valid XML, so this must be its own gate. */
  const hasNoAKCEntries = isAKCScentWork && Boolean(akcData) && akcData!.entries.length === 0;
  const hasBlockingAKCPreflightIssue =
    isAKCScentWork && (missingAKCCount > 0 || unscoredAKCCount > 0 || hasNoAKCEntries);
  const akcReadiness = akcData
    ? buildAKCSubmissionReadiness({
        entryCount: akcData.entries.length,
        missingRegistrationNumberCount: missingAKCCount,
        unscoredEntryCount: unscoredAKCCount,
      })
    : null;
  const sendBlockedReason =
    isAKCScentWork && akcReadiness && !akcReadiness.canSend ? akcReadiness.verdict : null;

  const filename = show ? buildFilename(show.name) : 'results.xml';

  // "Mark as submitted" records a submission the secretary made elsewhere (the
  // org's portal, etc.) — it emails nothing. Block it when we *know* there's
  // nothing to record: for AKC scent work we have the entry data on hand, so
  // require a finished load with at least one entry. This closes the phantom
  // log where the auto-selected formatter satisfied the old showId+formatter
  // gate and one stray click recorded a zero-entry submission on page load.
  // Other orgs don't fetch entries here, so the confirmation dialog is the
  // guard against an accidental record.
  const markSubmittedDisabled =
    !showId ||
    !activeSubmissionOption ||
    (isAKCScentWork && (isAKCLoading || !akcData || akcData.entries.length === 0));

  const { mutate: recordSubmission, mutateAsync: recordSubmissionAsync } =
    useResultSubmission(showId);

  const {
    data: historyData,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = useResultSubmissions(showId ?? '');
  const history = historyData ?? [];
  /**
   * The submission ledger could not be read.
   *
   * Everything on this page that stops a DUPLICATE submission to a sanctioning
   * organisation depends on this list. An unread query has to say so: offline
   * the query pauses, which reports `isLoading: false` with `data: undefined`,
   * and the old `= []` default rendered that as "No submissions recorded".
   */
  const historyUnavailable = historyData === undefined && !historyLoading;
  /** A prior send/record for the organisation currently selected. */
  const priorSubmission = activeSubmissionOption
    ? history.find(row => row.organization === activeSubmissionOption.organization)
    : undefined;

  const handleDownload = () => {
    if (!xmlPreview) return;
    downloadXml(xmlPreview, filename);
  };

  const handleSend = async () => {
    if (!xmlPreview || !activeFormatter || !showId || !akcData) return;
    if (hasBlockingAKCPreflightIssue) {
      // The blocker is no longer always a missing registration number, so name
      // the one that actually fired rather than sending the secretary to fix
      // data that is already correct (MYK9-323).
      setSendError(
        unscoredAKCCount > 0
          ? 'Record a result for every entry before sending results.'
          : 'Add AKC registration numbers before sending results.'
      );
      setShowConfirm(false);
      return;
    }

    setSendError(null);
    setSendSuccess(false);
    setMarkSuccess(false);
    setIsSending(true);
    setShowConfirm(false);

    try {
      const { error } = await supabase.functions.invoke('send-results', {
        body: {
          xml: xmlPreview,
          filename,
          organization: activeFormatter.organization,
          sportType: activeFormatter.sportType,
          // The edge function authorizes against this show and derives the
          // cc/reply-to secretary email from the show record server-side.
          showId,
        },
      });

      if (error) throw error;

      // Auto-record submission on success.
      //
      // AWAITED, and its failure is surfaced. This used to be fire-and-forget:
      // the email had already reached the registry, so an RLS or offline
      // failure on this insert left a sent submission with NO record of it, the
      // page still said "Results sent successfully", and the next visit showed
      // an empty history -- inviting the secretary to send the same results
      // again. The send succeeding and the bookkeeping succeeding are two
      // different facts and have to be reported separately.
      //
      // Raced against a timeout. The mutation inherits React Query's 'online'
      // networkMode, so offline it PAUSES and `mutateAsync` never settles --
      // awaiting it bare would leave the button reading "Sending..." forever
      // after the email had already gone out. A record we cannot confirm is
      // exactly the case `recordFailed` exists to report, so time out into it.
      try {
        await Promise.race([
          recordSubmissionAsync({
            show_id: showId,
            organization: activeFormatter.organization,
            sport_type: activeFormatter.sportType,
            xml_payload: xmlPreview,
            status: 'sent',
          }),
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error('record-timeout')), RECORD_SUBMISSION_TIMEOUT_MS)
          ),
        ]);
      } catch {
        setRecordFailed(activeFormatter.organization);
      }

      setSendSuccess(true);
    } catch {
      // Deliberately does not read the thrown error. Supabase throws
      // "Edge Function returned a non-2xx status code" for every failure, which
      // names nothing the secretary can act on. The recovery is the same in
      // every case and the page already offers it.
      setSendError(
        'We could not send the results. Download the XML and email it to the registry, or try again.'
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleMarkSubmitted = () => {
    if (markSubmittedDisabled || !showId || !activeSubmissionOption) return;
    setSendSuccess(false);
    setSendError(null);
    setMarkSuccess(false);
    setRecordFailed(null);
    recordSubmission(
      {
        show_id: showId,
        organization: activeSubmissionOption.organization,
        sport_type: activeSubmissionOption.sportType,
        // Distinct from a `sent` email so the history reads honestly and the
        // record isn't mistaken for an electronic submission from the app.
        xml_payload: isElectronicSubmission ? xmlPreview || null : null,
        status: 'submitted',
      },
      {
        onSuccess: () => {
          setShowMarkConfirm(false);
          setMarkSuccess(true);
        },
        onError: err => {
          const message = err instanceof Error ? err.message : 'Please try again.';
          setSendError(
            message.startsWith('Failed to record submission')
              ? message
              : `Failed to record submission. ${message}`
          );
        },
      }
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-8" data-testid="results-submission-page">
      <ShowDeskReturnLink showId={showId} />
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Submit Results</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate and submit electronic results to sanctioning organizations.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="org-select">
            Organization
          </label>
          <Select value={submissionOptionKeyValue} onValueChange={handleSubmissionOptionChange}>
            <SelectTrigger
              id="org-select"
              className="min-h-[44px] w-[220px]"
              data-testid="org-selector"
            >
              <SelectValue placeholder="Select organization">{selectedOrgLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {submissionOptions.map(option => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Two distinct intents live here, so the layout separates them rather
            than rendering three peer buttons. Left group = "deliver the file
            from here" (email now / save a copy). After a divider, the lone
            "Mark as submitted" = "I already filed these elsewhere; just log
            it." The helper line below names the difference in words. */}
        <div className="flex flex-wrap items-center gap-2 pb-0.5">
          {activeFormatter?.submissionEmail && (
            <>
              <Button
                className="min-h-[44px]"
                onClick={() => setShowConfirm(true)}
                disabled={!xmlPreview || isSending || hasBlockingAKCPreflightIssue}
                aria-describedby={sendBlockedReason ? 'send-results-disabled-reason' : undefined}
                title={sendBlockedReason ?? undefined}
                data-testid="send-btn"
              >
                {isSending ? 'Sending...' : `Send to ${activeFormatter.organization}`}
              </Button>
              <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
                <AlertDialogContent data-testid="send-confirm-dialog">
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Send results to {activeFormatter.organization}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {/* The double-submit guard. `history` was loaded on this
                          page and simply not consulted at the moment of
                          decision, so nothing stood between two clicks and two
                          filings with the same registry. */}
                      {priorSubmission && (
                        <span className="mb-2 block font-medium text-warning">
                          These results were already{' '}
                          {priorSubmission.status === 'sent' ? 'sent' : 'recorded as submitted'} to{' '}
                          {priorSubmission.organization} on{' '}
                          {formatEntryDateTime(priorSubmission.submitted_at)}. Sending again files a
                          second time.
                        </span>
                      )}
                      {historyUnavailable && (
                        <span className="mb-2 block font-medium text-warning">
                          We couldn&rsquo;t load this show&rsquo;s submission history, so we
                          can&rsquo;t tell whether these results were already sent.
                        </span>
                      )}
                      This emails the XML file to {activeFormatter.organization} and CCs your
                      secretary address, so you keep a copy.
                      {akcData && akcData.entries.length > 0 && (
                        <> {akcData.entries.length} entries will be included.</>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSend} data-testid="send-confirm-btn">
                      Send
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {isElectronicSubmission && (
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={handleDownload}
              disabled={!xmlPreview}
              data-testid="download-btn"
            >
              {hasBlockingAKCPreflightIssue ? 'Download draft XML' : 'Download XML'}
            </Button>
          )}

          {/* Divider sets the record-keeping action apart from the deliver-the-
              file actions so it never reads as another way to "send". */}
          <div aria-hidden="true" className="mx-1 hidden h-8 w-px self-center bg-border sm:block" />

          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => setShowMarkConfirm(true)}
            disabled={markSubmittedDisabled}
            data-testid="mark-submitted-btn"
          >
            Mark as submitted
          </Button>
          <AlertDialog open={showMarkConfirm} onOpenChange={setShowMarkConfirm}>
            <AlertDialogContent data-testid="mark-confirm-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Mark results as submitted to {activeSubmissionOption?.organization}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {/* The same guard as the Send dialog. This path writes a row
                      to the ledger the closeout gate reads, and there is no
                      delete or undo for it anywhere in the UI -- so a second
                      click makes a second permanent record. Fixing the send
                      dialog and not this one would have left the duplicate one
                      button across. */}
                  {priorSubmission && (
                    <span className="mb-2 block font-medium text-warning">
                      A submission to {priorSubmission.organization} is already recorded for this
                      show, dated {formatEntryDateTime(priorSubmission.submitted_at)}. Recording
                      again adds a second entry.
                    </span>
                  )}
                  {historyUnavailable && (
                    <span className="mb-2 block font-medium text-warning">
                      We couldn&rsquo;t load this show&rsquo;s submission history, so we can&rsquo;t
                      tell whether a record already exists.
                    </span>
                  )}
                  This records that you already submitted these results to{' '}
                  {activeSubmissionOption?.organization} through their portal or another method.{' '}
                  <span className="font-medium">It does not email anything.</span>{' '}
                  <span className="font-medium">This record cannot be undone from here.</span>
                  {isAKCScentWork && akcData && akcData.entries.length > 0 && (
                    <> {akcData.entries.length} entries will be logged with this record.</>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleMarkSubmitted} data-testid="mark-confirm-btn">
                  Mark as submitted
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Plain-language contrast between the two intents, branched on whether
            the org accepts an in-app email submission at all. */}
        {activeSubmissionOption && (
          <p className="w-full text-xs text-muted-foreground" data-testid="action-help">
            {activeFormatter?.submissionEmail ? (
              <>
                <span className="font-medium">Send to {activeFormatter.organization}</span> emails
                the file now. Already filed these results through {activeFormatter.organization}
                &apos;s portal? <span className="font-medium">Mark as submitted</span> just logs it
                here.
              </>
            ) : (
              <>
                Submit through {activeSubmissionOption.organization}&apos;s official process, then
                use <span className="font-medium">Mark as submitted</span> to log it here.
              </>
            )}
          </p>
        )}
      </div>

      {activeSubmissionOption && (
        <RegistrySubmissionGuidance option={activeSubmissionOption} showId={showId} />
      )}

      {/* Send feedback */}
      {recordFailed && (
        <div
          role="alert"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          <p className="font-medium">The results were sent, but we couldn&rsquo;t log them.</p>
          <p className="mt-1 text-muted-foreground">
            The email reached {recordFailed}. Submission History below will
            not show it, so note it elsewhere and do not send again on the strength of an empty
            history.
          </p>
        </div>
      )}

      {sendSuccess && (
        <p className="text-sm text-success " role="status" data-testid="send-success">
          Results sent successfully. A copy was CC&apos;d to your email.
        </p>
      )}
      {markSuccess && (
        <p className="text-sm text-success" role="status" data-testid="mark-success">
          Recorded as submitted. It appears in your submission history below.
        </p>
      )}
      {sendError && (
        <p className="text-sm text-destructive" role="alert" data-testid="send-error">
          {sendError}
        </p>
      )}

      {/* Pre-flight warning — one banner, one line per blocker that fired. */}
      {(missingAKCCount > 0 || unscoredAKCCount > 0) && (
        <div
          className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning "
          role="alert"
          data-testid="preflight-warning"
        >
          {unscoredAKCCount > 0 && (
            <p data-testid="preflight-unscored">
              {unscoredAKCCount} {unscoredAKCCount === 1 ? 'entry has' : 'entries have'} no result
              recorded. AKC has no code for an unscored run, so{' '}
              {unscoredAKCCount === 1 ? 'it' : 'they'} would be submitted as NQ. Record a result
              &mdash; or mark the dog absent, excused, or withdrawn &mdash; before sending to AKC.
            </p>
          )}
          {missingAKCCount > 0 && (
            <p className={unscoredAKCCount > 0 ? 'mt-2' : undefined}>
              {missingAKCCount} {missingAKCCount === 1 ? 'entry is' : 'entries are'} missing AKC
              registration {missingAKCCount === 1 ? 'number' : 'numbers'}. Add the missing dog
              registration {missingAKCCount === 1 ? 'number' : 'numbers'} before sending to AKC.
            </p>
          )}
        </div>
      )}
      {sendBlockedReason && (
        <p
          id="send-results-disabled-reason"
          className="text-sm text-muted-foreground"
          data-testid="send-disabled-reason"
        >
          {sendBlockedReason}
        </p>
      )}

      {/* Submission summary — lead with a human checklist; the raw electronic
          payload lives behind the disclosure below so the secretary reads a
          plain-English readiness check first, not generated XML. */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Submission summary</h2>
        {!activeSubmissionOption ? (
          <p className="text-sm text-muted-foreground" data-testid="submission-summary-empty">
            Select an organization to prepare a submission.
          </p>
        ) : activeSubmissionOption.mode === 'manual' ? (
          <p className="text-sm text-muted-foreground" data-testid="submission-summary-manual">
            {activeSubmissionOption.guidance.summary}
          </p>
        ) : isAKCLoading ? (
          <p className="text-sm text-muted-foreground">Fetching show data...</p>
        ) : akcDataUnavailable ? (
          <div
            role="status"
            className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
            data-testid="submission-summary-unavailable"
          >
            <p className="font-medium">Couldn&rsquo;t load this show&rsquo;s results.</p>
            <p className="mt-1 text-muted-foreground">
              This is a problem reading the data, not a statement about the show. Nothing can be
              submitted until it loads.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 min-h-11"
              onClick={() => void refetchAKCData()}
            >
              Try again
            </Button>
          </div>
        ) : !akcData ? (
          <p className="text-sm text-muted-foreground" data-testid="submission-summary-no-data">
            No results data is available for this show yet.
          </p>
        ) : (
          <ul className="space-y-2 text-sm" data-testid="submission-checklist">
            <li className="flex items-center gap-2">
              {akcReadiness?.canSend ? (
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
              )}
              <span>{akcReadiness?.verdict}</span>
            </li>
            <li className="flex items-center gap-2">
              {akcData.entries.length === 0 ? (
                <>
                  {/* Vacuous truth is not a green check. "All entries have AKC
                      registration numbers" was rendered as satisfied for a show
                      with no entries at all. */}
                  <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                  <span>No entries to check for AKC registration numbers</span>
                </>
              ) : missingAKCCount === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  <span>All entries have AKC registration numbers</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                  <span>
                    <strong>{missingAKCCount}</strong>{' '}
                    {missingAKCCount === 1 ? 'entry is' : 'entries are'} missing AKC registration
                    numbers
                  </span>
                </>
              )}
            </li>
            <li className="flex items-center gap-2">
              {akcData.entries.length === 0 ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                  <span>No entries to check for missing results</span>
                </>
              ) : unscoredAKCCount === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  <span>Every entry has a result recorded</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                  <span>
                    <strong>{unscoredAKCCount}</strong>{' '}
                    {unscoredAKCCount === 1 ? 'entry has' : 'entries have'} no result recorded
                  </span>
                </>
              )}
            </li>
            <li className="flex items-center gap-2">
              {hasBlockingAKCPreflightIssue || akcData.entries.length === 0 ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                  <span>{akcReadiness?.details}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  <span>{akcReadiness?.details}</span>
                </>
              )}
            </li>
          </ul>
        )}

        {/* Raw electronic-submission payload — secondary, behind a disclosure. */}
        {isElectronicSubmission && (
          <details className="rounded-md border" data-testid="xml-details">
            <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium">
              <FileText className="mr-2 inline h-4 w-4 align-text-bottom" aria-hidden="true" />
              View electronic-submission details
            </summary>
            <div className="space-y-2 px-4 pb-4">
              <label id="xml-preview-label" className="text-xs font-medium text-muted-foreground">
                Generated XML
              </label>
              <Textarea
                readOnly
                aria-labelledby="xml-preview-label"
                value={isAKCLoading ? 'Fetching show data...' : xmlPreview}
                placeholder="Select a show and organization to preview the XML."
                className="font-mono text-xs min-h-[220px] resize-y"
                data-testid="xml-preview"
              />
            </div>
          </details>
        )}
      </div>

      <SubmissionHistory
        history={history}
        isLoading={historyLoading}
        isUnavailable={historyUnavailable}
        onRetry={() => void refetchHistory()}
      />
    </div>
  );
}
