import { isSupersededMoveUpEntry } from '@/features/financial/moneyRoot';
import { UKC_NOSEWORK_REPORT_FEE_PER_ENTRY } from '@/lib/reports/reportConstants';
import { REPORT_ENTRY_SOURCE } from '@/lib/reports/types';
import type { ReportEntry, ReportProps, UKCTrialReportOfficial } from '@/lib/reports/types';
import type { PdfFormFillValues } from './pdfForm';
import { formattedTrialDate, textOrUndefined } from './reportValueHelpers';
import { UKC_NOSEWORK_TRIAL_REPORT_FIELDS } from './ukcNoseworkTrialReportFields';

interface OfficialFieldNames {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
}

const CHAIRPERSON_FIELD_PREFIX: OfficialFieldNames = {
  name: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.chairpersonName,
  address: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.chairpersonAddress,
  city: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.chairpersonCity,
  state: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.chairpersonState,
  zip: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.chairpersonZip,
  phone: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.chairpersonPhone,
  email: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.chairpersonEmail,
} as const;

const SECRETARY_FIELD_PREFIX: OfficialFieldNames = {
  name: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.secretaryName,
  address: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.secretaryAddress,
  city: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.secretaryCity,
  state: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.secretaryState,
  zip: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.secretaryZip,
  phone: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.secretaryPhone,
  email: UKC_NOSEWORK_TRIAL_REPORT_FIELDS.secretaryEmail,
} as const;

function addOfficial(
  text: NonNullable<PdfFormFillValues['text']>,
  fields: OfficialFieldNames,
  official: UKCTrialReportOfficial | null | undefined
): void {
  if (!official) return;
  if (official.name) text[fields.name] = official.name;
  if (official.streetAddress) text[fields.address] = official.streetAddress;
  if (official.city) text[fields.city] = official.city;
  if (official.state) text[fields.state] = official.state;
  if (official.zipCode) text[fields.zip] = official.zipCode;
  if (official.phone) text[fields.phone] = official.phone;
  if (official.email) text[fields.email] = official.email;
}

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

  const context = props.ukcTrialReportContext;
  if (context?.clubNumber) text[UKC_NOSEWORK_TRIAL_REPORT_FIELDS.clubId] = context.clubNumber;
  if (context?.venueCity) text[UKC_NOSEWORK_TRIAL_REPORT_FIELDS.city] = context.venueCity;
  if (context?.venueState) text[UKC_NOSEWORK_TRIAL_REPORT_FIELDS.state] = context.venueState;
  addOfficial(text, CHAIRPERSON_FIELD_PREFIX, context?.chairperson);
  addOfficial(text, SECRETARY_FIELD_PREFIX, context?.secretary);

  // `trials.actual_start_time`/`actual_end_time` are TEXT columns holding an
  // already-formatted display string ("9:00 AM" — see 073_trial_field_sync.sql
  // and TrialEditPanel's free-text input), never an ISO timestamp. Printing it
  // as typed is correct; running it through `new Date(...)` (as an earlier
  // version of this builder did via `formatTime`) parses "9:00 AM" as Invalid
  // Date and silently blanks both fields on every real trial (MYK9-828 review).
  const timeTrialStarted = textOrUndefined(props.trial?.actualStartTime);
  if (timeTrialStarted) text[UKC_NOSEWORK_TRIAL_REPORT_FIELDS.timeTrialStarted] = timeTrialStarted;
  const conclusionOfLastClass = textOrUndefined(props.trial?.actualEndTime);
  if (conclusionOfLastClass) {
    text[UKC_NOSEWORK_TRIAL_REPORT_FIELDS.conclusionOfLastClass] = conclusionOfLastClass;
  }

  return {
    checkboxes: {
      // INTENT: Each trial's report ticks its own trial number for the day
      // (MYK9-827, owner decision 2026-09-26), matching the printed header
      // "TRIAL [ ]1 [ ]2 (only indicate if more than one Trial per day)". A
      // single-trial day has no `dayTrialNumber` and ticks neither box, and a
      // third same-day trial has no box to tick, so it also ticks neither.
      ...(trialNumberCheckbox(props.trial?.dayTrialNumber) ?? {}),
    },
    text,
  };
}

function trialNumberCheckbox(dayTrialNumber: number | undefined): Record<string, boolean> | null {
  if (dayTrialNumber === 1) return { [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.trialNumberOne]: true };
  if (dayTrialNumber === 2) return { [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.trialNumberTwo]: true };
  return null;
}

export function countUKCNoseworkEntries(entries: ReportEntry[]): UKCEntryCounts {
  return entries.reduce<UKCEntryCounts>(
    (counts, entry) => {
      // MYK9-639: the superseded half of a move-up is not a second run, so it
      // is not a second UKC recording fee. Deliberately just this one state:
      // whether `withdrawn` / `scratched` / `absent` are billable is MYK9-317
      // and MYK9-445, and nothing here changes how they are counted.
      if (isSupersededMoveUpEntry(entry)) return counts;

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
