export const AKC_SCENT_WORK_TRANSFER_FORM_FIELDS = {
  date: 'Date',
  breed: 'Breed',
  sex: 'Sex',
  authorizedAgent: 'authorized to make this entry',
  classFrom: 'ClassFrom',
  classTo: 'ClassTo',
  registeredName: 'RegisteredName',
  club: 'Club',
  akcNumber: 'AKCNumber',
  requestDate: 'Date2',
  requestTime: 'Time',
  ownerName: 'OwnerName',
  trialSecretary: 'TrialSecretary',
} as const;

export const AKC_SCENT_WORK_TRANSFER_FORM_REQUIRED_FIELDS = [
  AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.date,
  AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.breed,
  AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.sex,
  AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.classFrom,
  AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.registeredName,
  AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.club,
  AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.akcNumber,
  AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.ownerName,
  AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.trialSecretary,
] as const;
