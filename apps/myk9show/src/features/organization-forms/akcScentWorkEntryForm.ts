import type { EntryFormDog, EntryFormTrial } from '@/lib/reports/entryFormTypes';
import { buildClassGrid } from '@/lib/reports/entryFormUtils';
import type { PdfFormFillValues } from './pdfForm';
import { AKC_SCENT_WORK_ENTRY_FORM_FIELDS } from './akcScentWorkEntryFormFields';

type EntryGridLevel = 'Novice' | 'Advanced' | 'Excellent' | 'Master';
type EntryGridElement =
  | 'Container'
  | 'Interior'
  | 'Exterior'
  | 'Buried'
  | 'Handler Discrimination';

type EntryGridRow = Record<EntryGridElement, Record<EntryGridLevel, string>> & {
  Detective: string;
};

const ENTRY_GRID_ROWS: readonly EntryGridRow[] = [
  {
    Container: {
      Novice: 'Novice A  B',
      Advanced: 'Advanced',
      Excellent: 'Excellent',
      Master: 'Master',
    },
    Interior: {
      Novice: 'Novice A  B_2',
      Advanced: 'Advanced_2',
      Excellent: 'Excellent_2',
      Master: 'Master_2',
    },
    Exterior: {
      Novice: 'Novice A  B_3',
      Advanced: 'Advanced_3',
      Excellent: 'Excellent_3',
      Master: 'Master_3',
    },
    Buried: {
      Novice: 'Novice A  B_4',
      Advanced: 'Advanced_4',
      Excellent: 'Excellent_4',
      Master: 'Master_4',
    },
    'Handler Discrimination': {
      Novice: 'Novice A  B_5',
      Advanced: 'Advanced_5',
      Excellent: 'Excellent_5',
      Master: 'Master_5',
    },
    Detective: 'Detect iveNovice A  B Advanced Excellent Master',
  },
  {
    Container: {
      Novice: 'Novice A  B_6',
      Advanced: 'Advanced_6',
      Excellent: 'Excellent_6',
      Master: 'Master_6',
    },
    Interior: {
      Novice: 'Novice A  B_7',
      Advanced: 'Advanced_7',
      Excellent: 'Excellent_7',
      Master: 'Master_7',
    },
    Exterior: {
      Novice: 'Novice A  B_8',
      Advanced: 'Advanced_8',
      Excellent: 'Excellent_8',
      Master: 'Master_8',
    },
    Buried: {
      Novice: 'Novice A  B_9',
      Advanced: 'Advanced_9',
      Excellent: 'Excellent_9',
      Master: 'Master_9',
    },
    'Handler Discrimination': {
      Novice: 'Novice A  B_10',
      Advanced: 'Advanced_10',
      Excellent: 'Excellent_10',
      Master: 'Master_10',
    },
    Detective: 'Detect iveNovice A  B Advanced Excellent Master_2',
  },
  {
    Container: {
      Novice: 'Novice A  B_11',
      Advanced: 'Advanced_11',
      Excellent: 'Excellent_11',
      Master: 'Master_11',
    },
    Interior: {
      Novice: 'Novice A  B_12',
      Advanced: 'Advanced_12',
      Excellent: 'Excellent_12',
      Master: 'Master_12',
    },
    Exterior: {
      Novice: 'Novice A  B_13',
      Advanced: 'Advanced_13',
      Excellent: 'Excellent_13',
      Master: 'Master_13',
    },
    Buried: {
      Novice: 'Novice A  B_14',
      Advanced: 'Advanced_14',
      Excellent: 'Excellent_14',
      Master: 'Master_14',
    },
    'Handler Discrimination': {
      Novice: 'Novice A  B_15',
      Advanced: 'Advanced_15',
      Excellent: 'Excellent_15',
      Master: 'Master_15',
    },
    Detective: 'Detect iveNovice A  B Advanced Excellent Master_3',
  },
  {
    Container: {
      Novice: 'Novice A  B_16',
      Advanced: 'Advanced_16',
      Excellent: 'Excellent_16',
      Master: 'Master_16',
    },
    Interior: {
      Novice: 'Novice A  B_17',
      Advanced: 'Advanced_17',
      Excellent: 'Excellent_17',
      Master: 'Master_17',
    },
    Exterior: {
      Novice: 'Novice A  B_18',
      Advanced: 'Advanced_18',
      Excellent: 'Excellent_18',
      Master: 'Master_18',
    },
    Buried: {
      Novice: 'Novice A  B_19',
      Advanced: 'Advanced_19',
      Excellent: 'Excellent_19',
      Master: 'Master_19',
    },
    'Handler Discrimination': {
      Novice: 'Novice A  B_20',
      Advanced: 'Advanced_20',
      Excellent: 'Excellent_20',
      Master: 'Master_20',
    },
    Detective: 'Detect iveNovice A  B Advanced Excellent Master_4',
  },
  {
    Container: {
      Novice: 'Novice A  B_21',
      Advanced: 'Advanced_21',
      Excellent: 'Excellent_21',
      Master: 'Master_21',
    },
    Interior: {
      Novice: 'Novice A  B_22',
      Advanced: 'Advanced_22',
      Excellent: 'Excellent_22',
      Master: 'Master_22',
    },
    Exterior: {
      Novice: 'Novice A  B_23',
      Advanced: 'Advanced_23',
      Excellent: 'Excellent_23',
      Master: 'Master_23',
    },
    Buried: {
      Novice: 'Novice A  B_24',
      Advanced: 'Advanced_24',
      Excellent: 'Excellent_24',
      Master: 'Master_24',
    },
    'Handler Discrimination': {
      Novice: 'Novice A  B_25',
      Advanced: 'Advanced_25',
      Excellent: 'Excellent_25',
      Master: 'Master_25',
    },
    Detective: 'Detect iveNovice A  B Advanced Excellent Master_5',
  },
  {
    Container: {
      Novice: 'Novice A  B_28',
      Advanced: 'Advanced_28',
      Excellent: 'Excellent_28',
      Master: 'Master_28',
    },
    Interior: {
      Novice: 'Novice A  B_29',
      Advanced: 'Advanced_29',
      Excellent: 'Excellent_29',
      Master: 'Master_29',
    },
    Exterior: {
      Novice: 'Novice A  B_30',
      Advanced: 'Advanced_30',
      Excellent: 'Excellent_30',
      Master: 'Master_30',
    },
    Buried: {
      Novice: 'Novice A  B_26',
      Advanced: 'Advanced_26',
      Excellent: 'Excellent_26',
      Master: 'Master_26',
    },
    'Handler Discrimination': {
      Novice: 'Novice A  B_27',
      Advanced: 'Advanced_27',
      Excellent: 'Excellent_27',
      Master: 'Master_27',
    },
    Detective: 'Detect iveNovice A  B Advanced Excellent Master_6',
  },
] as const;

