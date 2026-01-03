/**
 * Tests for Nationals Scoring Utility Functions
 */

import {
  mapElementToNationalsType,
  getNationalsElementDisplayName,
  getAllNationalsElementTypes,
  isValidNationalsElement,
  getNationalsMaxTime,
  getNationalsMaxTimeFormatted,
  isValidCompetitionDay,
  getCompetitionDayName,
  type NationalsElementType,
  type CompetitionDay,
} from './nationals-scoring-utils';

describe('nationals-scoring-utils', () => {
  describe('mapElementToNationalsType', () => {
    it('should map "Container" to CONTAINER', () => {
      expect(mapElementToNationalsType('Container')).toBe('CONTAINER');
      expect(mapElementToNationalsType('Container Search')).toBe('CONTAINER');
      expect(mapElementToNationalsType('CONTAINER')).toBe('CONTAINER');
    });

    it('should map "Buried" to BURIED', () => {
      expect(mapElementToNationalsType('Buried')).toBe('BURIED');
      expect(mapElementToNationalsType('Buried Search')).toBe('BURIED');
      expect(mapElementToNationalsType('BURIED')).toBe('BURIED');
    });

    it('should map "Interior" to INTERIOR', () => {
      expect(mapElementToNationalsType('Interior')).toBe('INTERIOR');
      expect(mapElementToNationalsType('Interior Search')).toBe('INTERIOR');
      expect(mapElementToNationalsType('INTERIOR')).toBe('INTERIOR');
    });

    it('should map "Exterior" to EXTERIOR', () => {
      expect(mapElementToNationalsType('Exterior')).toBe('EXTERIOR');
      expect(mapElementToNationalsType('Exterior Search')).toBe('EXTERIOR');
      expect(mapElementToNationalsType('EXTERIOR')).toBe('EXTERIOR');
    });

    it('should map "Handler Discrimination" to HD_CHALLENGE', () => {
      expect(mapElementToNationalsType('Handler Discrimination')).toBe(
        'HD_CHALLENGE'
      );
      expect(mapElementToNationalsType('Handler')).toBe('HD_CHALLENGE');
      expect(mapElementToNationalsType('Discrimination')).toBe('HD_CHALLENGE');
    });

    it('should be case-insensitive', () => {
      expect(mapElementToNationalsType('container')).toBe('CONTAINER');
      expect(mapElementToNationalsType('INTERIOR')).toBe('INTERIOR');
      expect(mapElementToNationalsType('ExTeRiOr')).toBe('EXTERIOR');
    });

    it('should handle partial matches', () => {
      expect(mapElementToNationalsType('Contains container')).toBe('CONTAINER');
      expect(mapElementToNationalsType('buried somewhere')).toBe('BURIED');
    });

    it('should default to CONTAINER for unknown elements', () => {
      expect(mapElementToNationalsType('Unknown')).toBe('CONTAINER');
      expect(mapElementToNationalsType('')).toBe('CONTAINER');
      expect(mapElementToNationalsType('Advanced')).toBe('CONTAINER');
    });

    it('should handle null/undefined gracefully', () => {
      expect(mapElementToNationalsType(null as any)).toBe('CONTAINER');
      expect(mapElementToNationalsType(undefined as any)).toBe('CONTAINER');
    });
  });

  describe('getNationalsElementDisplayName', () => {
    it('should return display names for all element types', () => {
      expect(getNationalsElementDisplayName('CONTAINER')).toBe('Container');
      expect(getNationalsElementDisplayName('BURIED')).toBe('Buried');
      expect(getNationalsElementDisplayName('INTERIOR')).toBe('Interior');
      expect(getNationalsElementDisplayName('EXTERIOR')).toBe('Exterior');
      expect(getNationalsElementDisplayName('HD_CHALLENGE')).toBe(
        'Handler Discrimination'
      );
    });

    it('should handle unknown element type', () => {
      expect(
        getNationalsElementDisplayName('UNKNOWN' as NationalsElementType)
      ).toBe('Unknown');
    });
  });

  describe('getAllNationalsElementTypes', () => {
    it('should return all 5 element types', () => {
      const types = getAllNationalsElementTypes();

      expect(types).toHaveLength(5);
      expect(types).toContain('CONTAINER');
      expect(types).toContain('BURIED');
      expect(types).toContain('INTERIOR');
      expect(types).toContain('EXTERIOR');
      expect(types).toContain('HD_CHALLENGE');
    });

    it('should return array in correct order', () => {
      const types = getAllNationalsElementTypes();

      expect(types).toEqual([
        'CONTAINER',
        'BURIED',
        'INTERIOR',
        'EXTERIOR',
        'HD_CHALLENGE',
      ]);
    });
  });

  describe('isValidNationalsElement', () => {
    it('should return true for valid element types', () => {
      expect(isValidNationalsElement('CONTAINER')).toBe(true);
      expect(isValidNationalsElement('BURIED')).toBe(true);
      expect(isValidNationalsElement('INTERIOR')).toBe(true);
      expect(isValidNationalsElement('EXTERIOR')).toBe(true);
      expect(isValidNationalsElement('HD_CHALLENGE')).toBe(true);
    });

    it('should return false for invalid element types', () => {
      expect(isValidNationalsElement('UNKNOWN')).toBe(false);
      expect(isValidNationalsElement('ADVANCED')).toBe(false);
      expect(isValidNationalsElement('')).toBe(false);
      expect(isValidNationalsElement('container')).toBe(false); // Case-sensitive
    });
  });

  describe('getNationalsMaxTime', () => {
    it('should return 120 seconds for CONTAINER', () => {
      expect(getNationalsMaxTime('CONTAINER')).toBe(120);
    });

    it('should return 180 seconds for INTERIOR', () => {
      expect(getNationalsMaxTime('INTERIOR')).toBe(180);
    });

    it('should return 180 seconds for EXTERIOR', () => {
      expect(getNationalsMaxTime('EXTERIOR')).toBe(180);
    });

    it('should return 180 seconds for BURIED', () => {
      expect(getNationalsMaxTime('BURIED')).toBe(180);
    });

    it('should return 180 seconds for HD_CHALLENGE', () => {
      expect(getNationalsMaxTime('HD_CHALLENGE')).toBe(180);
    });

    it('should default to 120 seconds for unknown type', () => {
      expect(getNationalsMaxTime('UNKNOWN' as NationalsElementType)).toBe(120);
    });
  });

  describe('getNationalsMaxTimeFormatted', () => {
    it('should format CONTAINER time as 2:00', () => {
      expect(getNationalsMaxTimeFormatted('CONTAINER')).toBe('2:00');
    });

    it('should format INTERIOR time as 3:00', () => {
      expect(getNationalsMaxTimeFormatted('INTERIOR')).toBe('3:00');
    });

    it('should format EXTERIOR time as 3:00', () => {
      expect(getNationalsMaxTimeFormatted('EXTERIOR')).toBe('3:00');
    });

    it('should format BURIED time as 3:00', () => {
      expect(getNationalsMaxTimeFormatted('BURIED')).toBe('3:00');
    });

    it('should format HD_CHALLENGE time as 3:00', () => {
      expect(getNationalsMaxTimeFormatted('HD_CHALLENGE')).toBe('3:00');
    });

    it('should pad seconds with leading zero', () => {
      const time = getNationalsMaxTimeFormatted('CONTAINER');
      expect(time).toMatch(/^\d+:\d{2}$/);
    });
  });

  describe('isValidCompetitionDay', () => {
    it('should return true for day 1', () => {
      expect(isValidCompetitionDay(1)).toBe(true);
    });

    it('should return true for day 2', () => {
      expect(isValidCompetitionDay(2)).toBe(true);
    });

    it('should return true for day 3', () => {
      expect(isValidCompetitionDay(3)).toBe(true);
    });

    it('should return false for day 0', () => {
      expect(isValidCompetitionDay(0)).toBe(false);
    });

    it('should return false for day 4', () => {
      expect(isValidCompetitionDay(4)).toBe(false);
    });

    it('should return false for negative days', () => {
      expect(isValidCompetitionDay(-1)).toBe(false);
    });

    it('should return false for non-integer days', () => {
      expect(isValidCompetitionDay(1.5)).toBe(false);
      expect(isValidCompetitionDay(2.9)).toBe(false);
    });
  });

  describe('getCompetitionDayName', () => {
    it('should return "Day 1" for day 1', () => {
      expect(getCompetitionDayName(1)).toBe('Day 1');
    });

    it('should return "Day 2 Semifinals" for day 2', () => {
      expect(getCompetitionDayName(2)).toBe('Day 2 Semifinals');
    });

    it('should return "Day 3 Finals" for day 3', () => {
      expect(getCompetitionDayName(3)).toBe('Day 3 Finals');
    });

    it('should fallback for invalid day', () => {
      expect(getCompetitionDayName(4 as CompetitionDay)).toBe('Day 4');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle complete element mapping flow', () => {
      const elements = [
        'Container Search',
        'Buried',
        'Interior',
        'Exterior',
        'Handler Discrimination',
      ];

      const mapped = elements.map(mapElementToNationalsType);

      expect(mapped).toEqual([
        'CONTAINER',
        'BURIED',
        'INTERIOR',
        'EXTERIOR',
        'HD_CHALLENGE',
      ]);
    });

    it('should provide max times for all elements', () => {
      const types = getAllNationalsElementTypes();

      const times = types.map((type) => ({
        element: type,
        seconds: getNationalsMaxTime(type),
        formatted: getNationalsMaxTimeFormatted(type),
      }));

      expect(times).toEqual([
        { element: 'CONTAINER', seconds: 120, formatted: '2:00' },
        { element: 'BURIED', seconds: 180, formatted: '3:00' },
        { element: 'INTERIOR', seconds: 180, formatted: '3:00' },
        { element: 'EXTERIOR', seconds: 180, formatted: '3:00' },
        { element: 'HD_CHALLENGE', seconds: 180, formatted: '3:00' },
      ]);
    });

    it('should validate and display all competition days', () => {
      const days = [1, 2, 3] as CompetitionDay[];

      const info = days.map((day) => ({
        day,
        valid: isValidCompetitionDay(day),
        name: getCompetitionDayName(day),
      }));

      expect(info).toEqual([
        { day: 1, valid: true, name: 'Day 1' },
        { day: 2, valid: true, name: 'Day 2 Semifinals' },
        { day: 3, valid: true, name: 'Day 3 Finals' },
      ]);
    });

    it('should handle scoresheet element selection', () => {
      const userSelectedElement = 'Interior Search';
      const nationalsType = mapElementToNationalsType(userSelectedElement);
      const displayName = getNationalsElementDisplayName(nationalsType);
      const maxTime = getNationalsMaxTimeFormatted(nationalsType);

      expect(nationalsType).toBe('INTERIOR');
      expect(displayName).toBe('Interior');
      expect(maxTime).toBe('3:00');
    });
  });
});
