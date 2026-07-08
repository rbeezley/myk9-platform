export const AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS = {
  judgeName: 'Judge Name',
  containerQualifying: 'dogs received qualifying scores in the Container element',
  interiorQualifying: 'dogs received qualifying scores in the Interior element',
  exteriorQualifying: 'dogs received qualifying scores in the Exterior element',
  buriedQualifying: 'dogs received qualifying scores in the Buried element',
  handlerDiscriminationQualifying: 'dogs received qualifying scores in Handler Discrimination',
  detectiveQualifying: 'dogs received qualifying scores in the Detective Class',
  judgeTotalQualifying: 'Total number of dogs qualifying under me',
  totalEntries: 'total number of runs startersparticipants in the trial',
  totalRuns: 'total number of',
  totalWithdrawn: 'total number of qualifying scores',
  totalQualifying: 'undefined',
  eventNumber: 'Event Number',
  clubName: 'Club Name',
  eventDate: 'Event Date',
} as const;

export const AKC_SCENT_WORK_CERTIFICATION_PAGE_REQUIRED_FIELDS = Object.values(
  AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS
);
