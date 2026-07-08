import { PDFDocument } from 'pdf-lib';
import type { EntryFormDog } from '@/lib/reports/entryFormTypes';
import type { PdfFormFillValues } from './pdfForm';
import { fillPdfForm } from './pdfForm';
import { UKC_NOSEWORK_ENTRY_FORM_FIELDS } from './ukcNoseworkEntryFormFields';

export function buildUKCNoseworkEntryFormValues(dog: EntryFormDog): PdfFormFillValues {
  const text: NonNullable<PdfFormFillValues['text']> = {};
  const checkboxes: NonNullable<PdfFormFillValues['checkboxes']> = {};
  const registrationOrganization = dog.registration?.organization?.trim().toUpperCase() ?? '';

  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.armband, dog.armband?.toString());
  addText(
    text,
    UKC_NOSEWORK_ENTRY_FORM_FIELDS.registrationNumber,
    dog.registration?.registrationNumber
  );
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.breed, dog.breed);
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.sex, dog.sex);
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.dateOfBirth, formatDate(dog.dateOfBirth));
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.registeredName, registeredName(dog));
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.callName, dog.callName);
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.ownerName, personName(dog.owner));
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.address, dog.owner.streetAddress);
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.city, dog.owner.city);
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.state, dog.owner.state);
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.postalCode, dog.owner.zipCode);
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.phone, dog.owner.phone);
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.email, dog.owner.email);

  const hasRegistrationNumber = Boolean(dog.registration?.registrationNumber?.trim());
  checkboxes[UKC_NOSEWORK_ENTRY_FORM_FIELDS.permanentRegistrationCheckbox] =
    hasRegistrationNumber && registrationOrganization === 'UKC';
  checkboxes[UKC_NOSEWORK_ENTRY_FORM_FIELDS.temporaryListingCheckbox] = false;
  checkboxes[UKC_NOSEWORK_ENTRY_FORM_FIELDS.performanceListingCheckbox] = false;

  return { checkboxes, text };
}

export function buildUKCNoseworkEntryFormFilename(dog: EntryFormDog): string {
  const dogToken = sanitizeFilenameToken(registeredName(dog) || dog.callName) || 'dog';
  const armbandToken = dog.armband != null ? `-${dog.armband}` : '';
  return `ukc-nosework-entry-form-${dogToken}${armbandToken}.pdf`;
}

export function buildUKCNoseworkEntryFormPacketFilename(
  showName: string | null | undefined
): string {
  const showToken = sanitizeFilenameToken(showName ?? '') || 'show';
  return `ukc-nosework-entry-form-packet-${showToken}.pdf`;
}

export async function buildUKCNoseworkEntryFormPacketPdfBytes(input: {
  dogs: EntryFormDog[];
  templateBytes: Uint8Array;
}): Promise<Uint8Array> {
  const outputPdf = await PDFDocument.create();

  for (const dog of sortDogsForPacket(input.dogs)) {
    const filledBytes = await fillPdfForm(
      input.templateBytes,
      buildUKCNoseworkEntryFormValues(dog),
      {
        flatten: true,
      }
    );
    const filledPdf = await PDFDocument.load(filledBytes);
    const copiedPages = await outputPdf.copyPages(filledPdf, filledPdf.getPageIndices());
    for (const page of copiedPages) {
      outputPdf.addPage(page);
    }
  }

  return outputPdf.save();
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

function sortDogsForPacket(dogs: EntryFormDog[]): EntryFormDog[] {
  return [...dogs].sort((a, b) => {
    const armbandA = a.armband ?? Number.MAX_SAFE_INTEGER;
    const armbandB = b.armband ?? Number.MAX_SAFE_INTEGER;
    if (armbandA !== armbandB) return armbandA - armbandB;
    return registeredName(a).localeCompare(registeredName(b));
  });
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
