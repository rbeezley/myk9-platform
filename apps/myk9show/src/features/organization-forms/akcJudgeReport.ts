import type { ReportProps } from '@/lib/reports/types';
import type { PdfFormFillValues } from './pdfForm';
import { AKC_JUDGE_REPORT_FIELDS } from './akcJudgeReportFields';
import { formattedTrialDate, textOrUndefined, trialEventNumber } from './reportValueHelpers';

export function buildAKCJudgeReportValues(props: ReportProps): PdfFormFillValues {
  const text: NonNullable<PdfFormFillValues['text']> = {};

  const eventNumber = trialEventNumber(props);
  if (eventNumber) text[AKC_JUDGE_REPORT_FIELDS.eventNumbers] = eventNumber;

  const eventDate = formattedTrialDate(props);
  if (eventDate) text[AKC_JUDGE_REPORT_FIELDS.eventDates] = eventDate;

  const clubName = textOrUndefined(props.clubName);
  if (clubName) text[AKC_JUDGE_REPORT_FIELDS.clubName] = clubName;

  const judgeName = textOrUndefined(props.trial?.judgeName);
  if (judgeName) text[AKC_JUDGE_REPORT_FIELDS.judgeName] = judgeName;

  return {
    radioGroups: {
      [AKC_JUDGE_REPORT_FIELDS.eventType]: 'Trial',
    },
    text,
  };
}
