import { livePremiumTrials, type PremiumScheduleTrialRow } from './liveTrials.ts';

/**
 * MYK9-2186: what Regenerate reads from the show's trials (template choice and the narrative
 * input). Both use the live trials only, so a cancelled or soft-deleted trial never steers the
 * template or appears in the narrative.
 */

/** The trial type of the first live trial, which picks the club's premium template. */
export function premiumTemplateTrialType(trials: unknown): string | null {
  return (
    livePremiumTrials(
      trials as Array<PremiumScheduleTrialRow & { trial_type: string | null }> | null
    )[0]?.trial_type ?? null
  );
}

export function formatDateForPrompt(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return 'TBD';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  // Always emit as a human-readable date with no time component. The narratives
  // are general-purpose, and including raw UTC timestamps caused Claude to
  // hallucinate phrases like "1:00 PM UTC" that exhibitors don't think in.
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function buildShowSummary(show: Record<string, unknown>): string {
  const trials = livePremiumTrials(
    (show.trials as Array<{
      status?: string | null;
      deleted_at?: string | null;
      name: string;
      date: string;
      trial_type: string | null;
      classes: Array<{ name: string; level: string | null; element: string | null }>;
    }>) ?? []
  );

  const trialLines = trials.map(t => {
    const classNames = (t.classes ?? [])
      .map(c => [c.level, c.element, c.name].filter(Boolean).join(' '))
      .join(', ');
    return `  - ${t.name} (${formatDateForPrompt(t.date)}): ${t.trial_type ?? 'unknown type'} — classes: ${classNames || 'none'}`;
  });

  return [
    `Show: ${show.name}`,
    `Organization: ${show.organization ?? 'AKC'}`,
    `Dates: ${formatDateForPrompt(show.start_date)} to ${formatDateForPrompt(show.end_date)}`,
    `Location: ${show.location ?? 'TBD'}`,
    `Entry opens: ${formatDateForPrompt(show.entry_open_date)}, closes: ${formatDateForPrompt(show.entry_close_date)}`,
    `Pre-entry fee: $${show.pre_entry_fee ?? 'TBD'}, day-of fee: $${show.day_of_show_fee ?? 'TBD'}`,
    `Payment: checks=${show.accept_check_payments}, cash=${show.accept_cash_payments}`,
    `Trials:\n${trialLines.join('\n')}`,
    'Note: Do not invent specific clock times or timezones in the narrative — only mention times if explicitly provided above.',
  ].join('\n');
}
