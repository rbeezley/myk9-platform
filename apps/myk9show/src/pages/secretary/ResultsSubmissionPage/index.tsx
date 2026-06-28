// apps/myk9show/src/pages/secretary/ResultsSubmissionPage/index.tsx

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import type { ResultSubmissionRow } from '@/hooks/mutations/useResultSubmission';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFilename(showName: string): string {
  const rawSlug = showName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  // A name made entirely of non-ASCII characters (CJK, emoji) slugs to empty,
  // which would yield a leading-dash "-Results_…" filename; fall back instead.
  const slug = rawSlug.slice(0, 80) || 'Show';
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${slug}-Results_${ts}.xml`;
}

function downloadXml(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function statusVariant(
  status: ResultSubmissionRow['status']
): 'default' | 'secondary' | 'destructive' {
  if (status === 'sent') return 'default';
  if (status === 'failed') return 'destructive';
  return 'secondary';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// Human label for a formatter — e.g. { organization: 'AKC', sportType: 'scent_work' }
// renders "AKC Scent Work". Used for both the option list and the collapsed
// trigger so they never diverge; without an explicit label the Base UI trigger
// echoes the raw `organization:sportType` value verbatim ("AKC:scent_work").
function formatFormatterLabel(f: { organization: string; sportType: string }): string {
  const sport = f.sportType
    .split('_')
    .map(word => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
  return `${f.organization} ${sport}`.trim();
}

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

  const filename = show ? buildFilename(show.name) : 'results.xml';

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
    if (!showId || !activeFormatter) return;
    recordSubmission({
      show_id: showId,
      organization: activeFormatter.organization,
      sport_type: activeFormatter.sportType,
      xml_payload: xmlPreview || null,
      status: 'sent',
    });
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

        <div className="flex flex-wrap gap-2 pb-0.5">
          {activeFormatter?.submissionEmail && (
            <>
              <Button
                className="min-h-[44px]"
                onClick={() => setShowConfirm(true)}
                disabled={!xmlPreview || isSending || hasBlockingAKCPreflightIssue}
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
            Download XML
          </Button>
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={handleMarkSubmitted}
            disabled={!showId || !activeFormatter}
            data-testid="mark-submitted-btn"
          >
            Mark as Submitted
          </Button>
        </div>
      </div>

      {/* Send feedback */}
      {sendSuccess && (
        <p className="text-sm text-success " role="status" data-testid="send-success">
          Results sent successfully. A copy was CC&apos;d to your email.
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
          registration numbers and will export with a blank akcDogRegnum. Verify dog registrations
          before submitting.
        </div>
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
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              <span>
                <strong>{akcData.entries.length}</strong>{' '}
                {akcData.entries.length === 1 ? 'entry' : 'entries'} ready to submit
              </span>
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
                  <span>Add the missing registration numbers before sending</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  <span>Submission file is ready to send or download</span>
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

      {/* Submission history */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Submission History</h2>

        {historyLoading ? (
          <p className="text-sm text-muted-foreground">Loading history...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions recorded for this show.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="history-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Sport</TableHead>
                  <TableHead>Submitted At</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map(row => (
                  <TableRow key={row.id}>
                    <TableCell>{row.organization}</TableCell>
                    <TableCell className="capitalize">
                      {row.sport_type.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(row.submitted_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)} className="capitalize">
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
