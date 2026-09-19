/**
 * MYK9-642 end to end, in the only place it is visible to a club: the UKC
 * Nosework Trial Report's two entry counts.
 *
 * The unit tests either side of this one prove the rule and prove the writers
 * call it. This one proves the consequence the issue was filed about — that a
 * mail-in taken on show day after entries closed is certified to UKC as a
 * day-of-show entry, not as a pre-entry — by running the real report builder
 * over entries whose `isDayOfShow` comes from the shared rule rather than from
 * a hand-picked boolean.
 */

import { describe, expect, it } from 'vitest';
import type { ReportEntry, ReportProps } from '@/lib/reports/types';
import {
  buildUKCNoseworkTrialReportValues,
  countUKCNoseworkEntries,
} from '@/features/organization-forms/ukcNoseworkTrialReport';
import { UKC_NOSEWORK_TRIAL_REPORT_FIELDS } from '@/features/organization-forms/ukcNoseworkTrialReportFields';
import { summarizeShowDayReconciliation } from '@/features/show-workbench/showDayReconciliationSummary';
import { isDayOfShowEntry } from '../isDayOfShowEntry';

/** The show from the MYK9-642 reproduction. */
const SHOW = {
  startDate: '2026-09-17T00:00:00+00:00',
  entryCloseDate: '2026-09-10T00:00:00+00:00',
  timeZone: 'America/New_York',
};

const baseEntry = {
  armband: '101',
  breed: 'Beagle',
  callName: 'Rocket',
  checkInStatus: null,
  finalPlacement: null,
  handler: 'Jamie Walker',
  isScored: false,
  registrationNumber: null,
  resultText: null,
  runOrder: 1,
  searchTimeSeconds: null,
  section: null,
  totalFaults: null,
} satisfies Omit<ReportEntry, 'id'>;

/** An entry recorded at `submittedOn`, bucketed by the shared rule. */
function entrySubmittedOn(id: string, submittedOn: string): ReportEntry {
  return {
    ...baseEntry,
    id,
    isDayOfShow: isDayOfShowEntry({ ...SHOW, now: new Date(`${submittedOn}T16:00:00Z`) }),
  };
}

function reportProps(entries: ReportEntry[]): ReportProps {
  return {
    clubName: 'Demo Nosework Club',
    entries,
    showName: 'Demo UKC Trial',
    sortOrder: '',
    trial: {
      date: '2026-09-17',
      judgeName: 'Pat Judge',
      trialNumber: '2026123401',
    },
  } as ReportProps;
}

describe('UKC Nosework Trial Report counts follow the shared day-of-show rule', () => {
  it('counts the show-day mail-in under DayOfShow, not PreEntries', () => {
    const values = buildUKCNoseworkTrialReportValues(
      reportProps([entrySubmittedOn('mail-in-on-show-day', '2026-09-17')])
    );

    // The exact AcroForm fields the issue quoted, which read
    // PreEntries = 1 / DayOfShow = 0 before the fix.
    expect(values.text?.[UKC_NOSEWORK_TRIAL_REPORT_FIELDS.preEntries]).toBe(0);
    expect(values.text?.[UKC_NOSEWORK_TRIAL_REPORT_FIELDS.dayOfShowEntries]).toBe(1);
    expect(values.text?.[UKC_NOSEWORK_TRIAL_REPORT_FIELDS.totalEntries]).toBe(1);
  });

  it('splits a mixed trial across both buckets on the entry-close boundary', () => {
    const counts = countUKCNoseworkEntries([
      entrySubmittedOn('pre-early', '2026-09-01'),
      entrySubmittedOn('pre-on-close-date', '2026-09-10'),
      entrySubmittedOn('day-of-after-close', '2026-09-11'),
      entrySubmittedOn('day-of-show-day', '2026-09-17'),
    ]);

    expect(counts).toEqual({
      preEntries: 2,
      dayOfShowEntries: 2,
      onlineEntries: 0,
      totalEntries: 4,
    });
  });
});

describe('The Show Closeout money card follows the same rule (MYK9-642 N-F5)', () => {
  // `summarizeShowDayReconciliation` is pure and never sees which writer
  // produced a row, so a fixture with the flag already set proves nothing about
  // MYK9-642 — that was the round-2 finding, and deleting that test left the
  // widening with no executable record at all.
  //
  // This is the record: the flag is DERIVED here by the shared rule, at the
  // instant the widening is about (after entries closed, weeks before the show
  // starts), so the card's count moves if and only if the rule says day-of.
  // Flip `>` to `>=` on the close boundary, or revert the rule to start-date
  // only, and this goes red.
  const entryAt = (submittedOn: string, fee: number) => ({
    id: `entry-${submittedOn}`,
    is_day_of_show: isDayOfShowEntry({ ...SHOW, now: new Date(`${submittedOn}T16:00:00Z`) }),
    entry_fee: fee,
    payment_status: 'paid',
    payment_method: 'check',
  });

  it('counts a mail-in taken after entries closed, weeks before the show', () => {
    // Entries closed 2026-09-10; this is keyed on the 11th, six days before the
    // show runs. Nobody took this money at the desk — which is what MYK9-677
    // asks about — but the registry bucket says day-of, and this card reads the
    // registry bucket.
    const summary = summarizeShowDayReconciliation([entryAt('2026-09-11', 35)]);

    expect(summary.lateEntryCount).toBe(1);
    expect(summary.collectedAmount).toBe(35);
  });

  it('leaves a genuine pre-entry out of the desk totals', () => {
    // The positive control: same writer, same card, one day earlier — the close
    // date itself, when entries are still open.
    const summary = summarizeShowDayReconciliation([entryAt('2026-09-10', 30)]);

    expect(summary.lateEntryCount).toBe(0);
    expect(summary.collectedAmount).toBe(0);
    expect(summary.totalEntryCount).toBe(1);
  });
});
