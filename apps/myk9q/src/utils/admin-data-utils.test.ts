/**
 * Tests for Admin Data Formatting Utilities
 */

import {
  formatTrialDate,
  formatClassDetails,
  formatTrialLabel,
  formatTrialLabelById,
  getSelectedClassDetails,
  groupClassesByTrial,
  type Trial,
  type ClassInfo,
} from './admin-data-utils';

describe('admin-data-utils', () => {
  describe('formatTrialDate', () => {
    it('should format date to Day, Mon DD, YYYY format', () => {
      expect(formatTrialDate('2025-01-19')).toBe('Sun, Jan 19, 2025');
      expect(formatTrialDate('2024-12-25')).toBe('Wed, Dec 25, 2024');
      expect(formatTrialDate('2024-07-04')).toBe('Thu, Jul 4, 2024');
    });

    it('should handle all months correctly', () => {
      expect(formatTrialDate('2024-01-15')).toContain('Jan');
      expect(formatTrialDate('2024-02-15')).toContain('Feb');
      expect(formatTrialDate('2024-03-15')).toContain('Mar');
      expect(formatTrialDate('2024-04-15')).toContain('Apr');
      expect(formatTrialDate('2024-05-15')).toContain('May');
      expect(formatTrialDate('2024-06-15')).toContain('Jun');
      expect(formatTrialDate('2024-07-15')).toContain('Jul');
      expect(formatTrialDate('2024-08-15')).toContain('Aug');
      expect(formatTrialDate('2024-09-15')).toContain('Sep');
      expect(formatTrialDate('2024-10-15')).toContain('Oct');
      expect(formatTrialDate('2024-11-15')).toContain('Nov');
      expect(formatTrialDate('2024-12-15')).toContain('Dec');
    });

    it('should handle all days of week correctly', () => {
      expect(formatTrialDate('2025-01-19')).toContain('Sun'); // Sunday
      expect(formatTrialDate('2025-01-20')).toContain('Mon'); // Monday
      expect(formatTrialDate('2025-01-21')).toContain('Tue'); // Tuesday
      expect(formatTrialDate('2025-01-22')).toContain('Wed'); // Wednesday
      expect(formatTrialDate('2025-01-23')).toContain('Thu'); // Thursday
      expect(formatTrialDate('2025-01-24')).toContain('Fri'); // Friday
      expect(formatTrialDate('2025-01-25')).toContain('Sat'); // Saturday
    });

    it('should handle single-digit days correctly', () => {
      expect(formatTrialDate('2025-01-01')).toBe('Wed, Jan 1, 2025');
      expect(formatTrialDate('2025-01-09')).toBe('Thu, Jan 9, 2025');
    });

    it('should handle leap years correctly', () => {
      expect(formatTrialDate('2024-02-29')).toBe('Thu, Feb 29, 2024');
    });

    it('should fallback to original string on invalid date', () => {
      expect(formatTrialDate('invalid')).toBe('invalid');
      expect(formatTrialDate('not-a-date')).toBe('not-a-date');
      expect(formatTrialDate('')).toBe('');
    });

    it('should handle malformed dates gracefully', () => {
      expect(formatTrialDate('2025-13-01')).toBe('2025-13-01'); // Invalid month
      expect(formatTrialDate('2025-01-32')).toBe('2025-01-32'); // Invalid day
    });
  });

  describe('formatClassDetails', () => {
    it('should format class with element, level, and section', () => {
      const classInfo: ClassInfo = {
        id: 1,
        element: 'Container',
        level: 'Novice A',
        section: 'Regular',
      };

      expect(formatClassDetails(classInfo)).toBe(
        'Container (Novice A • Regular)'
      );
    });

    it('should format different elements correctly', () => {
      expect(
        formatClassDetails({
          id: 1,
          element: 'Interior',
          level: 'Master',
          section: '20 inch',
        })
      ).toBe('Interior (Master • 20 inch)');

      expect(
        formatClassDetails({
          id: 2,
          element: 'Exterior',
          level: 'Advanced',
          section: 'Preferred',
        })
      ).toBe('Exterior (Advanced • Preferred)');

      expect(
        formatClassDetails({
          id: 3,
          element: 'Buried',
          level: 'Novice B',
          section: '8 inch',
        })
      ).toBe('Buried (Novice B • 8 inch)');
    });

    it('should handle empty strings', () => {
      expect(
        formatClassDetails({ id: 1, element: '', level: '', section: '' })
      ).toBe(' ( • )');
    });

    it('should preserve special characters', () => {
      expect(
        formatClassDetails({
          id: 1,
          element: 'Container',
          level: 'Novice A/B',
          section: '4"-8"',
        })
      ).toBe('Container (Novice A/B • 4"-8")');
    });
  });

  describe('formatTrialLabel', () => {
    const trial: Trial = {
      trial_id: 1,
      trial_number: 1,
      trial_date: '2025-01-19',
    };

    it('should format with date-first by default', () => {
      expect(formatTrialLabel(trial)).toBe('Sun, Jan 19, 2025 • Trial 1');
    });

    it('should format with date-first when specified', () => {
      expect(formatTrialLabel(trial, 'date-first')).toBe(
        'Sun, Jan 19, 2025 • Trial 1'
      );
    });

    it('should format with number-first when specified', () => {
      expect(formatTrialLabel(trial, 'number-first')).toBe(
        'Trial 1 - Sun, Jan 19, 2025'
      );
    });

    it('should handle different trial numbers', () => {
      expect(
        formatTrialLabel({ ...trial, trial_number: 2 }, 'number-first')
      ).toBe('Trial 2 - Sun, Jan 19, 2025');

      expect(
        formatTrialLabel({ ...trial, trial_number: 10 }, 'date-first')
      ).toBe('Sun, Jan 19, 2025 • Trial 10');
    });
  });

  describe('formatTrialLabelById', () => {
    const trials: Trial[] = [
      { trial_id: 1, trial_number: 1, trial_date: '2025-01-19' },
      { trial_id: 2, trial_number: 2, trial_date: '2025-01-20' },
      { trial_id: 3, trial_number: 3, trial_date: '2025-01-21' },
    ];

    it('should find trial by ID and format with date-first', () => {
      expect(formatTrialLabelById(1, trials, 'date-first')).toBe(
        'Sun, Jan 19, 2025 • Trial 1'
      );
    });

    it('should find trial by ID and format with number-first', () => {
      expect(formatTrialLabelById(2, trials, 'number-first')).toBe(
        'Trial 2 - Mon, Jan 20, 2025'
      );
    });

    it('should use date-first by default', () => {
      expect(formatTrialLabelById(3, trials)).toBe(
        'Tue, Jan 21, 2025 • Trial 3'
      );
    });

    it('should fallback to "Trial {id}" when not found', () => {
      expect(formatTrialLabelById(999, trials)).toBe('Trial 999');
    });

    it('should handle empty trials array', () => {
      expect(formatTrialLabelById(1, [])).toBe('Trial 1');
    });
  });

  describe('getSelectedClassDetails', () => {
    const classes: ClassInfo[] = [
      { id: 1, element: 'Container', level: 'Novice A', section: 'Regular' },
      { id: 2, element: 'Interior', level: 'Master', section: '20 inch' },
      { id: 3, element: 'Buried', level: 'Advanced', section: 'Preferred' },
      { id: 4, element: 'Exterior', level: 'Novice B', section: '8 inch' },
    ];

    it('should return details for selected classes', () => {
      const result = getSelectedClassDetails(classes, new Set([1, 3]));

      expect(result).toEqual([
        'Container (Novice A • Regular)',
        'Buried (Advanced • Preferred)',
      ]);
    });

    it('should return all classes when all selected', () => {
      const result = getSelectedClassDetails(
        classes,
        new Set([1, 2, 3, 4])
      );

      expect(result).toHaveLength(4);
      expect(result).toContain('Container (Novice A • Regular)');
      expect(result).toContain('Interior (Master • 20 inch)');
      expect(result).toContain('Buried (Advanced • Preferred)');
      expect(result).toContain('Exterior (Novice B • 8 inch)');
    });

    it('should return empty array when no classes selected', () => {
      const result = getSelectedClassDetails(classes, new Set());

      expect(result).toEqual([]);
    });

    it('should handle non-existent class IDs gracefully', () => {
      const result = getSelectedClassDetails(classes, new Set([999, 1000]));

      expect(result).toEqual([]);
    });

    it('should maintain order from original array', () => {
      const result = getSelectedClassDetails(classes, new Set([3, 1, 4, 2]));

      // Should be in order of classes array, not Set order
      expect(result).toEqual([
        'Container (Novice A • Regular)',
        'Interior (Master • 20 inch)',
        'Buried (Advanced • Preferred)',
        'Exterior (Novice B • 8 inch)',
      ]);
    });

    it('should handle empty classes array', () => {
      const result = getSelectedClassDetails([], new Set([1, 2]));

      expect(result).toEqual([]);
    });
  });

  describe('groupClassesByTrial', () => {
    interface ClassWithTrial extends ClassInfo {
      trial_id: number;
    }

    const classes: ClassWithTrial[] = [
      {
        id: 1,
        trial_id: 1,
        element: 'Container',
        level: 'Novice A',
        section: 'Regular',
      },
      {
        id: 2,
        trial_id: 1,
        element: 'Interior',
        level: 'Master',
        section: '20 inch',
      },
      {
        id: 3,
        trial_id: 2,
        element: 'Buried',
        level: 'Advanced',
        section: 'Preferred',
      },
      {
        id: 4,
        trial_id: 2,
        element: 'Exterior',
        level: 'Novice B',
        section: '8 inch',
      },
      {
        id: 5,
        trial_id: 3,
        element: 'Container',
        level: 'Master',
        section: '16 inch',
      },
    ];

    it('should group classes by trial ID', () => {
      const result = groupClassesByTrial(classes);

      expect(result.size).toBe(3);
      expect(result.get(1)).toHaveLength(2);
      expect(result.get(2)).toHaveLength(2);
      expect(result.get(3)).toHaveLength(1);
    });

    it('should preserve class order within groups', () => {
      const result = groupClassesByTrial(classes);

      const trial1Classes = result.get(1)!;
      expect(trial1Classes[0].id).toBe(1);
      expect(trial1Classes[1].id).toBe(2);

      const trial2Classes = result.get(2)!;
      expect(trial2Classes[0].id).toBe(3);
      expect(trial2Classes[1].id).toBe(4);
    });

    it('should include all class properties in groups', () => {
      const result = groupClassesByTrial(classes);

      const trial1Classes = result.get(1)!;
      expect(trial1Classes[0]).toEqual({
        id: 1,
        trial_id: 1,
        element: 'Container',
        level: 'Novice A',
        section: 'Regular',
      });
    });

    it('should handle empty array', () => {
      const result = groupClassesByTrial([]);

      expect(result.size).toBe(0);
    });

    it('should handle single trial', () => {
      const singleTrialClasses = classes.filter((c) => c.trial_id === 1);
      const result = groupClassesByTrial(singleTrialClasses);

      expect(result.size).toBe(1);
      expect(result.get(1)).toHaveLength(2);
    });

    it('should work with different object types', () => {
      // Test with objects containing additional properties
      const extendedClasses = classes.map((c) => ({
        ...c,
        extraProp: 'test',
      }));

      const result = groupClassesByTrial(extendedClasses);

      expect(result.size).toBe(3);
      expect(result.get(1)![0]).toHaveProperty('extraProp', 'test');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should format bulk operation details', () => {
      const classes: ClassInfo[] = [
        { id: 1, element: 'Container', level: 'Novice A', section: 'Regular' },
        { id: 2, element: 'Interior', level: 'Master', section: '20 inch' },
        { id: 3, element: 'Buried', level: 'Advanced', section: 'Preferred' },
      ];

      const selectedClasses = new Set([1, 3]);
      const details = getSelectedClassDetails(classes, selectedClasses);

      expect(details).toEqual([
        'Container (Novice A • Regular)',
        'Buried (Advanced • Preferred)',
      ]);
      expect(details.length).toBe(selectedClasses.size);
    });

    it('should format trial selector labels', () => {
      const trials: Trial[] = [
        { trial_id: 1, trial_number: 1, trial_date: '2025-01-19' },
        { trial_id: 2, trial_number: 2, trial_date: '2025-01-20' },
      ];

      const labels = trials.map((t) => formatTrialLabel(t, 'date-first'));

      expect(labels).toEqual([
        'Sun, Jan 19, 2025 • Trial 1',
        'Mon, Jan 20, 2025 • Trial 2',
      ]);
    });

    it('should handle confirmation dialog details', () => {
      const classes: ClassInfo[] = [
        { id: 1, element: 'Container', level: 'Novice A', section: 'Regular' },
        { id: 2, element: 'Interior', level: 'Master', section: '20 inch' },
      ];

      const selectedClassIds = new Set([1, 2]);
      const details = getSelectedClassDetails(classes, selectedClassIds);

      const message = `Are you sure you want to release results for ${selectedClassIds.size} class(es)?`;
      const expectedDetails = [
        'Container (Novice A • Regular)',
        'Interior (Master • 20 inch)',
      ];

      expect(details).toEqual(expectedDetails);
      expect(message).toContain('2 class(es)');
    });

    it('should organize classes by trial for display', () => {
      interface ClassWithTrial extends ClassInfo {
        trial_id: number;
      }

      const classes: ClassWithTrial[] = [
        {
          id: 1,
          trial_id: 1,
          element: 'Container',
          level: 'Novice A',
          section: 'Regular',
        },
        {
          id: 2,
          trial_id: 2,
          element: 'Interior',
          level: 'Master',
          section: '20 inch',
        },
        {
          id: 3,
          trial_id: 1,
          element: 'Buried',
          level: 'Advanced',
          section: 'Preferred',
        },
      ];

      const grouped = groupClassesByTrial(classes);

      expect(grouped.get(1)).toHaveLength(2);
      expect(grouped.get(2)).toHaveLength(1);

      // Format first trial's classes
      const trial1Details = grouped
        .get(1)!
        .map((c) => formatClassDetails(c));

      expect(trial1Details).toEqual([
        'Container (Novice A • Regular)',
        'Buried (Advanced • Preferred)',
      ]);
    });
  });
});
