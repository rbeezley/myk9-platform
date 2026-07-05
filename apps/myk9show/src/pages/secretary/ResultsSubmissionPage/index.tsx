// apps/myk9show/src/pages/secretary/ResultsSubmissionPage/index.tsx

import { useState } from 'react';
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
import { listFormatters, AKCScentWorkFormatter } from '@myk9/secretary';
import { useAKCSubmissionData } from '@/hooks/queries/useAKCSubmissionData';
import { useResultSubmission, useResultSubmissions } from '@/hooks/mutations/useResultSubmission';
import {
  buildFilename,
  buildAKCSubmissionReadiness,
  downloadXml,
  formatFormatterLabel,
} from './helpers';
import { SubmissionHistory } from './SubmissionHistory';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ResultsSubmissionPage() {
  const params = useParams<{ showId?: string; id?: string }>();
  const showId = params.showId ?? params.id;
  const { show } = useFastShowDetails(showId);

  const formatters = listFormatters();
  const [formatterKey, setFormatterKey] = useState<string>(
    formatters.length > 0 ? `${formatters[0].organization}:${formatters[0].sportType}` : ''
  );
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showMarkConfirm, setShowMarkConfirm] = useState(false);
  const [markSuccess, setMarkSuccess] = useState(false);

  const activeFormatter = formatters.find(f => `${f.organization}:${f.sportType}` === formatterKey);
  const selectedOrgLabel = activeFormatter ? formatFormatterLabel(activeFormatter) : undefined;

  const isAKCScentWork =
    activeFormatter?.organization === 'AKC' && activeFormatter?.sportType === 'scent_work';

  // Fetch real AKC data when AKC scent work formatter is selected
  const { data: akcData, isLoading: isAKCLoading } = useAKCSubmissionData(
    isAKCScentWork ? (showId ?? '') : ''
  );

  const xmlPreview = isAKCScentWork && akcData ? AKCScentWorkFormatter.formatXml(akcData) : '';

  // Pre-flight: count entries missing AKC reg numbers
  const missingAKCCount = akcData ? akcData.entries.filter(e => !e.registrationNumber).length : 0;
  const hasBlockingAKCPreflightIssue = isAKCScentWork && missingAKCCount > 0;
  const akcReadiness = akcData
    ? buildAKCSubmissionReadiness({
        entryCount: akcData.entries.length,
        missingRegistrationNumberCount: missingAKCCount,
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
    !activeFormatter ||
    (isAKCScentWork && (isAKCLoading || !akcData || akcData.entries.length === 0));

  const { mutate: recordSubmission } = useResultSubmission(showId);

  const { data: history = [], isLoading: historyLoading } = useResultSubmissions(showId ?? '');

  const handleDownload = () => {
    if (!xmlPreview) return;
    downloadXml(xmlPreview, filename);
  };

  const handleSend = async () => {
    if (!xmlPreview || !activeFormatter || !showId || !akcData) return;
    if (hasBlockingAKCPreflightIssue) {
      setSendError('Add AKC registration numbers before sending results.');
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
          secretaryEmail: akcData.show.secretaryEmail ?? '',
        },
      });

      if (error) throw error;

      // Auto-record submission on success
      recordSubmission({
        show_id: showId,
        organization: activeFormatter.organization,
        sport_type: activeFormatter.sportType,
        xml_payload: xmlPreview,
        status: 'sent',
      });

      setSendSuccess(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to send. Please download and email manually.';
      setSendError(msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleMarkSubmitted = () => {
    if (markSubmittedDisabled || !showId || !activeFormatter) return;
    setSendSuccess(false);
    setSendError(null);
    setMarkSuccess(false);
    recordSubmission(
      {
        show_id: showId,
        organization: activeFormatter.organization,
        sport_type: activeFormatter.sportType,
        // Distinct from a `sent` email so the history reads honestly and the
        // record isn't mistaken for an electronic submission from the app.
        xml_payload: xmlPreview || null,
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
          <Select value={formatterKey} onValueChange={setFormatterKey}>
            <SelectTrigger
              id="org-select"
              className="min-h-[44px] w-[220px]"
              data-testid="org-selector"
            >
              <SelectValue placeholder="Select organization">{selectedOrgLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {formatters.map(f => (
                <SelectItem
                  key={`${f.organization}:${f.sportType}`}
                  value={`${f.organization}:${f.sportType}`}
                >
                  {formatFormatterLabel(f)}
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
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={handleDownload}
            disabled={!xmlPreview}
            data-testid="download-btn"
          >
            {hasBlockingAKCPreflightIssue ? 'Download draft XML' : 'Download XML'}
          </Button>

          {/* Divider sets the record-keeping action apart from the deliver-the-
              file actions so it never reads as another way to "send". */}
          <div
            aria-hidden="true"
            className="mx-1 hidden h-8 w-px self-center bg-border sm:block"
          />

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
                  Mark results as submitted to {activeFormatter?.organization}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This records that you already submitted these results to{' '}
                  {activeFormatter?.organization} through their portal or another method.{' '}
                  <span className="font-medium">It does not email anything.</span>
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
        {activeFormatter && (
          <p className="w-full text-xs text-muted-foreground" data-testid="action-help">
            {activeFormatter.submissionEmail ? (
              <>
                <span className="font-medium">Send to {activeFormatter.organization}</span> emails
                the file now. Already filed these results through{' '}
                {activeFormatter.organization}&apos;s portal?{' '}
                <span className="font-medium">Mark as submitted</span> just logs it here.
              </>
            ) : (
              <>
                Download the file and submit it through {activeFormatter.organization}&apos;s portal,
                then use <span className="font-medium">Mark as submitted</span> to log it here.
              </>
            )}
          </p>
        )}
      </div>

      {/* Send feedback */}
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

      {/* Pre-flight warning */}
      {missingAKCCount > 0 && (
        <div
          className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning "
          role="alert"
          data-testid="preflight-warning"
        >
          {missingAKCCount} {missingAKCCount === 1 ? 'entry is' : 'entries are'} missing AKC
          registration {missingAKCCount === 1 ? 'number' : 'numbers'}. Add the missing dog
          registration {missingAKCCount === 1 ? 'number' : 'numbers'} before sending to AKC.
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
        {!activeFormatter ? (
          <p className="text-sm text-muted-foreground" data-testid="submission-summary-empty">
            Select an organization to prepare a submission.
          </p>
        ) : !isAKCScentWork ? (
          <p className="text-sm text-muted-foreground" data-testid="submission-summary-generic">
            {formatFormatterLabel(activeFormatter)} results are prepared as a downloadable file. Use{' '}
            <span className="font-medium">Download XML</span> to save it, then submit through the
            organization&apos;s portal.
          </p>
        ) : isAKCLoading ? (
          <p className="text-sm text-muted-foreground">Fetching show data...</p>
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
              {missingAKCCount === 0 ? (
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
              {hasBlockingAKCPreflightIssue ? (
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
      </div>

      <SubmissionHistory history={history} isLoading={historyLoading} />
    </div>
  );
}
