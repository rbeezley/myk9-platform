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
  const slug = showName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ResultsSubmissionPage() {
  const { showId } = useParams<{ showId: string }>();
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

  const isAKCScentWork =
    activeFormatter?.organization === 'AKC' && activeFormatter?.sportType === 'scent_work';

  // Fetch real AKC data when AKC scent work formatter is selected
  const { data: akcData, isLoading: isAKCLoading } = useAKCSubmissionData(
    isAKCScentWork ? (showId ?? '') : ''
  );

  const xmlPreview = isAKCScentWork && akcData ? AKCScentWorkFormatter.formatXml(akcData) : '';

  // Pre-flight: count entries missing AKC reg numbers
  const missingAKCCount = akcData ? akcData.entries.filter(e => !e.registrationNumber).length : 0;

  const filename = show ? buildFilename(show.name) : 'results.xml';

  const { mutate: recordSubmission } = useResultSubmission(showId);

  const { data: history = [], isLoading: historyLoading } = useResultSubmissions(showId ?? '');

  const handleDownload = () => {
    if (!xmlPreview) return;
    downloadXml(xmlPreview, filename);
  };

  const handleSend = async () => {
    if (!xmlPreview || !activeFormatter || !showId || !akcData) return;

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Results Submission</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate and submit electronic results to sanctioning organizations.
          </p>
        </div>

      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="org-select">
            Organization
          </label>
          <Select value={formatterKey} onValueChange={setFormatterKey}>
            <SelectTrigger id="org-select" className="w-[220px]" data-testid="org-selector">
              <SelectValue placeholder="Select organization" />
            </SelectTrigger>
            <SelectContent>
              {formatters.map(f => (
                <SelectItem
                  key={`${f.organization}:${f.sportType}`}
                  value={`${f.organization}:${f.sportType}`}
                >
                  {f.organization} — {f.sportType.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 pb-0.5">
          {activeFormatter?.submissionEmail && (
            <>
              <Button
                onClick={() => setShowConfirm(true)}
                disabled={!xmlPreview || isSending}
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
                      This will email the XML file to {activeFormatter.organization} and CC your
                      secretary address. This action cannot be undone.
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
            onClick={handleDownload}
            disabled={!xmlPreview}
            data-testid="download-btn"
          >
            Download XML
          </Button>
          <Button
            variant="outline"
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
        <p className="text-sm text-green-600" data-testid="send-success">
          Results sent successfully. A copy was CC&apos;d to your email.
        </p>
      )}
      {sendError && (
        <p className="text-sm text-destructive" data-testid="send-error">
          {sendError}
        </p>
      )}

      {/* Pre-flight warning */}
      {missingAKCCount > 0 && (
        <div
          className="rounded-md border border-yellow-400 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
          data-testid="preflight-warning"
        >
          {missingAKCCount} {missingAKCCount === 1 ? 'entry is' : 'entries are'} missing AKC
          registration numbers and will export with a blank akcDogRegnum. Verify dog registrations
          before submitting.
        </div>
      )}

      {/* XML preview */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium">XML Preview</h2>
        <Textarea
          readOnly
          value={isAKCLoading ? 'Fetching show data...' : xmlPreview}
          placeholder="Select a show and organization to preview the XML."
          className="font-mono text-xs min-h-[220px] resize-y"
          data-testid="xml-preview"
        />
      </div>

      {/* Submission history */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Submission History</h2>

        {historyLoading ? (
          <p className="text-sm text-muted-foreground">Loading history...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions recorded for this show.</p>
        ) : (
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
                  <TableCell>{row.sport_type.replace(/_/g, ' ')}</TableCell>
                  <TableCell>{formatDate(row.submitted_at)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
