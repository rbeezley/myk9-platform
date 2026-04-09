// packages/secretary/src/results/formatters/AKCScentWorkFormatter.ts

import type {
  ResultFormatter,
  SubmissionData,
  AKCSubmissionData,
  AKCSubmissionEntry,
} from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANADIAN_PROVINCES = new Set(['ON', 'AB', 'QC', 'NS', 'NB', 'MB', 'BC', 'PE', 'SK', 'NL']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape the five predefined XML entities. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

function mapPrimaryClass(level: string, section: string | null): string {
  const combined = section ? `${level} ${section}` : level;
  if (combined === 'Novice A') return 'SWNOVA';
  if (combined === 'Novice B') return 'SWNOVB';
  if (level.startsWith('Advanced')) return 'SWADV';
  if (level.startsWith('Excellent')) return 'SWEXC';
  if (level.startsWith('Master')) return 'SWMAST';
  if (level.startsWith('Detective') || level === 'Detective') return 'SWDC';
  return 'SWNOVA'; // safe fallback
}

function mapSecondaryClass(element: string): string {
  switch (element) {
    case 'Container':
      return 'CONTAINR';
    case 'Interior':
      return 'INTERIOR';
    case 'Exterior':
      return 'EXTERIOR';
    case 'Buried':
      return 'BURIED';
    case 'Handler Discrimination':
      return 'HANDDISC';
    default:
      return '';
  }
}

function mapResultCodes(entry: AKCSubmissionEntry): { actionCode: string; resultCode: string } {
  if (entry.entryStatus === 'withdrawn') return { actionCode: 'WHLD', resultCode: 'EXO' };
  if (entry.checkInStatus === 'absent') return { actionCode: 'ABSN', resultCode: 'A' };
  if (entry.resultStatus === 'disqualified') return { actionCode: 'DISQ', resultCode: 'A' };
  if (entry.resultStatus === 'excused') return { actionCode: 'EXCU', resultCode: 'EXO' };
  if (entry.finalPlacement != null && entry.finalPlacement >= 1 && entry.finalPlacement <= 4) {
    return { actionCode: 'PLAC', resultCode: String(entry.finalPlacement) };
  }
  if (entry.resultStatus === 'Q') return { actionCode: 'CNT', resultCode: 'Q' };
  // NQ, null result, or any other non-qualifying status
  return { actionCode: 'CNT', resultCode: 'NQ' };
}

// ---------------------------------------------------------------------------
// XML generation
// ---------------------------------------------------------------------------

function generateAKCXml(data: AKCSubmissionData): string {
  const lines: string[] = [];

  lines.push('<?xml version="1.0"?>');
  lines.push(
    `<sender xmlns="http://www.akc.org" schemaVersion="1.0"` +
      ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
      ` xsi:schemaLocation="http://www.akc.org electres.xsd"` +
      ` name="${esc(data.show.secretaryName ?? '')}"` +
      ` responseEmail="${esc(data.show.secretaryEmail ?? '')}">`
  );

  for (const trial of data.trials) {
    lines.push(
      `  <event akceventid="${esc(trial.eventNumber ?? '')}"` +
        ` clubName="${esc(data.show.clubName ?? '')}"` +
        ` eventDate="${esc(trial.date ?? '')}">`
    );

    const trialEntries = data.entries.filter(e => e.trialId === trial.id);
    const byClass = groupBy(trialEntries, e => e.classId);

    for (const [, classEntries] of byClass) {
      if (classEntries.length === 0) continue;
      const first = classEntries[0]!;
      const primaryClass = mapPrimaryClass(first.level, first.section);
      const secondaryClass = mapSecondaryClass(first.element);
      const courseTime = first.timeLimitSeconds != null ? `${first.timeLimitSeconds}.0` : '0.0';

      const numWithdrawals = classEntries.filter(e => e.entryStatus === 'withdrawn').length;
      const numEntries = classEntries.length - numWithdrawals;
      const numAbsent = classEntries.filter(e => e.checkInStatus === 'absent').length;
      const numStarters = numEntries - numAbsent;
      const numQualifying = classEntries.filter(
        e =>
          e.resultStatus === 'Q' ||
          (e.finalPlacement != null && e.finalPlacement >= 1 && e.finalPlacement <= 4)
      ).length;

      const secondaryAttr = secondaryClass ? ` secondaryClass="${secondaryClass}"` : '';
      lines.push(
        `    <class compGroup="SCWK"` +
          ` primaryClass="${primaryClass}"${secondaryAttr}` +
          ` breedCode="ALLB" gender="C"` +
          ` courseTime="${courseTime}"` +
          ` numEntries="${numEntries}"` +
          ` numStarters="${numStarters}"` +
          ` numQualifying="${numQualifying}"` +
          ` numWithdrawals="${numWithdrawals}">`
      );

      for (const entry of classEntries) {
        const { actionCode, resultCode } = mapResultCodes(entry);
        const searchTime = entry.searchTimeSeconds != null ? String(entry.searchTimeSeconds) : '0';
        const gender = entry.dogGender ?? 'B';
        const dogName = esc(entry.dogRegisteredName ?? entry.dogName);
        const akcNum = esc(entry.registrationNumber ?? '');

        lines.push(
          `      <results akcDogRegnum="${akcNum}"` +
            ` gender="${gender}"` +
            ` dogName="${dogName}"` +
            ` breedCode="ALLB"` +
            ` catalogNumber="${entry.armbandNumber}"` +
            ` courseTime="${searchTime}"` +
            ` actionCode="${actionCode}">`
        );
        lines.push(`        <resultCode>${esc(resultCode)}</resultCode>`);
        lines.push(`        <ownerName>${esc(entry.ownerName ?? '')}</ownerName>`);

        if (entry.ownerAddress) {
          const isCanadian = CANADIAN_PROVINCES.has(entry.ownerAddress.state ?? '');
          const stateTag = isCanadian ? 'ForeignState' : 'USState';
          const zipTag = isCanadian ? 'ForeignPostalCode' : 'USPostalCode';
          const zip = (entry.ownerAddress.zip ?? '').replace(/-/g, '');
          lines.push(`        <ownerAddress>`);
          lines.push(
            `          <addressLine>${esc(entry.ownerAddress.street ?? '')}</addressLine>`
          );
          lines.push(`          <city>${esc(entry.ownerAddress.city ?? '')}</city>`);
          lines.push(`          <${stateTag}>${esc(entry.ownerAddress.state ?? '')}</${stateTag}>`);
          lines.push(`          <${zipTag}>${esc(zip)}</${zipTag}>`);
          lines.push(`        </ownerAddress>`);
        }

        lines.push(`      </results>`);
      }

      lines.push(`    </class>`);
    }

    lines.push(`  </event>`);
  }

  lines.push(`</sender>`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

export const AKCScentWorkFormatter: ResultFormatter = {
  organization: 'AKC',
  sportType: 'scent_work',
  submissionEmail: 'results@akc.org', // confirm with AKC before launch
  formatXml(data: SubmissionData): string {
    return generateAKCXml(data as unknown as AKCSubmissionData);
  },
};
