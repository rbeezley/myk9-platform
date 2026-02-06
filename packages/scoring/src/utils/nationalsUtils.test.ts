import { describe, it, expect } from 'vitest';
import {
  mapElementToNationalsType,
  getNationalsElementDisplayName,
  getAllNationalsElementTypes,
  isValidNationalsElement,
  getNationalsMaxTime,
  getNationalsMaxTimeFormatted,
  isValidCompetitionDay,
  getCompetitionDayName,
} from './nationalsUtils';

describe('nationalsUtils', () => {
  describe('mapElementToNationalsType', () => {
    it('should map "Container Search" to CONTAINER', () => {
      expect(mapElementToNationalsType('Container Search')).toBe('CONTAINER');
    });

    it('should map "Buried" to BURIED', () => {
      expect(mapElementToNationalsType('Buried')).toBe('BURIED');
    });

    it('should map "Interior" to INTERIOR', () => {
      expect(mapElementToNationalsType('Interior')).toBe('INTERIOR');
    });

    it('should map "Exterior" to EXTERIOR', () => {
      expect(mapElementToNationalsType('Exterior')).toBe('EXTERIOR');
    });

    it('should map "Handler Discrimination" to HD_CHALLENGE', () => {
      expect(mapElementToNationalsType('Handler Discrimination')).toBe('HD_CHALLENGE');
    });

    it('should match case-insensitively', () => {
      expect(mapElementToNationalsType('CONTAINER')).toBe('CONTAINER');
      expect(mapElementToNationalsType('interior')).toBe('INTERIOR');
      expect(mapElementToNationalsType('BURIED SEARCH')).toBe('BURIED');
    });

    it('should match partial strings', () => {
      expect(mapElementToNationalsType('discrimination test')).toBe('HD_CHALLENGE');
    });

    it('should default to CONTAINER for unknown elements', () => {
      expect(mapElementToNationalsType('unknown')).toBe('CONTAINER');
    });

    it('should handle empty string', () => {
      expect(mapElementToNationalsType('')).toBe('CONTAINER');
    });
  });

  describe('getNationalsElementDisplayName', () => {
    it('should return "Container" for CONTAINER', () => {
      expect(getNationalsElementDisplayName('CONTAINER')).toBe('Container');
    });

    it('should return "Buried" for BURIED', () => {
      expect(getNationalsElementDisplayName('BURIED')).toBe('Buried');
    });

    it('should return "Interior" for INTERIOR', () => {
      expect(getNationalsElementDisplayName('INTERIOR')).toBe('Interior');
    });

    it('should return "Exterior" for EXTERIOR', () => {
      expect(getNationalsElementDisplayName('EXTERIOR')).toBe('Exterior');
    });

    it('should return "Handler Discrimination" for HD_CHALLENGE', () => {
      expect(getNationalsElementDisplayName('HD_CHALLENGE')).toBe('Handler Discrimination');
    });
  });

  describe('getAllNationalsElementTypes', () => {
    it('should return all 5 element types', () => {
      const types = getAllNationalsElementTypes();
      expect(types).toHaveLength(5);
      expect(types).toEqual(['CONTAINER', 'BURIED', 'INTERIOR', 'EXTERIOR', 'HD_CHALLENGE']);
    });
  });

  describe('isValidNationalsElement', () => {
    it('should return true for valid types', () => {
      expect(isValidNationalsElement('CONTAINER')).toBe(true);
      expect(isValidNationalsElement('BURIED')).toBe(true);
      expect(isValidNationalsElement('INTERIOR')).toBe(true);
      expect(isValidNationalsElement('EXTERIOR')).toBe(true);
      expect(isValidNationalsElement('HD_CHALLENGE')).toBe(true);
    });

    it('should return false for invalid types', () => {
      expect(isValidNationalsElement('ADVANCED')).toBe(false);
      expect(isValidNationalsElement('')).toBe(false);
      expect(isValidNationalsElement('container')).toBe(false);
    });
  });

  describe('getNationalsMaxTime', () => {
    it('should return 120 for CONTAINER', () => {
      expect(getNationalsMaxTime('CONTAINER')).toBe(120);
    });

    it('should return 180 for INTERIOR', () => {
      expect(getNationalsMaxTime('INTERIOR')).toBe(180);
    });

    it('should return 180 for EXTERIOR', () => {
      expect(getNationalsMaxTime('EXTERIOR')).toBe(180);
    });

    it('should return 180 for BURIED', () => {
      expect(getNationalsMaxTime('BURIED')).toBe(180);
    });

    it('should return 180 for HD_CHALLENGE', () => {
      expect(getNationalsMaxTime('HD_CHALLENGE')).toBe(180);
    });
  });

  describe('getNationalsMaxTimeFormatted', () => {
    it('should return "2:00" for CONTAINER', () => {
      expect(getNationalsMaxTimeFormatted('CONTAINER')).toBe('2:00');
    });

    it('should return "3:00" for INTERIOR', () => {
      expect(getNationalsMaxTimeFormatted('INTERIOR')).toBe('3:00');
    });

    it('should return "3:00" for EXTERIOR', () => {
      expect(getNationalsMaxTimeFormatted('EXTERIOR')).toBe('3:00');
    });
  });

  describe('isValidCompetitionDay', () => {
    it('should return true for days 1, 2, 3', () => {
      expect(isValidCompetitionDay(1)).toBe(true);
      expect(isValidCompetitionDay(2)).toBe(true);
      expect(isValidCompetitionDay(3)).toBe(true);
    });

    it('should return false for invalid days', () => {
      expect(isValidCompetitionDay(0)).toBe(false);
      expect(isValidCompetitionDay(4)).toBe(false);
      expect(isValidCompetitionDay(-1)).toBe(false);
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
  });
});
