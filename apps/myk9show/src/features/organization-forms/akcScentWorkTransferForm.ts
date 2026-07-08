import type {
  EntryFormDog,
  EntryFormEntry,
  EntryFormSecretary,
} from '@/lib/reports/entryFormTypes';
import type { ReportProps } from '@/lib/reports/types';
import type { PdfFormFillValues } from './pdfForm';
import { AKC_SCENT_WORK_TRANSFER_FORM_FIELDS } from './akcScentWorkTransferFormFields';

export function buildAKCScentWorkTransferFormValues(input: {
  dog: EntryFormDog;
  entry: EntryFormEntry;
  props: ReportProps;
  secretary: EntryFormSecretary | null;
}): PdfFormFillValues {
  const { dog, entry, props, secretary } = input;
  const text: NonNullable<PdfFormFillValues['text']> = {};

  addText(text, AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.club, props.clubName ?? props.showName);
  addText(text, AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.date, formatDate(props.trial?.date));
  addText(text, AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.registeredName, registeredName(dog));
  addText(
    text,
    AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.akcNumber,
    dog.registration?.registrationNumber
  );
  addText(text, AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.breed, dog.breed);
  addText(text, AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.sex, dog.sex);
  addText(text, AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.classFrom, classLabel(entry, props));
  addText(text, AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.ownerName, personName(dog.owner));
  addText(text, AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.trialSecretary, secretary?.name);

  return { text };
}

export function buildAKCScentWorkTransferFormFilename(input: {
  dog: EntryFormDog;
  entry: EntryFormEntry;
}): string {
  const dogToken = sanitizeFilenameToken(registeredName(input.dog) || input.dog.callName) || 'dog';
  const armband = input.entry.armband ?? input.dog.armband;
  const armbandToken = armband != null ? `-${armband}` : '';
  return `akc-transfer-form-${dogToken}${armbandToken}.pdf`;
}

function classLabel(entry: EntryFormEntry, props: ReportProps): string {
  return [
    entry.element || props.classData?.element,
    entry.level || props.classData?.level,
    props.classData?.section,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
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
