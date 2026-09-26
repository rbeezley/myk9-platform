import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import type { EntryFormDog, EntryFormTrial } from '@/lib/reports/entryFormTypes';
import { fillPdfForm } from '../pdfForm';
import {
  buildUKCNoseworkEntryFormFilename,
  buildUKCNoseworkEntryFormPacketFilename,
  buildUKCNoseworkEntryFormPacketPdfBytes,
  buildUKCNoseworkEntryFormPdfBytes,
  buildUKCNoseworkEntryFormValues,
} from '../ukcNoseworkEntryForm';
import { UKC_NOSEWORK_ENTRY_FORM_FIELDS } from '../ukcNoseworkEntryFormFields';
import { countWidgetAnnotations, extractDrawnPdfText } from './testPdfText';

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
  handlerDateOfBirth: null,
  handlerJuniorHandlerNumbers: undefined,
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
        // The AcroForm field only has room for the year -- the month/day are
        // drawn into their own (fieldless) blanks (MYK9-828); see the "draws
        // the date of birth" test below.
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.dateOfBirth]: '2022',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.email]: 'sarah@example.com',
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.ownerName]: 'Sarah Johnson',
        // Same story: only the last four digits fit the field; area code and
        // exchange are drawn separately.
        [UKC_NOSEWORK_ENTRY_FORM_FIELDS.phone]: '0123',
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

  it('recognizes the spelled-out UKC organization stored in live registrations', () => {
    const values = buildUKCNoseworkEntryFormValues({
      ...dog,
      registration: { ...dog.registration!, organization: 'UKC (United Kennel Club)' },
    });

    expect(values.checkboxes?.[UKC_NOSEWORK_ENTRY_FORM_FIELDS.permanentRegistrationCheckbox]).toBe(
      true
    );
  });

  it('can build a flattened packet from the official template', async () => {
    const bytes = await buildUKCNoseworkEntryFormPacketPdfBytes({
      dogs: [dog, { ...dog, dogId: 'dog-2', callName: 'Rocket', armband: 102 }],
      trials: [],
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

  it('draws the date of birth month/day and phone area code/exchange in their own blanks', async () => {
    const bytes = await buildUKCNoseworkEntryFormPdfBytes({
      dog,
      trials: [],
      templateBytes: await readEntryTemplate(),
      flatten: false,
    });

    const drawn = await extractDrawnPdfText(bytes);
    expect(drawn).toContain('03');
    expect(drawn).toContain('15');
    expect(drawn).toContain('214');
    expect(drawn).toContain('555');
  });

  it('keeps the AcroForm interactive for a single-dog download (flatten: false)', async () => {
    // Codex round 2 (MYK9-828): copying the filled page into a fresh
    // PDFDocument dropped the AcroForm catalog, so a "single dog" download
    // that is supposed to stay editable came back with no form fields at all.
    const bytes = await buildUKCNoseworkEntryFormPdfBytes({
      dog,
      trials: [],
      templateBytes: await readEntryTemplate(),
      flatten: false,
    });

    const pdf = await PDFDocument.load(bytes);
    const fields = pdf.getForm().getFields();
    expect(fields.length).toBeGreaterThan(0);
    expect(pdf.getForm().getTextField(UKC_NOSEWORK_ENTRY_FORM_FIELDS.ownerName).getText()).toBe(
      'Sarah Johnson'
    );
    expect(pdf.getForm().getTextField(UKC_NOSEWORK_ENTRY_FORM_FIELDS.phone).getText()).toBe('0123');
  });

  it('normalizes a stored +1 US phone number for the last-four field and the drawn area code/exchange', async () => {
    // Codex round 2 (MYK9-828): a stored "+1 (214) 555-0123" strips to 11
    // digits, so both the last-four AcroForm field and the drawn area
    // code/exchange marks were left blank.
    const dogWithCountryCode: EntryFormDog = {
      ...dog,
      owner: { ...dog.owner, phone: '+1 (214) 555-0123' },
    };

    expect(
      buildUKCNoseworkEntryFormValues(dogWithCountryCode).text?.[
        UKC_NOSEWORK_ENTRY_FORM_FIELDS.phone
      ]
    ).toBe('0123');

    const bytes = await buildUKCNoseworkEntryFormPdfBytes({
      dog: dogWithCountryCode,
      trials: [],
      templateBytes: await readEntryTemplate(),
      flatten: false,
    });
    const drawn = await extractDrawnPdfText(bytes);
    expect(drawn).toContain('214');
    expect(drawn).toContain('555');
  });

  it('marks the trial, section, and element/level grid for each of the dog’s entries', async () => {
    // MYK9-828: `trials.trial_number` is a free-text label ("Trial 1", not
    // the bare digit "1" — see seed-demo.sql) — this fixture matches what the
    // database actually returns.
    const trials: EntryFormTrial[] = [
      { id: 'trial-1', date: '2026-10-10', trialNumber: 'Trial 1' },
      { id: 'trial-2', date: '2026-10-11', trialNumber: 'Friday Trial 2' },
    ];
    const dogWithEntries: EntryFormDog = {
      ...dog,
      entries: [
        {
          id: 'entry-1',
          trialId: 'trial-1',
          classId: 'class-1',
          element: 'Container',
          level: 'Novice',
          section: 'A',
          armband: 101,
          handler: null,
          handlerId: null,
          submittedAt: null,
        },
        {
          id: 'entry-2',
          trialId: 'trial-2',
          classId: 'class-2',
          element: 'Handler Discrimination',
          level: 'Excellent',
          section: null,
          armband: 101,
          handler: null,
          handlerId: null,
          submittedAt: null,
        },
      ],
    };

    const bytes = await buildUKCNoseworkEntryFormPdfBytes({
      dog: dogWithEntries,
      trials,
      templateBytes: await readEntryTemplate(),
      flatten: false,
    });

    const drawn = await extractDrawnPdfText(bytes);
    const markCount = drawn.filter(text => text === 'X').length;
    // Trial 1 bracket + Section A + Container/Novice, then Trial 2 bracket +
    // Handler Discrimination/Excellent (no section — entry-2 has none).
    expect(markCount).toBe(5);
  });

  it('does not mark a grid cell for an unrecognized element or level', async () => {
    const dogWithUnknownEntry: EntryFormDog = {
      ...dog,
      entries: [
        {
          id: 'entry-1',
          trialId: 'trial-1',
          classId: 'class-1',
          element: 'Not A Real Element',
          level: 'Not A Real Level',
          section: null,
          armband: 101,
          handler: null,
          handlerId: null,
          submittedAt: null,
        },
      ],
    };

    const bytes = await buildUKCNoseworkEntryFormPdfBytes({
      dog: dogWithUnknownEntry,
      trials: [{ id: 'trial-1', date: '2026-10-10', trialNumber: '1' }],
      templateBytes: await readEntryTemplate(),
      flatten: false,
    });

    const drawn = await extractDrawnPdfText(bytes);
    // Trial 1 bracket still marks (a known trial number); the grid cell does not.
    expect(drawn.filter(text => text === 'X').length).toBe(1);
  });

  it('does not mark a trial bracket for a trial numbered beyond what the template offers', async () => {
    const dogWithThirdTrialEntry: EntryFormDog = {
      ...dog,
      entries: [
        {
          id: 'entry-1',
          trialId: 'trial-3',
          classId: 'class-1',
          element: 'Container',
          level: 'Novice',
          section: null,
          armband: 101,
          handler: null,
          handlerId: null,
          submittedAt: null,
        },
      ],
    };

    const bytes = await buildUKCNoseworkEntryFormPdfBytes({
      dog: dogWithThirdTrialEntry,
      trials: [{ id: 'trial-3', date: '2026-10-12', trialNumber: 'Trial 3' }],
      templateBytes: await readEntryTemplate(),
      flatten: false,
    });

    const drawn = await extractDrawnPdfText(bytes);
    // Only the Container/Novice cell marks; there is no "Trial 3" bracket to check.
    expect(drawn.filter(text => text === 'X').length).toBe(1);
  });

  it('gives a dog entered in more than six classes an overflow page instead of dropping entries', async () => {
    const manyEntries: EntryFormDog['entries'] = Array.from({ length: 8 }, (_, i) => ({
      id: `entry-${i + 1}`,
      trialId: 'trial-1',
      classId: `class-${i + 1}`,
      element: 'Container',
      level: 'Novice',
      section: null,
      armband: 101,
      handler: null,
      handlerId: null,
      submittedAt: null,
    }));
    const dogWithManyEntries: EntryFormDog = { ...dog, entries: manyEntries };

    const bytes = await buildUKCNoseworkEntryFormPdfBytes({
      dog: dogWithManyEntries,
      trials: [{ id: 'trial-1', date: '2026-10-10', trialNumber: 'Trial 1' }],
      templateBytes: await readEntryTemplate(),
      flatten: false,
    });

    const pdf = await PDFDocument.load(bytes);
    // 8 entries over a 6-row grid: page 1 marks 6 Container/Novice cells (plus
    // the Trial 1 bracket on each of the 6 rows it fills), page 2 the other 2.
    expect(pdf.getPageCount()).toBe(2);

    const page1Marks = (await extractDrawnPdfText(bytes, 0)).filter(text => text === 'X');
    const page2Marks = (await extractDrawnPdfText(bytes, 1)).filter(text => text === 'X');
    expect(page1Marks.length).toBe(12); // 6 rows x (Trial 1 bracket + Container/Novice)
    expect(page2Marks.length).toBe(4); // 2 rows x (Trial 1 bracket + Container/Novice)
  });

  it('keeps a one-page single-dog download interactive', async () => {
    const bytes = await buildUKCNoseworkEntryFormPdfBytes({
      dog,
      trials: [],
      templateBytes: await readEntryTemplate(),
      flatten: false,
    });

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const fields = pdf.getForm().getFields();
    expect(fields.length).toBeGreaterThan(0);
    expect(pdf.getForm().getTextField(UKC_NOSEWORK_ENTRY_FORM_FIELDS.ownerName).getText()).toBe(
      'Sarah Johnson'
    );
  });

  it('flattens a 7+ entry single-dog download instead of shipping a broken "editable" multi-page PDF', async () => {
    // Codex round 3 (MYK9-828): copying multiple filled pages into one
    // document (copyPages) drops the AcroForm catalog no matter what
    // `flatten` says, so an "editable" (flatten: false) multi-page download
    // silently had no working form fields at all. Owner decision: a
    // single-dog download stays editable only when it fits on one page —
    // once it overflows, every page is flattened first, so the result is an
    // honest flattened PDF instead of a broken interactive one.
    const manyEntries: EntryFormDog['entries'] = Array.from({ length: 7 }, (_, i) => ({
      id: `entry-${i + 1}`,
      trialId: 'trial-1',
      classId: `class-${i + 1}`,
      element: 'Container',
      level: 'Novice',
      section: null,
      armband: 101,
      handler: null,
      handlerId: null,
      submittedAt: null,
    }));
    const dogWithManyEntries: EntryFormDog = { ...dog, entries: manyEntries };

    const bytes = await buildUKCNoseworkEntryFormPdfBytes({
      dog: dogWithManyEntries,
      trials: [{ id: 'trial-1', date: '2026-10-10', trialNumber: 'Trial 1' }],
      templateBytes: await readEntryTemplate(),
      flatten: false,
    });

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getForm().getFields()).toEqual([]);
    // `getForm().getFields()` alone doesn't distinguish a truly flattened
    // page from the pre-fix bug: copying an unflattened page into a fresh
    // PDFDocument also reports zero fields, because copyPages never
    // registers the copied Widget annotations in the destination's
    // /AcroForm — but it leaves those Widgets sitting on the page,
    // orphaned rather than genuinely flattened into static content
    // (confirmed by reverting this fix locally: the pre-fix output carried
    // 28 orphaned Widget annotations per page). A flattened page has none.
    expect(await countWidgetAnnotations(bytes, 0)).toBe(0);
    expect(await countWidgetAnnotations(bytes, 1)).toBe(0);

    // The grid/DOB/phone marks this module draws itself (drawMarks, not an
    // AcroForm field) are unaffected by flattening and stay visible as plain
    // page-content text on both pages.
    const page1Marks = (await extractDrawnPdfText(bytes, 0)).filter(text => text === 'X');
    const page2Marks = (await extractDrawnPdfText(bytes, 1)).filter(text => text === 'X');
    expect(page1Marks.length).toBe(12); // 6 rows x (Trial 1 bracket + Container/Novice)
    expect(page2Marks.length).toBe(2); // 1 row x (Trial 1 bracket + Container/Novice)
  });
});
