import {
  RING_ROLES,
  GENERAL_DUTY_ROLES,
  ALL_VOLUNTEER_ROLES,
  formatVolunteerDisplayName,
} from '../volunteer';

describe('volunteer types', () => {
  describe('RING_ROLES', () => {
    it('contains exactly 3 ring roles', () => {
      expect(RING_ROLES).toEqual(['Gate Steward', 'Timer', 'Ring Steward']);
    });
  });

  describe('GENERAL_DUTY_ROLES', () => {
    it('contains exactly 4 general duty roles', () => {
      expect(GENERAL_DUTY_ROLES).toEqual(['Hospitality', 'Equipment', 'Ring Setup', 'Ribbons']);
    });
  });

  describe('ALL_VOLUNTEER_ROLES', () => {
    it('contains all 7 roles', () => {
      expect(ALL_VOLUNTEER_ROLES).toHaveLength(7);
      expect(ALL_VOLUNTEER_ROLES).toEqual([...RING_ROLES, ...GENERAL_DUTY_ROLES]);
    });
  });

  describe('formatVolunteerDisplayName', () => {
    it('returns first name + last initial for multi-word names', () => {
      expect(formatVolunteerDisplayName('Sarah Miller')).toBe('Sarah M.');
    });

    it('returns single name as-is', () => {
      expect(formatVolunteerDisplayName('Sarah')).toBe('Sarah');
    });

    it('handles three-part names using last word as last name', () => {
      expect(formatVolunteerDisplayName('Mary Jane Watson')).toBe('Mary Jane W.');
    });

    it('trims whitespace', () => {
      expect(formatVolunteerDisplayName('  Sarah Miller  ')).toBe('Sarah M.');
    });
  });
});
