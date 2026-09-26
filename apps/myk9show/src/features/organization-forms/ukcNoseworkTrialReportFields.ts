export const UKC_NOSEWORK_TRIAL_REPORT_FIELDS = {
  // These tick the trial's own NUMBER for the day (1 or 2), not a trial COUNT
  // (MYK9-827) -- the printed header reads "TRIAL [ ]1 [ ]2 (only indicate if
  // more than one Trial per day)".
  trialNumberOne: '1',
  trialNumberTwo: '2 only indicate if more than one Trial per day',
  eventDate: 'EVENT DATE',
  clubName: 'Club Name do not abbreviate',
  clubId: 'Club ID',
  city: 'City',
  state: 'State',
  onlineEntries: 'Number of UKC Online Entries',
  onlineSubtotal: 'x 400 Subtotal Paid Online',
  preEntries: 'Number of PreEntries',
  preEntrySubtotal: 'X 4 Sub Total',
  timeTrialStarted: 'Time Trial Started',
  dayOfShowEntries: 'Number of DayOfShow Entries',
  dayOfShowSubtotal: 'X 4 Sub Total_2',
  conclusionOfLastClass: 'Conclusion of Last Class',
  totalEntries: 'Total Entries',
  grandTotalDue: 'Grand Total due to UKC',
} as const;

export const UKC_NOSEWORK_TRIAL_REPORT_REQUIRED_FIELDS = [
  UKC_NOSEWORK_TRIAL_REPORT_FIELDS.eventDate,
  UKC_NOSEWORK_TRIAL_REPORT_FIELDS.clubName,
  UKC_NOSEWORK_TRIAL_REPORT_FIELDS.preEntries,
  UKC_NOSEWORK_TRIAL_REPORT_FIELDS.dayOfShowEntries,
  UKC_NOSEWORK_TRIAL_REPORT_FIELDS.totalEntries,
  UKC_NOSEWORK_TRIAL_REPORT_FIELDS.grandTotalDue,
] as const;
