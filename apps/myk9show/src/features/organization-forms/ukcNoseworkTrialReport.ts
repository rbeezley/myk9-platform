import { UKC_NOSEWORK_REPORT_FEE_PER_ENTRY } from '@/lib/reports/reportConstants';
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
    // UKC online-entry source is not tracked yet, so every current row remains due to UKC.
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

export function countUKCNoseworkEntries(entries: ReportEntry[]): UKCEntryCounts {
  return entries.reduce<UKCEntryCounts>(
    (counts, entry) => {
      counts.totalEntries += 1;

      // INTENT: paymentMethod is a myK9 collection method, not proof of UKC-hosted online entry.
      // Keep UKC online count at zero until a dedicated UKC source flag exists.
      if (entry.isDayOfShow === true) counts.dayOfShowEntries += 1;
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
