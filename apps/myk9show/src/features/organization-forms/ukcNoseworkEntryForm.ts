import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { normalizeOrganization } from '@/features/dogs/identity';
import type { EntryFormDog, EntryFormTrial } from '@/lib/reports/entryFormTypes';
import type { PdfFormFillValues } from './pdfForm';
import { fillPdfForm } from './pdfForm';
import { UKC_NOSEWORK_ENTRY_FORM_FIELDS } from './ukcNoseworkEntryFormFields';
import {
  computeUKCEntryFormDobMarks,
  computeUKCEntryFormGridMarks,
  computeUKCEntryFormPhoneMarks,
  MAX_GRID_ROWS,
  normalizeUSPhoneDigits,
  type EntryFormGridMark,
} from './ukcNoseworkEntryFormGrid';

export function buildUKCNoseworkEntryFormValues(dog: EntryFormDog): PdfFormFillValues {
  const text: NonNullable<PdfFormFillValues['text']> = {};
  const checkboxes: NonNullable<PdfFormFillValues['checkboxes']> = {};
  const registrationOrganization = normalizeOrganization(dog.registration?.organization) ?? '';

  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.armband, dog.armband?.toString());
  addText(
    text,
    UKC_NOSEWORK_ENTRY_FORM_FIELDS.registrationNumber,
    dog.registration?.registrationNumber
  );
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.breed, dog.breed);
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.sex, dog.sex);
  // The AcroForm field for date of birth only has room for the year (MYK9-828)
  // — the printed "/  /" slashes to its left have no field, so the month and
  // day are drawn separately; see computeUKCEntryFormDobMarks.
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.dateOfBirth, dobYear(dog.dateOfBirth));
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.registeredName, registeredName(dog));
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.callName, dog.callName);
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.ownerName, personName(dog.owner));
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.address, dog.owner.streetAddress);
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.city, dog.owner.city);
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.state, dog.owner.state);
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.postalCode, dog.owner.zipCode);
  // Same story as date of birth: the field only has room for the last four
  // digits (MYK9-828) — the area code and exchange blanks have no field.
  addText(text, UKC_NOSEWORK_ENTRY_FORM_FIELDS.phone, lastFourDigits(dog.owner.phone));
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

/**
 * Fills the AcroForm fields, then draws the marks the template has no fields
 * for at all: which trial/section/element/level the dog is entered in, and
 * the date-of-birth/phone segments that fall outside the (too narrow) fields
 * (MYK9-828). `flatten` should match the caller's other official-PDF downloads
 * — the packet flattens so pages can be copied into one document; a single
 * dog's download leaves fields editable like every other official PDF.
 *
 * The template's grid only offers `MAX_GRID_ROWS` rows, so a dog entered in
 * more entries than that gets one page per `MAX_GRID_ROWS`-sized batch —
 * repeating the dog's own header fields on each page — rather than silently
 * dropping the overflow entries off the printed form. The common (single
 * page) case returns that page's own filled document directly, so `flatten:
 * false` really does leave its fields editable; `PDFDocument.copyPages` does
 * not carry a source document's AcroForm across, so only the rare multi-page
 * overflow case pays for the merge by losing field interactivity (the drawn
 * marks and values still print — they just cannot be edited afterward).
 */
export async function buildUKCNoseworkEntryFormPdfBytes(input: {
  dog: EntryFormDog;
  trials: readonly EntryFormTrial[];
  templateBytes: Uint8Array;
  flatten: boolean;
}): Promise<Uint8Array> {
  const values = buildUKCNoseworkEntryFormValues(input.dog);
  const entryBatches = chunk(input.dog.entries, MAX_GRID_ROWS);
  const pagePdfs = await Promise.all(
    entryBatches.map(entries => fillAndMarkPage(input, values, entries))
  );

  if (pagePdfs.length === 1) {
    return pagePdfs[0]!.save();
  }

  const outputPdf = await PDFDocument.create();
  for (const pagePdf of pagePdfs) {
    const copiedPages = await outputPdf.copyPages(pagePdf, pagePdf.getPageIndices());
    for (const copiedPage of copiedPages) {
      outputPdf.addPage(copiedPage);
    }
  }
  return outputPdf.save();
}

async function fillAndMarkPage(
  input: {
    dog: EntryFormDog;
    trials: readonly EntryFormTrial[];
    templateBytes: Uint8Array;
    flatten: boolean;
  },
  values: PdfFormFillValues,
  entries: EntryFormDog['entries']
): Promise<PDFDocument> {
  const filledBytes = await fillPdfForm(input.templateBytes, values, {
    flatten: input.flatten,
  });
  const pagePdf = await PDFDocument.load(filledBytes);
  const page = pagePdf.getPages()[0];
  if (page) {
    const font = await pagePdf.embedFont(StandardFonts.Helvetica);
    const marks = [
      ...computeUKCEntryFormGridMarks({ entries }, input.trials),
      ...computeUKCEntryFormDobMarks(input.dog.dateOfBirth),
      ...computeUKCEntryFormPhoneMarks(input.dog.owner.phone),
    ];
    drawMarks(page, font, marks);
  }
  return pagePdf;
}

export async function buildUKCNoseworkEntryFormPacketPdfBytes(input: {
  dogs: EntryFormDog[];
  trials: readonly EntryFormTrial[];
  templateBytes: Uint8Array;
}): Promise<Uint8Array> {
  const outputPdf = await PDFDocument.create();

  for (const dog of sortDogsForPacket(input.dogs)) {
    const filledBytes = await buildUKCNoseworkEntryFormPdfBytes({
      dog,
      trials: input.trials,
      templateBytes: input.templateBytes,
      flatten: true,
    });
    const filledPdf = await PDFDocument.load(filledBytes);
    const copiedPages = await outputPdf.copyPages(filledPdf, filledPdf.getPageIndices());
    for (const page of copiedPages) {
      outputPdf.addPage(page);
    }
  }

  return outputPdf.save();
}

function drawMarks(page: PDFPage, font: PDFFont, marks: EntryFormGridMark[]): void {
  for (const mark of marks) {
    page.drawText(mark.text, { x: mark.x, y: mark.y, size: mark.size, font });
  }
}

/** Splits `items` into `size`-sized batches; always returns at least one (possibly empty) batch. */
function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
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

function dobYear(value: string | null | undefined): string | undefined {
  const match = value?.slice(0, 10).match(/^(\d{4})-\d{2}-\d{2}$/);
  return match?.[1];
}

function lastFourDigits(value: string | null | undefined): string | undefined {
  return normalizeUSPhoneDigits(value)?.slice(6);
}

function sanitizeFilenameToken(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
