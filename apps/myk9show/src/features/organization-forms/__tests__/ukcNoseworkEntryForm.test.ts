import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import type { EntryFormDog } from '@/lib/reports/entryFormTypes';
import { fillPdfForm } from '../pdfForm';
import {
  buildUKCNoseworkEntryFormFilename,
  buildUKCNoseworkEntryFormPacketFilename,
  buildUKCNoseworkEntryFormPacketPdfBytes,
  buildUKCNoseworkEntryFormValues,
} from '../ukcNoseworkEntryForm';
import { UKC_NOSEWORK_ENTRY_FORM_FIELDS } from '../ukcNoseworkEntryFormFields';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');

const dog: EntryFormDog = {
  dogId: 'dog-1',
  callName: 'Star',
  breed: 'Golden Retriever',
  sex: 'Female',
  dateOfBirth: '2022-03-15',
  registration: {
    registeredName: "CH Oakwood's Rising Star",
    registrationNumber: 'U123456',
    organization: 'UKC',
    variety: null,
  },
  breeder: null,
  sire: null,
  dam: null,
  owner: {
    firstName: 'Sarah',
    lastName: 'Johnson',
    streetAddress: '456 Oak Ave',
    city: 'Dallas',
    state: 'TX',
    zipCode: '75001',
    phone: '(214) 555-0123',
    email: 'sarah@example.com',
  },
  handler: null,
  armband: 101,
  entries: [],
  agreementDate: null,
};

async function readEntryTemplate(): Promise<Uint8Array> {
  const buffer = await readFile(resolve(repoRoot, 'docs/UKC-forms/NW-Entry.pdf'));
  return new Uint8Array(buffer);
}

describe('UKC Nosework entry form PDF', () => {
  it('maps known dog, owner, armband, and UKC registration values', () => {
    expect(buildUKCNoseworkEntryFormValues(dog)).toEqual({
      checkboxes: {
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.permanentRegistrationCheckbox]: true,
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.performanceListingCheckbox]: false,
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.temporaryListingCheckbox]: false,
      },
      text: {
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.address]: '456 Oak Ave',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.armband]: '101',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.breed]: 'Golden Retriever',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.callName]: 'Star',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.city]: 'Dallas',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.dateOfBirth]: '03/15/2022',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.email]: 'sarah@example.com',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.ownerName]: 'Sarah Johnson',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.phone]: '(214) 555-0123',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.postalCode]: '75001',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.registeredName]: "CH Oakwood's Rising Star",
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.registrationNumber]: 'U123456',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.sex]: 'Female',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.state]: 'TX',
      },
    });
  });

  it('fills the official UKC entry PDF with mapped values', async () => {
    const filledBytes = await fillPdfForm(
      await readEntryTemplate(),
      buildUKCNoseworkEntryFormValues(dog)
    );
    const pdf = await PDFDocument.load(filledBytes);
    const form = pdf.getForm();

    expect(
      form.getCheckBox(UKC_NOSEWORK_ENTRY_FORM_FIELDS.permanentRegistrationCheckbox).isChecked()
    ).toBe(true);
    expect(form.getTextField(UKC_NOSEWORK_ENTRY_FORM_FIELDS.registrationNumber).getText()).toBe(
      'U123456'
    );
    expect(form.getTextField(UKC_NOSEWORK_ENTRY_FORM_FIELDS.registeredName).getText()).toBe(
      "CH Oakwood's Rising Star"
    );
    expect(form.getTextField(UKC_NOSEWORK_ENTRY_FORM_FIELDS.ownerName).getText()).toBe(
      'Sarah Johnson'
    );
  });

  it('can build a flattened packet from the official template', async () => {
    const bytes = await buildUKCNoseworkEntryFormPacketPdfBytes({
      dogs: [dog, { ...dog, dogId: 'dog-2', callName: 'Rocket', armband: 102 }],
      templateBytes: await readEntryTemplate(),
    });
    const pdf = await PDFDocument.load(bytes);

    expect(pdf.getPageCount()).toBe(2);
  });

  it('builds stable UKC entry filenames', () => {
    expect(buildUKCNoseworkEntryFormFilename(dog)).toBe(
      'ukc-nosework-entry-form-CH-Oakwood-s-Rising-Star-101.pdf'
    );
    expect(buildUKCNoseworkEntryFormPacketFilename('Spring Trial')).toBe(
      'ukc-nosework-entry-form-packet-Spring-Trial.pdf'
    );
  });
});
