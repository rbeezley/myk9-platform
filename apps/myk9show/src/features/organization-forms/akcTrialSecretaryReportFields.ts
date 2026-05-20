export const AKC_TRIAL_SECRETARY_REPORT_FIELDS = {
  club: 'Club',
  trialDate: 'TrialDate',
  eventNumber: 'EventNumber',
  totalRunsAtClosing: 'TotalRunsAtClosing',
  withdrawn: 'Withdrawn',
  runsPaid: 'RunsPaid',
  totalFee: 'TotalFee',
  trialSecretary: 'TrialSecretary',
} as const;

export const AKC_TRIAL_SECRETARY_REPORT_REQUIRED_FIELDS = [
  AKC_TRIAL_SECRETARY_REPORT_FIELDS.club,
  AKC_TRIAL_SECRETARY_REPORT_FIELDS.trialDate,
  AKC_TRIAL_SECRETARY_REPORT_FIELDS.eventNumber,
  AKC_TRIAL_SECRETARY_REPORT_FIELDS.totalRunsAtClosing,
  AKC_TRIAL_SECRETARY_REPORT_FIELDS.withdrawn,
  AKC_TRIAL_SECRETARY_REPORT_FIELDS.runsPaid,
  AKC_TRIAL_SECRETARY_REPORT_FIELDS.totalFee,
  AKC_TRIAL_SECRETARY_REPORT_FIELDS.trialSecretary,
] as const;
