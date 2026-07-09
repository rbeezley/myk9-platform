import type { ReportEntry, ReportProps } from '@/lib/reports/types';
import type { PdfFormFillValues } from './pdfForm';
import { formattedTrialDate, textOrUndefined } from './reportValueHelpers';
import { ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS } from './ascaScentDetectionPostEventEvaluationFields';

const QUALIFYING_RESULT_CODES = new Set(['q', 'qualifying', 'qualified']);
const NON_QUALIFYING_RESULT_CODES = new Set(['nq', 'non-qualifying', 'nonqualifying']);
const EXCUSAL_RESULT_CODES = new Set(['e', 'ex', 'excused', 'excusal']);

export function buildASCAScentDetectionPostEventEvaluationValues(
  props: ReportProps
): PdfFormFillValues {
  const counts = countASCAPostEventRuns(props.entries);
  const text: NonNullable<PdfFormFillValues['text']> = {
    [ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.dogsEntered]: countDistinctDogs(
      props.entries
    ),
    [ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.handlers]: countDistinctHandlers(
      props.entries
    ),
    [ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.qualifyingRuns]: counts.qualifyingRuns,
    [ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.nonQualifyingRuns]: counts.nonQualifyingRuns,
    [ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.excusals]: counts.excusals,
  };

  const clubName = textOrUndefined(props.clubName);
  if (clubName) text[ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.clubName] = clubName;

  const eventDate = textOrUndefined(props.showDates) ?? formattedTrialDate(props);
  if (eventDate) text[ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.eventDate] = eventDate;

  return { text };
}

interface ASCAPostEventRunCounts {
  excusals: number;
  nonQualifyingRuns: number;
  qualifyingRuns: number;
}

export function countASCAPostEventRuns(entries: ReportEntry[]): ASCAPostEventRunCounts {
  return entries.reduce<ASCAPostEventRunCounts>(
    (counts, entry) => {
      const result = normalizedResult(entry);
      if (QUALIFYING_RESULT_CODES.has(result)) counts.qualifyingRuns += 1;
      else if (NON_QUALIFYING_RESULT_CODES.has(result)) counts.nonQualifyingRuns += 1;
      else if (EXCUSAL_RESULT_CODES.has(result)) counts.excusals += 1;
      return counts;
    },
    {
      excusals: 0,
      nonQualifyingRuns: 0,
      qualifyingRuns: 0,
    }
  );
}

function countDistinctDogs(entries: ReportEntry[]): number {
  return new Set(entries.map(entry => entry.dogId ?? entry.callName).filter(Boolean)).size;
}

function countDistinctHandlers(entries: ReportEntry[]): number {
  return new Set(entries.map(entry => entry.handler.trim()).filter(Boolean)).size;
}

function normalizedResult(entry: ReportEntry): string {
  return (entry.resultText ?? '').trim().toLowerCase();
}
