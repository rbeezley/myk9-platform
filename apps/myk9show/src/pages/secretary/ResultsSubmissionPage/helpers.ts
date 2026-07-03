// apps/myk9show/src/pages/secretary/ResultsSubmissionPage/helpers.ts
//
// Pure presentation helpers for the Submit Results page. Extracted into a
// sibling module to keep index.tsx under the 500-line ceiling.

import type { ResultSubmissionRow } from '@/hooks/mutations/useResultSubmission';

export function buildFilename(showName: string): string {
  const rawSlug = showName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  // A name made entirely of non-ASCII characters (CJK, emoji) slugs to empty,
  // which would yield a leading-dash "-Results_..." filename; fall back instead.
  const slug = rawSlug.slice(0, 80) || 'Show';
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${slug}-Results_${ts}.xml`;
}

export function downloadXml(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function statusVariant(
  status: ResultSubmissionRow['status']
): 'default' | 'secondary' | 'destructive' {
  if (status === 'sent') return 'default';
  if (status === 'failed') return 'destructive';
  return 'secondary';
}

// History labels read honestly about *how* the results reached the org, so a
// secretary scanning the log can tell an in-app email apart from a manual
// portal submission they recorded.
export function statusLabel(status: ResultSubmissionRow['status']): string {
  switch (status) {
    case 'sent':
      return 'Emailed';
    case 'submitted':
      return 'Marked submitted';
    case 'failed':
      return 'Failed';
    case 'pending':
      return 'Pending';
    default:
      return status;
  }
}

// Human label for a formatter — e.g. { organization: 'AKC', sportType: 'scent_work' }
// renders "AKC Scent Work". Used for both the option list and the collapsed
// trigger so they never diverge; without an explicit label the Base UI trigger
// echoes the raw `organization:sportType` value verbatim ("AKC:scent_work").
export function formatFormatterLabel(f: { organization: string; sportType: string }): string {
  const sport = f.sportType
    .split('_')
    .map(word => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
  return `${f.organization} ${sport}`.trim();
}
