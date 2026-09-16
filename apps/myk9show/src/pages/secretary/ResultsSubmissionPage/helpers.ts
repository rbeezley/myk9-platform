// apps/myk9show/src/pages/secretary/ResultsSubmissionPage/helpers.ts
//
// Pure presentation helpers for the Submit Results page. Extracted into a
// sibling module to keep index.tsx under the 500-line ceiling.

import type { ResultSubmissionRow } from '@/hooks/mutations/useResultSubmission';
import type { UnmappableAKCClass } from '@myk9/secretary';

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

export interface AKCSubmissionReadiness {
  verdict: string;
  details: string;
  canSend: boolean;
}

/**
 * "Detective (element "Unknown", level "Unknown")" — the class as the secretary
 * sees it, plus the three values actually stored on it. Without the stored
 * triple the secretary cannot tell which of several similarly named classes is
 * the broken one, and those columns are not shown anywhere else in the app.
 */
function describeStoredClass(cls: UnmappableAKCClass): string {
  const parts = [
    cls.element ? `element "${cls.element}"` : 'no element',
    cls.level ? `level "${cls.level}"` : 'no level',
  ];
  if (cls.section) parts.push(`section "${cls.section}"`);
  return `${cls.className} (${parts.join(', ')})`;
}

export function buildAKCSubmissionReadiness(input: {
  entryCount: number;
  missingRegistrationNumberCount: number;
  unscoredEntryCount?: number;
  /** Classes with no AKC class code — see `collectUnmappableAKCClasses`. */
  unmappableClasses?: UnmappableAKCClass[];
}): AKCSubmissionReadiness {
  // MYK9-547 — first, because this one blocks the FILE, not just the send. A
  // class AKC has no code for used to be reported as Novice A; now no XML is
  // produced at all, so there is not even a draft to download.
  //
  // The copy names the stored element/level/section and the concrete fix,
  // because the secretary has no other way to see either: the class edit form
  // renders those three fields read-only, so "check the class setup" would
  // point at a screen that cannot change anything (docs/INTENT.md § Trial
  // Secretary — no technical error messages, name the next action).
  const unmappable = input.unmappableClasses ?? [];
  if (unmappable.length > 0) {
    const named = unmappable.map(describeStoredClass).join('; ');
    return {
      verdict:
        unmappable.length === 1
          ? `One class is not set up as an AKC class: ${named}.`
          : `${unmappable.length} classes are not set up as AKC classes: ${named}.`,
      details:
        // The exact gesture, named after the buttons and steps the secretary
        // will actually read: ClassManagementPage's "Add Classes" leads to
        // ClassCreationPage's "Create Classes", whose steps are "Select
        // Template" then "Choose Classes".
        `Delete ${unmappable.length === 1 ? 'this class' : 'these classes'}, then add ` +
        `${unmappable.length === 1 ? 'it' : 'them'} again: go to Classes, choose Add Classes, ` +
        `then on Create Classes pick the AKC template under Select Template and tick ` +
        `${unmappable.length === 1 ? 'the class' : 'each class'} under Choose Classes. If a ` +
        `class already has entries, move those entries to another class first. Results for this ` +
        `show cannot be sent to AKC, and no file can be prepared, until then.`,
      canSend: false,
    };
  }

  if (input.entryCount === 0) {
    return {
      verdict: 'No entries are ready to send yet.',
      details: 'Score entries first, then return here to prepare the AKC file.',
      canSend: false,
    };
  }

  // MYK9-323 — AKC's file has no code for "not scored yet", so an unscored dog
  // can only go out as NQ. That is a real, permanent record against a real dog,
  // so sending is blocked until every entry carries a result. The draft
  // download stays available so the secretary can see exactly which dogs.
  const unscored = input.unscoredEntryCount ?? 0;
  if (unscored > 0) {
    return {
      verdict: `${unscored} ${unscored === 1 ? 'entry has' : 'entries have'} no result recorded yet.`,
      details:
        'AKC has no code for an unscored run, so these would be submitted as NQ. Record a result (or mark the dog absent, excused, or withdrawn) for each one before sending.',
      canSend: false,
    };
  }

  if (input.missingRegistrationNumberCount > 0) {
    return {
      verdict: `${input.missingRegistrationNumberCount} ${
        input.missingRegistrationNumberCount === 1 ? 'entry needs' : 'entries need'
      } AKC registration ${input.missingRegistrationNumberCount === 1 ? 'number' : 'numbers'} before sending.`,
      details:
        'You can still download a draft XML file, but Send to AKC stays disabled until the missing registration numbers are added.',
      canSend: false,
    };
  }

  return {
    verdict: `${input.entryCount} ${input.entryCount === 1 ? 'entry is' : 'entries are'} ready to send to AKC.`,
    details: 'Submission file is ready to send or download.',
    canSend: true,
  };
}
