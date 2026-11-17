/**
 * The one sentence an exhibitor's own result reads as: "Qualified, 0:52.40, 2nd of 14".
 * My Shows and Ringside both render it (MYK9-2138), so the two cannot word it differently.
 *
 * A placement is claimed only once the class is released (the MYK9-263 rule, read through
 * `deriveResultReleaseDisplay`); an unreleased result carries no placement and is flagged
 * `isPreliminary` so the surface appends its "preliminary" word.
 *
 * "Of N" is the number of dogs that ran: `classes.scored_count`, the server-kept count of
 * scored entries. Absent, withdrawn, scratched and pulled dogs are never scored, so they are
 * not in it. The exhibitor's own screens hold only their own entries, so they cannot count
 * the class themselves. When the count is unknown the line says the place alone.
 *
 * @module features/result-card/ownResultLine
 */
import { resultStatusLabel } from '@/components/common/resultStatusLabel';
import { deriveResultReleaseDisplay } from './resultReleaseDisplay';
import { formatOrdinal } from './resultCardModel';

export interface OwnResultLineInput {
  resultStatus: string | null | undefined;
  searchTimeSeconds: number | null | undefined;
  finalPlacement: number | null | undefined;
  resultsReleasedAt: string | null | undefined;
  /** Dogs that ran in the class (`classes.scored_count`); null or 0 when unknown. */
  ranCount: number | null | undefined;
}

export interface OwnResultLine {
  text: string;
  isPreliminary: boolean;
}

// absent and withdrawn keep the badge abbreviations (ABS, WD): a scored WD result must never read
// as the entry's own withdrawn lifecycle.
const STATUS_WORDS: Record<string, string> = {
  qualified: 'Qualified',
  nq: 'Did not qualify',
  non_qualifying: 'Did not qualify',
  excused: 'Excused',
  disqualified: 'Disqualified',
};

/** 52.4 becomes "0:52.40"; 125.5 becomes "2:05.50". */
export function formatResultTime(seconds: number): string {
  const totalCentis = Math.round(seconds * 100);
  const minutes = Math.floor(totalCentis / 6000);
  const rest = totalCentis - minutes * 6000;
  const whole = Math.floor(rest / 100);
  const centis = rest % 100;
  return `${minutes}:${String(whole).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

/** The line for a result that has a status, or null when there is nothing to say. */
export function formatOwnResultLine(input: OwnResultLineInput): OwnResultLine | null {
  const status = input.resultStatus;
  if (!status || status === 'pending') return null;
  const release = deriveResultReleaseDisplay({
    resultsReleasedAt: input.resultsReleasedAt,
    resultStatus: status,
    finalPlacement: input.finalPlacement,
  });
  const parts = [STATUS_WORDS[status] ?? resultStatusLabel(status)];
  const seconds = input.searchTimeSeconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) {
    parts.push(formatResultTime(seconds));
  }
  if (release.placement != null) {
    const ran = input.ranCount;
    parts.push(
      ran != null && ran >= release.placement
        ? `${formatOrdinal(release.placement)} of ${ran}`
        : formatOrdinal(release.placement)
    );
  }
  return { text: parts.join(', '), isPreliminary: release.isPreliminary };
}