const GRID_ELEMENTS: readonly EntryGridElement[] = [
  'Container',
  'Interior',
  'Exterior',
  'Buried',
  'Handler Discrimination',
] as const;

const GRID_LEVELS: readonly EntryGridLevel[] = ['Novice', 'Advanced', 'Excellent', 'Master'];

export function buildAKCScentWorkEntryFormValues(input: {
  dog: EntryFormDog;
  trials: EntryFormTrial[];
}): PdfFormFillValues {
  const { dog, trials } = input;
  const text: NonNullable<PdfFormFillValues['text']> = {};
  const checkboxes: NonNullable<PdfFormFillValues['checkboxes']> = {};

  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.akcRegisteredName, registeredName(dog));
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.akcRegistrationNumber, dog.registration?.registrationNumber);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.callName, dog.callName);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.dateOfBirth, formatDate(dog.dateOfBirth));
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.gender, dog.sex);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.breed, dog.breed);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.variety, dog.registration?.variety);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.breeder, dog.breeder);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.sire, dog.sire);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.dam, dog.dam);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.ownerName, personName(dog.owner));
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.ownerAddress, dog.owner.streetAddress);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.city, dog.owner.city);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.state, dog.owner.state);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.zip, dog.owner.zipCode);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.telephone, dog.owner.phone);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.email, dog.owner.email);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.phoneSignature, dog.owner.phone);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.emailSignature, dog.owner.email);
  addText(text, AKC_SCENT_WORK_ENTRY_FORM_FIELDS.handlerName, dog.handler);

  const isForeignRegistration = dog.registration?.organization?.toLowerCase().includes('foreign') ?? false;
  checkboxes[AKC_SCENT_WORK_ENTRY_FORM_FIELDS.akcCheckbox] = Boolean(dog.registration) && !isForeignRegistration;
  checkboxes[AKC_SCENT_WORK_ENTRY_FORM_FIELDS.foreignCheckbox] = isForeignRegistration;

  addGridValues({ checkboxes, dog, text, trials });

  return { checkboxes, text };
}

export function buildAKCScentWorkEntryFormFilename(dog: EntryFormDog): string {
  const dogToken = sanitizeFilenameToken(registeredName(dog) || dog.callName) || 'dog';
  const armbandToken = dog.armband != null ? `-${dog.armband}` : '';
  return `akc-entry-form-${dogToken}${armbandToken}.pdf`;
}

function addGridValues(input: {
  checkboxes: NonNullable<PdfFormFillValues['checkboxes']>;
  dog: EntryFormDog;
  text: NonNullable<PdfFormFillValues['text']>;
  trials: EntryFormTrial[];
}): void {
  const { checkboxes, dog, text, trials } = input;
  const trialRows = trials.slice(0, ENTRY_GRID_ROWS.length);
  const grid = buildClassGrid(dog.entries, trialRows);

  trialRows.forEach((trial, index) => {
    const rowFields = ENTRY_GRID_ROWS[index];
    if (!rowFields) return;
    const elementMap = grid.get(trial.id);

    for (const element of GRID_ELEMENTS) {
      const cell = elementMap?.get(element);
      for (const level of GRID_LEVELS) {
        checkboxes[rowFields[element][level]] = cell?.checkedLevels.has(level) ?? false;
      }
    }

    const detectiveCell = elementMap?.get('Detective');
    if (detectiveCell && detectiveCell.checkedLevels.size > 0) {
      text[rowFields.Detective] = 'X';
    }
  });
}

function addText(
  text: NonNullable<PdfFormFillValues['text']>,
  field: string,
  value: string | null | undefined
): void {
  const trimmed = value?.trim();
  if (trimmed) text[field] = trimmed;
}

function registeredName(dog: EntryFormDog): string {
  return dog.registration?.registeredName?.trim() || dog.callName;
}

function personName(person: { firstName: string | null; lastName: string | null }): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
}

function formatDate(value: string | null | undefined): string | undefined {
  const date = value?.slice(0, 10);
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value ?? undefined;
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function sanitizeFilenameToken(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
