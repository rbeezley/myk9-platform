import { describe, it, expect } from 'vitest';
import { buildExportRow } from '@/utils/entryExportUtils';

type DogRegistration = { organization: string; registration_number: string };
type Owner = { first_name: string; last_name: string; email: string; phone: string } | null;

function makeEntry(
  overrides: {
    dog?: {
      name?: string;
      call_name?: string;
      breed?: string;
      owner?: Owner;
      dog_registrations?: DogRegistration[];
    } | null;
    class?: { name?: string; class_number?: string } | null;
    armband?: string;
    handler?: string;
    entry_status?: string;
    payment_status?: string;
    entry_fee?: number;
    special_requests?: string | null;
    jump_height?: string | null;
  } = {}
) {
  return {
    armband: overrides.armband ?? '42',
    handler: overrides.handler ?? 'Jane Smith',
    entry_status: overrides.entry_status ?? 'confirmed',
    payment_status: overrides.payment_status ?? 'paid',
    entry_fee: overrides.entry_fee ?? 50,
    special_requests: overrides.special_requests ?? null,
    jump_height: overrides.jump_height ?? null,
    dog:
      overrides.dog !== undefined
        ? overrides.dog
        : {
            name: 'Fido',
            call_name: 'Fi',
            breed: 'Border Collie',
            owner: null,
            dog_registrations: [],
          },
    class:
      overrides.class !== undefined ? overrides.class : { name: 'Novice A', class_number: '1' },
  };
}

describe('buildExportRow', () => {
  describe('owner columns', () => {
    it('populates owner first name from dog.owner', () => {
      const entry = makeEntry({
        dog: {
          name: 'Fido',
          call_name: 'Fi',
          breed: 'Border Collie',
          owner: {
            first_name: 'Jane',
            last_name: 'Smith',
            email: 'jane@test.com',
            phone: '555-1234',
          },
          dog_registrations: [],
        },
      });
      const row = buildExportRow(entry);
      expect(row[5]).toBe('Jane');
    });

    it('populates owner last name from dog.owner', () => {
      const entry = makeEntry({
        dog: {
          name: 'Fido',
          call_name: 'Fi',
          breed: 'Border Collie',
          owner: {
            first_name: 'Jane',
            last_name: 'Smith',
            email: 'jane@test.com',
            phone: '555-1234',
          },
          dog_registrations: [],
        },
      });
      const row = buildExportRow(entry);
      expect(row[6]).toBe('Smith');
    });

    it('populates owner email from dog.owner', () => {
      const entry = makeEntry({
        dog: {
          name: 'Fido',
          call_name: 'Fi',
          breed: 'Border Collie',
          owner: {
            first_name: 'Jane',
            last_name: 'Smith',
            email: 'jane@test.com',
            phone: '555-1234',
          },
          dog_registrations: [],
        },
      });
      const row = buildExportRow(entry);
      expect(row[7]).toBe('jane@test.com');
    });

    it('populates owner phone from dog.owner', () => {
      const entry = makeEntry({
        dog: {
          name: 'Fido',
          call_name: 'Fi',
          breed: 'Border Collie',
          owner: {
            first_name: 'Jane',
            last_name: 'Smith',
            email: 'jane@test.com',
            phone: '555-1234',
          },
          dog_registrations: [],
        },
      });
      const row = buildExportRow(entry);
      expect(row[8]).toBe('555-1234');
    });

    it('returns empty strings for owner columns when owner is null', () => {
      const row = buildExportRow(makeEntry());
      expect(row[5]).toBe('');
      expect(row[6]).toBe('');
      expect(row[7]).toBe('');
      expect(row[8]).toBe('');
    });
  });

  describe('registration number column', () => {
    it('formats single registration as "ORG: number"', () => {
      const entry = makeEntry({
        dog: {
          name: 'Fido',
          call_name: 'Fi',
          breed: 'Border Collie',
          owner: null,
          dog_registrations: [{ organization: 'AKC', registration_number: 'NF12345' }],
        },
      });
      const row = buildExportRow(entry);
      expect(row[4]).toBe('AKC: NF12345');
    });

    it('joins multiple registrations with "; "', () => {
      const entry = makeEntry({
        dog: {
          name: 'Fido',
          call_name: 'Fi',
          breed: 'Border Collie',
          owner: null,
          dog_registrations: [
            { organization: 'AKC', registration_number: 'NF12345' },
            { organization: 'UKC', registration_number: 'U98765' },
          ],
        },
      });
      const row = buildExportRow(entry);
      expect(row[4]).toBe('AKC: NF12345; UKC: U98765');
    });

    it('returns empty string when no registrations', () => {
      const row = buildExportRow(makeEntry());
      expect(row[4]).toBe('');
    });
  });

  describe('class name with jump height', () => {
    it('includes jump height in class name when present', () => {
      const entry = makeEntry({ jump_height: '16"' });
      const row = buildExportRow(entry);
      expect(row[13]).toBe('Novice A (16")');
    });

    it('omits parentheses when no jump height', () => {
      const row = buildExportRow(makeEntry());
      expect(row[13]).toBe('Novice A');
    });
  });

  describe('other columns', () => {
    it('returns 15-column row matching CSV headers', () => {
      const row = buildExportRow(makeEntry());
      expect(row).toHaveLength(15);
    });

    it('places armband in column 0', () => {
      const row = buildExportRow(makeEntry({ armband: '99' }));
      expect(row[0]).toBe('99');
    });

    it('places handler in column 9', () => {
      const row = buildExportRow(makeEntry({ handler: 'Bob Jones' }));
      expect(row[9]).toBe('Bob Jones');
    });
  });

  describe('entry_fee edge cases', () => {
    it('returns "0" when entry_fee is null', () => {
      const row = buildExportRow({ ...makeEntry(), entry_fee: null });
      expect(row[12]).toBe('0');
    });

    it('returns "0" when entry_fee is NaN', () => {
      const row = buildExportRow({ ...makeEntry(), entry_fee: NaN });
      expect(row[12]).toBe('0');
    });

    it('returns "0" when entry_fee is 0', () => {
      const row = buildExportRow({ ...makeEntry(), entry_fee: 0 });
      expect(row[12]).toBe('0');
    });

    it('returns fee string when entry_fee is a positive number', () => {
      const row = buildExportRow({ ...makeEntry(), entry_fee: 45 });
      expect(row[12]).toBe('45');
    });
  });
});
