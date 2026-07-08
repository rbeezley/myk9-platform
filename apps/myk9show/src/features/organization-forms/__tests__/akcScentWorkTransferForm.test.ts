import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import type {
  EntryFormDog,
  EntryFormEntry,
  EntryFormSecretary,
} from '@/lib/reports/entryFormTypes';
import type { ReportProps } from '@/lib/reports/types';
import {
  buildAKCScentWorkTransferFormFilename,
  buildAKCScentWorkTransferFormValues,
} from '../akcScentWorkTransferForm';
import { AKC_SCENT_WORK_TRANSFER_FORM_FIELDS } from '../akcScentWorkTransferFormFields';
import { fillPdfForm } from '../pdfForm';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const templatePath = resolve(repoRoot, 'docs/AKC-forms/SW-Transfer.pdf');

const dog: EntryFormDog = {
  dogId: 'dog-1',
  callName: 'Star',
  breed: 'Golden Retriever',
  sex: 'Female',
  dateOfBirth: '2022-03-15',
  registration: {
    registeredName: "GCH Oakwood's Rising Star",
    registrationNumber: 'DN12345678',
    organization: 'AKC',
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

const entry: EntryFormEntry = {
  id: 'entry-1',
  trialId: 'trial-1',
  classId: 'class-1',
  element: 'Buried',
  level: 'Novice',
  armband: 101,
  handler: null,
  submittedAt: '2026-04-01T12:00:00Z',
};

const props: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  clubName: 'Oakwood Dog Club',
  trial: {
    date: '2026-04-12',
    trialNumber: '1',
    judgeName: 'Pat Judge',
    eventNumber: '2026123401',
    registryId: 'AKC',
  },
  classData: {
    element: 'Buried',
    level: 'Novice',
    section: 'A',
  },
  entries: [],
  sortOrder: '',
};

const secretary: EntryFormSecretary = {
  name: 'Taylor Secretary',
  streetAddress: null,
  city: null,
  state: null,
  zipCode: null,
};

describe('buildAKCScentWorkTransferFormValues', () => {
  it('maps known dog, owner, trial, class, club, and secretary values', () => {
    const values = buildAKCScentWorkTransferFormValues({ dog, entry, props, secretary });

    expect(values.text).toMatchObject({
      [AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.club]: 'Oakwood Dog Club',
      [AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.date]: '04/12/2026',
      [AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.registeredName]: "GCH Oakwood's Rising Star",
      [AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.akcNumber]: 'DN12345678',
      [AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.breed]: 'Golden Retriever',
      [AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.sex]: 'Female',
      [AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.classFrom]: 'Buried Novice A',
      [AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.ownerName]: 'Sarah Johnson',
      [AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.trialSecretary]: 'Taylor Secretary',
    });
    expect(values.text?.[AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.classTo]).toBeUndefined();
    expect(values.text?.[AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.requestDate]).toBeUndefined();
    expect(values.text?.[AKC_SCENT_WORK_TRANSFER_FORM_FIELDS.requestTime]).toBeUndefined();
  });

  it('fills the real AKC Class Transfer Form PDF fields and leaves request fields editable', async () => {
    const filledBytes = await fillPdfForm(
      new Uint8Array(await readFile(templatePath)),
      buildAKCScentWorkTransferFormValues({ dog, entry, props, secretary })
    );
    const pdf = await PDFDocument.load(filledBytes);
    const form = pdf.getForm();

    expect(form.getTextField('Club').getText()).toBe('Oakwood Dog Club');
    expect(form.getTextField('Date').getText()).toBe('04/12/2026');
    expect(form.getTextField('RegisteredName').getText()).toBe("GCH Oakwood's Rising Star");
    expect(form.getTextField('AKCNumber').getText()).toBe('DN12345678');
    expect(form.getTextField('ClassFrom').getText()).toBe('Buried Novice A');
    expect(form.getTextField('ClassTo').getText()).toBeUndefined();
    expect(form.getTextField('Date2').getText()).toBeUndefined();
    expect(form.getTextField('Time').getText()).toBeUndefined();
  });
});

describe('buildAKCScentWorkTransferFormFilename', () => {
  it('uses the registered name and armband number', () => {
    expect(buildAKCScentWorkTransferFormFilename({ dog, entry })).toBe(
      'akc-transfer-form-GCH-Oakwood-s-Rising-Star-101.pdf'
    );
  });
});
