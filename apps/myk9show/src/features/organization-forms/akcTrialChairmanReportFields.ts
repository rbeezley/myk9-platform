export const AKC_TRIAL_CHAIRMAN_REPORT_FIELDS = {
  telephone: 'Telephone',
  email: 'Email',
  trialDates: 'TrialDates',
  eventNumbers: 'EventNumbers',
  clubName: 'ClubName',
  trialChair: 'TrialChair',
  judge1: 'Judge1',
  judge2: 'Judge2',
  judge3: 'Judge3',
  judge4: 'Judge4',
} as const;

export const AKC_TRIAL_CHAIRMAN_REPORT_REQUIRED_FIELDS = [
  AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.trialDates,
  AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.eventNumbers,
  AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.clubName,
  AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.trialChair,
] as const;
