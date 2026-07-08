import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import type { EntryFormDog, EntryFormEntry } from '@/lib/reports/entryFormTypes';
import type { ReportProps } from '@/lib/reports/types';
import { fillPdfForm } from '../pdfForm';
import {
  buildUKCNoseworkChangeEntryFormFilename,
  buildUKCNoseworkChangeEntryFormValues,
} from '../ukcNoseworkChangeEntryForm';
import { UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS } from '../ukcNoseworkChangeEntryFormFields';

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
    variety: 'Golden',
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

const entry: EntryFormEntry = {
  id: 'entry-1',
  trialId: 'trial-1',
  classId: 'class-1',
  element: 'Container',
  level: 'Novice',
  armband: 101,
  handler: null,
  submittedAt: '2026-04-01T12:00:00Z',
};

const props = {
  clubName: 'Demo Nosework Club',
  entries: [],
  showName: 'Spring UKC Trial',
  sortOrder: '',
  trial: {
    date: '2026-04-12',
    judgeName: 'Pat Judge',
    registryId: 'UKC',
    trialNumber: '1',
  },
} satisfies ReportProps;

async function readChangeEntryTemplate(): Promise<Uint8Array> {
  const buffer = await readFile(resolve(repoRoot, 'docs/UKC-forms/NW-ChangeEntry.pdf'));
  return new Uint8Array(buffer);
}

describe('UKC Nosework change entry form PDF', () => {
  it('prefills known values while leaving requested move target blank', () => {
    expect(
      buildUKCNoseworkChangeEntryFormValues({
        dog,
        entry,
        props,
        secretary: null,
      })
    ).toEqual({
      checkboxes: {
        [UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.classChange]: true,
        [UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.entryCorrection]: false,
      },
      text: {
        [UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.armband]: '101',
        [UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.breed]: 'Golden Retriever',
        [UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.date]: '04/12/2026',
        [UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.dogName]: "CH Oakwood's Rising Star",
        [UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.hostClub]: 'Demo Nosework Club',
        [UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.moveFrom]: 'Container Novice',
        [UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.ownerName]: 'Sarah Johnson',
        [UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.registrationNumber]: 'U123456',
        [UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.sex]: 'Female',
        [UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.variety]: 'Golden',
      },
    });
  });

  it('fills the official UKC change entry PDF with mapped values', async () => {
    const filledBytes = await fillPdfForm(
      await readChangeEntryTemplate(),
      buildUKCNoseworkChangeEntryFormValues({ dog, entry, props, secretary: null })
    );
    const pdf = await PDFDocument.load(filledBytes);
    const form = pdf.getForm();

    expect(form.getCheckBox(UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.classChange).isChecked()).toBe(
      true
    );
    expect(form.getTextField(UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.hostClub).getText()).toBe(
      'Demo Nosework Club'
    );
    expect(form.getTextField(UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.moveFrom).getText()).toBe(
      'Container Novice'
    );
    expect(
      form.getTextField(UKC_NOSEWORK_CHANGE_ENTRY_FORM_FIELDS.moveInto).getText()
    ).toBeUndefined();
  });

  it('builds a stable filename', () => {
    expect(buildUKCNoseworkChangeEntryFormFilename({ dog, entry })).toBe(
      'ukc-change-entry-form-CH-Oakwood-s-Rising-Star-101.pdf'
    );
  });
});
