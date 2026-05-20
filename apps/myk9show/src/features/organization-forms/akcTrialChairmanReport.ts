import type { ReportProps } from '@/lib/reports/types';
import type { PdfFormFillValues } from './pdfForm';
import { AKC_TRIAL_CHAIRMAN_REPORT_FIELDS } from './akcTrialChairmanReportFields';
import {
  formattedTrialDate,
  textOrUndefined,
  trialEventNumber,
  uniqueTrialJudgeNames,
} from './reportValueHelpers';

const JUDGE_FIELDS = [
  AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge1,
  AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge2,
  AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge3,
  AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge4,
] as const;

export function buildAKCTrialChairmanReportValues(props: ReportProps): PdfFormFillValues {
  const text: NonNullable<PdfFormFillValues['text']> = {};

  const trialDate = formattedTrialDate(props);
  if (trialDate) text[AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.trialDates] = trialDate;

  const eventNumber = trialEventNumber(props);
  if (eventNumber) text[AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.eventNumbers] = eventNumber;

  const clubName = textOrUndefined(props.clubName);
  if (clubName) text[AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.clubName] = clubName;

  for (const [index, judgeName] of uniqueTrialJudgeNames(props)
    .slice(0, JUDGE_FIELDS.length)
    .entries()) {
    const field = JUDGE_FIELDS[index];
    if (field) text[field] = judgeName;
  }

  return { text };
}
