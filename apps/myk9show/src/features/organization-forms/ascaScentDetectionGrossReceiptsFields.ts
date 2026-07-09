export const ASCA_SCENT_DETECTION_GROSS_RECEIPTS_FIELDS = {
  clubName: 'Name of Affiliate Club.0',
  eventDates: 'Event Dates',
  // Reserved for future use when Reports exposes a source-verified event location.
  eventLocation: 'Event Location',
} as const;

export const ASCA_SCENT_DETECTION_GROSS_RECEIPTS_REQUIRED_FIELDS = [
  ASCA_SCENT_DETECTION_GROSS_RECEIPTS_FIELDS.clubName,
  ASCA_SCENT_DETECTION_GROSS_RECEIPTS_FIELDS.eventDates,
] as const;
