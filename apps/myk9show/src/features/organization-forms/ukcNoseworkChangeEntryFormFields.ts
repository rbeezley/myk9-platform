export const UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS = {
  hostClub: 'Host Club',
  date: 'Date',
  breed: 'Breed',
  variety: 'Variety',
  sex: 'Sex',
  armband: 'Armband Number',
  registrationNumber: 'UKC Reg',
  dogName: 'Dogs Name',
  classChange: 'Class Change',
  moveFrom: 'Move from',
  moveInto: 'Into',
  entryCorrection: 'Entry Correction',
  correctionLine1: 'Correct my entry as follows 1',
  correctionLine2: 'Correct my entry as follows 2',
  startingDate: 'Starting on the following date',
  ownerName: 'Owners Name',
} as const;

export const UKC_NOSEWORK_CHANGE_ENTRY_FORM_REQUIRED_FIELDS = [
  UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.hostClub,
  UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.date,
  UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.breed,
  UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.sex,
  UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.armband,
  UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.registrationNumber,
  UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.dogName,
  UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.ownerName,
] as const;
