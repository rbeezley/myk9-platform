import { describe, it, expect } from 'vitest';
import { AKCScentWorkFormatter } from '../formatters/AKCScentWorkFormatter';
import type { SubmissionData } from '../types';

function makeData(overrides: Partial<SubmissionData> = {}): SubmissionData {
  return {
    show: {
      id: 'show-1',
      name: 'Spring Scent Trial',
      clubName: 'Acme K9 Club',
      date: '2026-05-10',
      clubLicenseNumber: '12345',
    },
    trial: {
      id: 'trial-1',
      trialNumber: 1,
      date: '2026-05-10',
      judgeName: 'Jane Smith',
      organization: 'AKC',
      sportType: 'scent_work',
    },
    entries: [],
    ...overrides,
  };
}

describe('AKCScentWorkFormatter', () => {
  it('has organization AKC', () => {
    expect(AKCScentWorkFormatter.organization).toBe('AKC');
  });

  it('has sportType scent_work', () => {
    expect(AKCScentWorkFormatter.sportType).toBe('scent_work');
  });

  it('returns a non-empty string', () => {
    const xml = AKCScentWorkFormatter.formatXml(makeData());
    expect(typeof xml).toBe('string');
    expect(xml.length).toBeGreaterThan(0);
  });

  it('starts with the XML declaration', () => {
    const xml = AKCScentWorkFormatter.formatXml(makeData());
    expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
  });

  it('contains the AKCResults root element', () => {
    const xml = AKCScentWorkFormatter.formatXml(makeData());
    expect(xml).toContain('<AKCResults>');
    expect(xml).toContain('</AKCResults>');
  });

  it('includes the show name in the output', () => {
    const xml = AKCScentWorkFormatter.formatXml(makeData());
    expect(xml).toContain('Spring Scent Trial');
  });

  it('includes the trial number', () => {
    const xml = AKCScentWorkFormatter.formatXml(makeData());
    expect(xml).toContain('1');
  });

  it('includes the trial date', () => {
    const xml = AKCScentWorkFormatter.formatXml(makeData());
    expect(xml).toContain('2026-05-10');
  });

  it('includes entry count of 0 for empty entries', () => {
    const xml = AKCScentWorkFormatter.formatXml(makeData());
    expect(xml).toContain('0');
  });

  it('escapes ampersands in show name', () => {
    const xml = AKCScentWorkFormatter.formatXml(
      makeData({ show: { ...makeData().show, name: 'Dogs & Cats Trial' } })
    );
    expect(xml).toContain('Dogs &amp; Cats Trial');
    expect(xml).not.toContain('Dogs & Cats Trial');
  });

  it('handles null trial date gracefully', () => {
    const data = makeData();
    data.trial.date = null;
    expect(() => AKCScentWorkFormatter.formatXml(data)).not.toThrow();
  });
});
