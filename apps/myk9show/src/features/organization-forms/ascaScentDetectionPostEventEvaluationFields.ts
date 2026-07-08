export const ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS = {
  clubName: 'Name of Host Club',
  eventDate: 'Date of Event',
  dogsEntered: 'Number of dogs entered',
  handlers: 'Number of handlers',
  qualifyingRuns: 'Number of qualifying runs',
  nonQualifyingRuns: 'Nonqualifying runs',
  excusals: 'Excusals',
  signature: 'Signature',
} as const;

export const ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_REQUIRED_FIELDS = [
  ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.clubName,
  ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.eventDate,
  ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.dogsEntered,
  ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.handlers,
  ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.qualifyingRuns,
  ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.nonQualifyingRuns,
  ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.excusals,
] as const;
