import type { ReportProps } from '@/lib/reports/types';
import type { PdfFormFillValues } from './pdfForm';
import { formattedTrialDate, textOrUndefined } from './reportValueHelpers';
import { ASCA_SCENT_DETECTION_GROSS_RECEIPTS_FIELDS } from './ascaScentDetectionGrossReceiptsFields';

export function buildASCAScentDetectionGrossReceiptsValues(props: ReportProps): PdfFormFillValues {
  const text: NonNullable<PdfFormFillValues['text']> = {};

  const clubName = textOrUndefined(props.clubName);
  if (clubName) text[ASCA_SCENT_DETECTION_GROSS_RECEIPTS_FIELDS.clubName] = clubName;

  const eventDates = textOrUndefined(props.showDates) ?? formattedTrialDate(props);
  if (eventDates) text[ASCA_SCENT_DETECTION_GROSS_RECEIPTS_FIELDS.eventDates] = eventDates;

  // INTENT: The gross-receipts PDF uses generic field names for the fee grid.
  // Leave those rows blank until ASCA fee-row semantics are source-verified.
  return { text };
}
