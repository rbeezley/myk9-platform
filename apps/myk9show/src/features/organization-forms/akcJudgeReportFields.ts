export const AKC_JUDGE_REPORT_FIELDS = {
  location: 'Location',
  eventType: 'EventType',
  eventNumbers: 'EventNumbers',
  eventDates: 'EventDates',
  clubName: 'ClubName',
  judgeName: 'JudgeName',
  judgeEmail: 'JudgeEmail',
} as const;

// Required by the official PDF. Builders may leave human-entered fields blank;
// pdfFormCompleteness surfaces those before download.
export const AKC_JUDGE_REPORT_REQUIRED_FIELDS = [
  AKC_JUDGE_REPORT_FIELDS.location,
  AKC_JUDGE_REPORT_FIELDS.eventNumbers,
  AKC_JUDGE_REPORT_FIELDS.eventDates,
  AKC_JUDGE_REPORT_FIELDS.clubName,
  AKC_JUDGE_REPORT_FIELDS.judgeName,
  AKC_JUDGE_REPORT_FIELDS.judgeEmail,
] as const;
