import { UKC_NOSEWORK_REPORT_FEE_PER_ENTRY } from '@/lib/reports/reportConstants';
import { REPORT_ENTRY_SOURCE } from '@/lib/reports/types';
import type { ReportEntry, ReportProps } from '@/lib/reports/types';
import type { PdfFormFillValues } from './pdfForm';
import { formattedTrialDate, textOrUndefined } from './reportValueHelpers';
import { UKC_NOSEWORK_TRIAL_REPORT_FIELDS } from './ukcNoseworkTrialReportFields';

export interface UKCEntryCounts {
  dayOfShowEntries: number;
  onlineEntries: number;
  preEntries: number;
  totalEntries: number;
}

export function buildUKCNoseworkTrialReportValues(props: ReportProps): PdfFormFillValues {
  const counts = countUKCNoseworkEntries(props.entries);
  const text: NonNullable<PdfFormFillValues['text']> = {
    [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.onlineEntries]: counts.onlineEntries,
    [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.onlineSubtotal]: formatUKCFee(
      counts.onlineEntries * UKC_NOSEWORK_REPORT_FEE_PER_ENTRY
    ),
    [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.preEntries]: counts.preEntries,
    [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.preEntrySubtotal]: formatUKCFee(
      counts.preEntries * UKC_NOSEWORK_REPORT_FEE_PER_ENTRY
    ),
    [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.dayOfShowEntries]: counts.dayOfShowEntries,
    [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.dayOfShowSubtotal]: formatUKCFee(
      counts.dayOfShowEntries * UKC_NOSEWORK_REPORT_FEE_PER_ENTRY
    ),
    [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.totalEntries]: counts.totalEntries,
    [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.grandTotalDue]: formatUKCFee(
      (counts.preEntries + counts.dayOfShowEntries) * UKC_NOSEWORK_REPORT_FEE_PER_ENTRY
    ),
  };

  const eventDate = formattedTrialDate(props);
  if (eventDate) text[UKC_NOSEWORK_TRIAL_REPORT_FIELDS.eventDate] = eventDate;

  const clubName = textOrUndefined(props.clubName);
  if (clubName) text[UKC_NOSEWORK_TRIAL_REPORT_FIELDS.clubName] = clubName;

  return {
    checkboxes: {
      // INTENT: This builder fills one trial at a time; show-level downloads should choose explicitly.
      [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.oneTrial]: true,
    },
    text,
  };
}

/**
 * The superseded half of a move-up (MYK9-639). The dog runs once; the
 * destination entry carries the fee, so counting the vacated source too would
 * bill UKC for a second run that never happened -- and would put this report
 * back into disagreement with the Financial Report, which excludes the same
 * state.
 *
 * Deliberately just this one status. Whether `withdrawn` / `scratched` /
 * `absent` belong in a registry report's billable count is MYK9-317 and
 * MYK9-445, which own that question for the AKC report; nothing here changes
 * how they are counted.
 */
const UKC_SUPERSEDED_ENTRY_STATUS = 'moved';

export function countUKCNoseworkEntries(entries: ReportEntry[]): UKCEntryCounts {
  return entries.reduce<UKCEntryCounts>(
    (counts, entry) => {
      if (entry.entryStatus?.trim().toLowerCase() === UKC_SUPERSEDED_ENTRY_STATUS) return counts;

      counts.totalEntries += 1;

      // INTENT: paymentMethod is a myK9 collection method. Only entrySource proves UKC collected it.
      if (entry.entrySource === REPORT_ENTRY_SOURCE.UKC_ONLINE) counts.onlineEntries += 1;
      else if (entry.isDayOfShow === true) counts.dayOfShowEntries += 1;
      else counts.preEntries += 1;

      return counts;
    },
    {
      dayOfShowEntries: 0,
      onlineEntries: 0,
      preEntries: 0,
      totalEntries: 0,
    }
  );
}

function formatUKCFee(amount: number): string {
  return amount.toFixed(2);
}
