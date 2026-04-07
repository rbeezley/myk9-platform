/**
 * ResultsSubmissionPage — generate and submit electronic results to
 * sanctioning organizations (AKC, UKC, NACSW, etc.).
 *
 * Flow:
 *  1. Select show
 *  2. Select organization / formatter
 *  3. Preview generated XML
 *  4. Download XML file  — or —  Mark as Submitted
 *  5. View submission history below
 */

import { useState, useEffect } from 'react';
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
import { useShowStore } from '@/store/showStore';
import { listFormatters } from '@myk9/secretary';
import type { SubmissionData } from '@myk9/secretary';
import { useResultSubmission, useResultSubmissions } from '@/hooks/mutations/useResultSubmission';
import type { ResultSubmissionRow } from '@/hooks/mutations/useResultSubmission';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildStubData(
  showId: string,
  showName: string,
  organization: string,
  sportType: string
): SubmissionData {
  return {
    show: {
      id: showId,
      name: showName,
      clubName: null,
      date: null,
      clubLicenseNumber: null,
    },
    trial: {
      id: '',
      trialNumber: 1,
      date: null,
      judgeName: '',
      organization,
      sportType,
    },
    entries: [],
  };
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
  const { shows, selectedShowId, selectShow } = useShowStore();

  const formatters = listFormatters();
  const [formatterKey, setFormatterKey] = useState<string>(
    formatters.length > 0 ? `${formatters[0].organization}:${formatters[0].sportType}` : ''
  );

  const activeFormatter = formatters.find(f => `${f.organization}:${f.sportType}` === formatterKey);

  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;

  // Auto-select first show
  useEffect(() => {
    if (!selectedShowId && shows.length > 0) {
      selectShow(shows[0].id);
    }
  }, [selectedShowId, shows, selectShow]);

  // Generate XML preview whenever show or formatter changes
  const xmlPreview =
    selectedShow && activeFormatter
      ? activeFormatter.formatXml(
          buildStubData(
            selectedShow.id,
            selectedShow.name,
            activeFormatter.organization,
            activeFormatter.sportType
          )
        )
      : '';

  const {
    mutate: recordSubmission,
    isPending: isSubmitting,
    isError: submitError,
  } = useResultSubmission(selectedShowId);

  const { data: history = [], isLoading: historyLoading } = useResultSubmissions(
    selectedShowId ?? ''
  );

  const handleDownload = () => {
    if (!xmlPreview || !activeFormatter || !selectedShow) return;
    const slug = `${selectedShow.name.replace(/\s+/g, '_')}_${activeFormatter.organization}_${activeFormatter.sportType}`;
    downloadXml(xmlPreview, `${slug}.xml`);
  };

  const handleMarkSubmitted = () => {
    if (!selectedShowId || !activeFormatter) return;
    recordSubmission({
      show_id: selectedShowId,
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

        {/* Show selector */}
        {shows.length > 0 && (
          <Select value={selectedShowId ?? ''} onValueChange={selectShow}>
            <SelectTrigger className="w-[240px]" data-testid="show-selector">
              <SelectValue placeholder="Select show">
                {selectedShow?.name ?? 'Select show'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {shows.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Organization / formatter selector */}
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

        {/* Action buttons */}
        <div className="flex gap-2 pb-0.5">
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={!xmlPreview}
            data-testid="download-btn"
          >
            Download XML
          </Button>
          <Button
            onClick={handleMarkSubmitted}
            disabled={!selectedShowId || !activeFormatter || isSubmitting}
            data-testid="mark-submitted-btn"
          >
            {isSubmitting ? 'Saving...' : 'Mark as Submitted'}
          </Button>
        </div>

        {submitError && (
          <p className="text-sm text-destructive">Failed to record submission. Please try again.</p>
        )}
      </div>

      {/* XML preview */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium">XML Preview</h2>
        <Textarea
          readOnly
          value={xmlPreview}
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
