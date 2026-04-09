import { describe, it, expect, beforeEach } from 'vitest';
import { registerFormatter, getFormatter, listFormatters, clearFormatters } from '../registry';
import type { ResultFormatter } from '../types';

function makeFormatter(org: string, sport: string): ResultFormatter {
  return {
    organization: org,
    sportType: sport,
    submissionEmail: null,
    formatXml: () => `<${org}/>`,
  };
}

describe('formatter registry', () => {
  beforeEach(() => {
    clearFormatters();
  });

  it('starts empty after clearFormatters()', () => {
    expect(listFormatters()).toHaveLength(0);
  });

  it('registers a formatter and retrieves it', () => {
    const fmt = makeFormatter('AKC', 'scent_work');
    registerFormatter(fmt);
    expect(getFormatter('AKC', 'scent_work')).toBe(fmt);
  });

  it('returns undefined for an unregistered combination', () => {
    expect(getFormatter('UKC', 'scent_work')).toBeUndefined();
  });

  it('overwrites an existing formatter for the same key', () => {
    const first = makeFormatter('AKC', 'scent_work');
    const second = makeFormatter('AKC', 'scent_work');
    registerFormatter(first);
    registerFormatter(second);
    expect(getFormatter('AKC', 'scent_work')).toBe(second);
    expect(listFormatters()).toHaveLength(1);
  });

  it('lists all registered formatters', () => {
    registerFormatter(makeFormatter('AKC', 'scent_work'));
    registerFormatter(makeFormatter('UKC', 'scent_work'));
    expect(listFormatters()).toHaveLength(2);
  });

  it('listFormatters() returns results sorted by org then sport type', () => {
    registerFormatter(makeFormatter('UKC', 'scent_work'));
    registerFormatter(makeFormatter('AKC', 'scent_work'));
    const orgs = listFormatters().map(f => f.organization);
    expect(orgs).toEqual(['AKC', 'UKC']);
  });

  it('lookup is case-insensitive for organization', () => {
    registerFormatter(makeFormatter('AKC', 'scent_work'));
    expect(getFormatter('akc', 'scent_work')).toBeDefined();
  });

  it('lookup is case-insensitive for sport type', () => {
    registerFormatter(makeFormatter('AKC', 'scent_work'));
    expect(getFormatter('AKC', 'SCENT_WORK')).toBeDefined();
  });

  it('supports multiple sport types for the same org', () => {
    registerFormatter(makeFormatter('AKC', 'scent_work'));
    registerFormatter(makeFormatter('AKC', 'fast_cat'));
    expect(getFormatter('AKC', 'scent_work')).toBeDefined();
    expect(getFormatter('AKC', 'fast_cat')).toBeDefined();
    expect(listFormatters()).toHaveLength(2);
  });
});
