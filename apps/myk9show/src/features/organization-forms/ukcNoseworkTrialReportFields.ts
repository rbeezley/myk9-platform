export const UKC_NOSEWORK_TRIAL_REPORT_FIELDS = {
  oneTrial: '1',
  twoOrMoreTrials: '2 only indicate if more than one Trial per day',
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
