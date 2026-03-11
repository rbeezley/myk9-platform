import { describe, it, expect } from 'vitest';
import { getVisibleResultFields } from '../visibility-cascade';
import type { VisibilitySettings } from '../visibility-types';

const standardSettings: VisibilitySettings = {
  placement: 'class_complete',
  qualification: 'immediate',
  time: 'class_complete',
  faults: 'class_complete',
  preset: 'standard',
};

describe('getVisibleResultFields', () => {
  describe('role bypass', () => {
    it('judges always see all fields', () => {
      const result = getVisibleResultFields(standardSettings, 'in_progress', 'judge');
      expect(result).toEqual({
        showPlacement: true,
        showQualification: true,
        showTime: true,
        showFaults: true,
      });
    });

    it('admins always see all fields', () => {
      const result = getVisibleResultFields(standardSettings, 'in_progress', 'admin');
      expect(result).toEqual({
        showPlacement: true,
        showQualification: true,
        showTime: true,
        showFaults: true,
      });
    });
  });

  describe('exhibitor with standard preset', () => {
    it('in_progress: only qualification visible', () => {
      const result = getVisibleResultFields(standardSettings, 'in_progress', 'exhibitor');
      expect(result.showQualification).toBe(true);
      expect(result.showPlacement).toBe(false);
      expect(result.showTime).toBe(false);
      expect(result.showFaults).toBe(false);
    });

    it('completed: all fields visible', () => {
      const result = getVisibleResultFields(standardSettings, 'completed', 'exhibitor');
      expect(result).toEqual({
        showPlacement: true,
        showQualification: true,
        showTime: true,
        showFaults: true,
      });
    });
  });

  describe('review preset', () => {
    const reviewSettings: VisibilitySettings = {
      placement: 'manual_release',
      qualification: 'manual_release',
      time: 'manual_release',
      faults: 'manual_release',
      preset: 'review',
    };

    it('completed but not released: nothing visible to exhibitor', () => {
      const result = getVisibleResultFields(reviewSettings, 'completed', 'exhibitor');
      expect(result).toEqual({
        showPlacement: false,
        showQualification: false,
        showTime: false,
        showFaults: false,
      });
    });

    it('released: all visible to exhibitor', () => {
      const result = getVisibleResultFields(reviewSettings, 'released', 'exhibitor');
      expect(result).toEqual({
        showPlacement: true,
        showQualification: true,
        showTime: true,
        showFaults: true,
      });
    });
  });

  describe('steward sees same as exhibitor', () => {
    it('in_progress with standard: only qualification', () => {
      const result = getVisibleResultFields(standardSettings, 'in_progress', 'steward');
      expect(result.showQualification).toBe(true);
      expect(result.showPlacement).toBe(false);
    });
  });

  describe('secretary sees same as exhibitor (no bypass)', () => {
    it('in_progress with standard: only qualification', () => {
      const result = getVisibleResultFields(standardSettings, 'in_progress', 'secretary');
      expect(result.showQualification).toBe(true);
      expect(result.showPlacement).toBe(false);
    });
  });
});
