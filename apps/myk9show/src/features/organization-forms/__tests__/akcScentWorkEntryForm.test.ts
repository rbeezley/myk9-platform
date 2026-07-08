import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import type { EntryFormDog, EntryFormTrial } from '@/lib/reports/entryFormTypes';
import {
  buildAKCScentWorkEntryFormFilename,
  buildAKCScentWorkEntryFormValues,
} from '../akcScentWorkEntryForm';
import { AKC_SCENT_WORK_ENTRY_FORM_FIELDS } from '../akcScentWorkEntryFormFields';
import { fillPdfForm } from '../pdfForm';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const templatePath = resolve(repoRoot, 'docs/AKC-forms/SW-EntryForm.pdf');

const trials: EntryFormTrial[] = [
  { id: 'trial-1', date: '2026-04-12', trialNumber: 1 },
  { id: 'trial-2', date: '2026-04-13', trialNumber: 2 },
];

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
    variety: 'Golden',
  },
  breeder: 'John Doe',
  sire: "CH Oakwood's Golden Boy",
  dam: "Oakwood's Shining Light",
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
  handler: 'Bob Handler',
  armband: 101,
  entries: [
    {
      id: 'e1',
      trialId: 'trial-1',
      classId: 'c1',
      element: 'Container',
      level: 'Excellent',
      armband: 101,
      handler: null,
      submittedAt: '2026-04-01T12:00:00Z',
    },
    {
      id: 'e2',
      trialId: 'trial-1',
      classId: 'c2',
      element: 'Interior',
      level: 'Novice A',
      armband: 101,
      handler: null,
      submittedAt: '2026-04-01T12:00:00Z',
    },
    {
      id: 'e3',
      trialId: 'trial-1',
      classId: 'c3',
      element: 'Detective',
      level: 'Detective',
      armband: 101,
      handler: null,
      submittedAt: '2026-04-01T12:00:00Z',
    },
    {
      id: 'e4',
      trialId: 'trial-2',
      classId: 'c4',
      element: 'Buried',
      level: 'Master',
      armband: 101,
      handler: null,
      submittedAt: '2026-04-01T12:00:00Z',
    },
    {
      id: 'e5',
      trialId: 'trial-2',
      classId: 'c5',
      element: 'Handler Discrimination',
      level: 'Advanced',
      armband: 101,
      handler: null,
      submittedAt: '2026-04-01T12:00:00Z',
    },
  ],
  agreementDate: '2026-04-01T12:00:00Z',
};

describe('buildAKCScentWorkEntryFormValues', () => {
  it('maps dog, owner, registration, and class grid values to official PDF fields', () => {
    const values = buildAKCScentWorkEntryFormValues({ dog, trials });

    expect(values.text).toMatchObject({
      [AKC_SCENT_WORK_ENTRY_FORM_FIELDS.akcRegisteredName]: "GCH Oakwood's Rising Star",
      [AKC_SCENT_WORK_ENTRY_FORM_FIELDS.akcRegistrationNumber]: 'DN12345678',
      [AKC_SCENT_WORK_ENTRY_FORM_FIELDS.callName]: 'Star',
      [AKC_SCENT_WORK_ENTRY_FORM_FIELDS.dateOfBirth]: '03/15/2022',
      [AKC_SCENT_WORK_ENTRY_FORM_FIELDS.gender]: 'Female',
      [AKC_SCENT_WORK_ENTRY_FORM_FIELDS.ownerName]: 'Sarah Johnson',
      [AKC_SCENT_WORK_ENTRY_FORM_FIELDS.ownerAddress]: '456 Oak Ave',
      [AKC_SCENT_WORK_ENTRY_FORM_FIELDS.handlerName]: 'Bob Handler',
      'Detect iveNovice A  B Advanced Excellent Master': 'X',
    });
    expect(values.checkboxes).toMatchObject({
      [AKC_SCENT_WORK_ENTRY_FORM_FIELDS.akcCheckbox]: true,
      [AKC_SCENT_WORK_ENTRY_FORM_FIELDS.foreignCheckbox]: false,
      Excellent: true,
      'Novice A  B_2': true,
      Master_9: true,
      Advanced_10: true,
    });
  });

  it('fills the real AKC Entry Form PDF fields', async () => {
    const bytes = new Uint8Array(await readFile(templatePath));
    const filledBytes = await fillPdfForm(
      bytes,
      buildAKCScentWorkEntryFormValues({ dog, trials })
    );
    const pdf = await PDFDocument.load(filledBytes);
    const form = pdf.getForm();

    expect(form.getTextField('AKCRegisteredName').getText()).toBe("GCH Oakwood's Rising Star");
    expect(form.getTextField('AKCRegistrionNumber').getText()).toBe('DN12345678');
    expect(form.getTextField('DOB').getText()).toBe('03/15/2022');
    expect(form.getTextField('OwnerName').getText()).toBe('Sarah Johnson');
    expect(form.getCheckBox('Excellent').isChecked()).toBe(true);
    expect(form.getCheckBox('Novice A  B_2').isChecked()).toBe(true);
    expect(form.getCheckBox('Master_9').isChecked()).toBe(true);
    expect(form.getCheckBox('Advanced_10').isChecked()).toBe(true);
    expect(form.getTextField('Detect iveNovice A  B Advanced Excellent Master').getText()).toBe(
      'X'
    );
  });

  it('uses the call name when no registered name is available', () => {
    const values = buildAKCScentWorkEntryFormValues({
      dog: { ...dog, registration: null },
      trials,
    });

    expect(values.text?.AKCRegisteredName).toBe('Star');
    expect(values.checkboxes?.AKCPALILPCP).toBe(false);
  });
});

describe('buildAKCScentWorkEntryFormFilename', () => {
  it('uses the registered name and armband number', () => {
    expect(buildAKCScentWorkEntryFormFilename(dog)).toBe(
      'akc-entry-form-GCH-Oakwood-s-Rising-Star-101.pdf'
    );
  });
});
