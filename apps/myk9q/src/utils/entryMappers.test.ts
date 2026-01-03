/**
 * Unit Tests for Entry Mapping Utilities
 */

import { mapDatabaseRowToEntry, mapDatabaseRowToEntrySimple } from './entryMappers';
import type { EntryDatabaseRow } from './entryMappers';

describe('mapDatabaseRowToEntry', () => {
  describe('Complete row mapping', () => {
    test('should map all fields correctly with standard schema', () => {
      const row: EntryDatabaseRow = {
        id: 1,
        armband: 101,
        call_name: 'Buddy',
        breed: 'Golden Retriever',
        handler: 'John Smith',
        jump_height: '16',
        preferred_time: '2:30',
        is_scored: true,
        entry_status: 'checked-in',
        result_text: 'Qualified',
        search_time: '1:45',
        fault_count: 2,
        placement: 1,
        class_id: 5,
        element: 'Interior',
        level: 'Master',
        section: 'A',
        total_correct_finds: 3,
        total_incorrect_finds: 0,
        no_finish_count: 0,
      };

      const result = mapDatabaseRowToEntry(row, 'checked-in', 'Interior Master A');

      expect(result).toEqual({
        id: 1,
        classId: 5,
        armband: 101,
        callName: 'Buddy',
        breed: 'Golden Retriever',
        handler: 'John Smith',
        jumpHeight: '16',
        preferredTime: '2:30',
        isScored: true,
        status: 'checked-in',
        inRing: false,
        checkedIn: true,
        checkinStatus: 'checked-in',
        resultText: 'Qualified',
        searchTime: '1:45',
        faultCount: 2,
        placement: 1,
        className: 'Interior Master A',
        section: 'A',
        element: 'Interior',
        level: 'Master',
        correctFinds: 3,
        incorrectFinds: 0,
        noFinishCount: 0,
      });
    });

    test('should map with alternative column names (armband_number, dog_call_name, etc.)', () => {
      const row: EntryDatabaseRow = {
        id: 2,
        armband_number: 202,
        dog_call_name: 'Max',
        dog_breed: 'Border Collie',
        handler_name: 'Jane Doe',
        is_scored: false,
        entry_status: 'no-status',
        result_status: 'pending',
        search_time_seconds: 105,
        total_faults: 1,
        final_placement: 3,
        class_id: 10,
        element: 'Containers',
        level: 'Novice',
        section: 'B',
        total_correct_finds: 2,
        total_incorrect_finds: 1,
        no_finish_count: 0,
      };

      const result = mapDatabaseRowToEntry(row, 'no-status', 'Containers Novice B');

      expect(result).toEqual({
        id: 2,
        classId: 10,
        armband: 202,
        callName: 'Max',
        breed: 'Border Collie',
        handler: 'Jane Doe',
        jumpHeight: '',
        preferredTime: '',
        isScored: false,
        status: 'no-status',
        inRing: false,
        checkedIn: false,
        checkinStatus: 'no-status',
        resultText: 'pending',
        searchTime: '105',
        faultCount: 1,
        placement: 3,
        className: 'Containers Novice B',
        section: 'B',
        element: 'Containers',
        level: 'Novice',
        correctFinds: 2,
        incorrectFinds: 1,
        noFinishCount: 0,
      });
    });
  });

  describe('Status field calculations', () => {
    test('should set inRing=true when status is "in-ring"', () => {
      const row: EntryDatabaseRow = { id: 1, class_id: 1 };
      const result = mapDatabaseRowToEntry(row, 'in-ring', 'Test Class');

      expect(result.status).toBe('in-ring');
      expect(result.inRing).toBe(true);
      expect(result.checkedIn).toBe(true);
      expect(result.checkinStatus).toBe('in-ring');
    });

    test('should set checkedIn=false when status is "no-status"', () => {
      const row: EntryDatabaseRow = { id: 1, class_id: 1 };
      const result = mapDatabaseRowToEntry(row, 'no-status', 'Test Class');

      expect(result.status).toBe('no-status');
      expect(result.inRing).toBe(false);
      expect(result.checkedIn).toBe(false);
      expect(result.checkinStatus).toBe('no-status');
    });

    test('should set checkedIn=true for non-"no-status" statuses', () => {
      const statuses: Array<'checked-in' | 'at-gate' | 'come-to-gate'> = [
        'checked-in',
        'at-gate',
        'come-to-gate',
      ];

      statuses.forEach((status) => {
        const row: EntryDatabaseRow = { id: 1, class_id: 1 };
        const result = mapDatabaseRowToEntry(row, status, 'Test Class');

        expect(result.checkedIn).toBe(true);
      });
    });
  });

  describe('Default values for missing fields', () => {
    test('should use defaults when fields are null', () => {
      const row: EntryDatabaseRow = {
        id: 3,
        armband: null,
        call_name: null,
        breed: null,
        handler: null,
        jump_height: null,
        preferred_time: null,
        is_scored: null,
        result_text: null,
        search_time: null,
        fault_count: null,
        placement: null,
        class_id: null,
        element: null,
        level: null,
        section: null,
      };

      const result = mapDatabaseRowToEntry(row, 'no-status', '');

      expect(result.armband).toBe(0);
      expect(result.callName).toBe('');
      expect(result.breed).toBe('');
      expect(result.handler).toBe('');
      expect(result.jumpHeight).toBe('');
      expect(result.preferredTime).toBe('');
      expect(result.isScored).toBe(false);
      expect(result.resultText).toBe('pending');
      expect(result.searchTime).toBe('0.00');
      expect(result.faultCount).toBe(0);
      expect(result.placement).toBeUndefined();
      expect(result.classId).toBe(0);
      expect(result.element).toBeUndefined();
      expect(result.level).toBeUndefined();
      expect(result.section).toBeUndefined();
    });

    test('should use defaults when fields are undefined', () => {
      const row: EntryDatabaseRow = {
        id: 4,
        class_id: 20,
      };

      const result = mapDatabaseRowToEntry(row, 'no-status', 'Test');

      expect(result.armband).toBe(0);
      expect(result.callName).toBe('');
      expect(result.breed).toBe('');
      expect(result.handler).toBe('');
      expect(result.jumpHeight).toBe('');
      expect(result.preferredTime).toBe('');
      expect(result.isScored).toBe(false);
      expect(result.searchTime).toBe('0.00');
      expect(result.faultCount).toBe(0);
    });
  });

  describe('Schema variation handling', () => {
    test('should prefer standard column name over alternative (armband over armband_number)', () => {
      const row: EntryDatabaseRow = {
        id: 5,
        armband: 301,
        armband_number: 999, // Should be ignored
        class_id: 1,
      };

      const result = mapDatabaseRowToEntry(row, 'checked-in', 'Test');
      expect(result.armband).toBe(301);
    });

    test('should prefer standard column name over alternative (call_name over dog_call_name)', () => {
      const row: EntryDatabaseRow = {
        id: 6,
        call_name: 'Preferred',
        dog_call_name: 'Alternative',
        class_id: 1,
      };

      const result = mapDatabaseRowToEntry(row, 'checked-in', 'Test');
      expect(result.callName).toBe('Preferred');
    });

    test('should prefer result_text over result_status', () => {
      const row: EntryDatabaseRow = {
        id: 7,
        result_text: 'Qualified',
        result_status: 'pending',
        class_id: 1,
      };

      const result = mapDatabaseRowToEntry(row, 'checked-in', 'Test');
      expect(result.resultText).toBe('Qualified');
    });

    test('should prefer search_time over search_time_seconds', () => {
      const row: EntryDatabaseRow = {
        id: 8,
        search_time: '2:30',
        search_time_seconds: 150,
        class_id: 1,
      };

      const result = mapDatabaseRowToEntry(row, 'checked-in', 'Test');
      expect(result.searchTime).toBe('2:30');
    });
  });

  describe('Optional scoring fields', () => {
    test('should include optional fields when present', () => {
      const row: EntryDatabaseRow = {
        id: 9,
        class_id: 1,
        total_correct_finds: 4,
        total_incorrect_finds: 1,
        no_finish_count: 0,
      };

      const result = mapDatabaseRowToEntry(row, 'checked-in', 'Test');

      expect(result.correctFinds).toBe(4);
      expect(result.incorrectFinds).toBe(1);
      expect(result.noFinishCount).toBe(0);
    });

    test('should set optional fields to undefined when missing', () => {
      const row: EntryDatabaseRow = {
        id: 10,
        class_id: 1,
      };

      const result = mapDatabaseRowToEntry(row, 'checked-in', 'Test');

      expect(result.correctFinds).toBeUndefined();
      expect(result.incorrectFinds).toBeUndefined();
      expect(result.noFinishCount).toBeUndefined();
    });
  });
});

describe('mapDatabaseRowToEntrySimple', () => {
  test('should map entry without requiring className', () => {
    const row: EntryDatabaseRow = {
      id: 11,
      armband: 501,
      call_name: 'Rover',
      breed: 'Lab',
      handler: 'Bob',
      class_id: 15,
    };

    const result = mapDatabaseRowToEntrySimple(row, 'checked-in');

    expect(result.id).toBe(11);
    expect(result.armband).toBe(501);
    expect(result.callName).toBe('Rover');
    expect(result.className).toBe('');
    expect(result.status).toBe('checked-in');
  });

  test('should use empty string for className', () => {
    const row: EntryDatabaseRow = {
      id: 12,
      class_id: 20,
    };

    const result = mapDatabaseRowToEntrySimple(row, 'no-status');

    expect(result.className).toBe('');
  });
});
