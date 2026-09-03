import { describe, it, expect, beforeEach, vi } from 'vitest';

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
  let registerFormatter: typeof import('../registry').registerFormatter;
  let listFormatters: typeof import('../registry').listFormatters;
  beforeEach(async () => {
    vi.resetModules();
    ({ registerFormatter, listFormatters } = await import('../registry'));
  });

  it('starts empty before registration', () => {
    expect(listFormatters()).toHaveLength(0);
  });

  it('registers a formatter and retrieves it', () => {
    const fmt = makeFormatter('AKC', 'scent_work');
    registerFormatter(fmt);
    expect(listFormatters()).toEqual([fmt]);
  });

  it('overwrites an existing formatter for the same key', () => {
    const first = makeFormatter('AKC', 'scent_work');
    const second = makeFormatter('AKC', 'scent_work');
    registerFormatter(first);
    registerFormatter(second);
    expect(listFormatters()).toEqual([second]);
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

  it('supports multiple sport types for the same org', () => {
    registerFormatter(makeFormatter('AKC', 'scent_work'));
    registerFormatter(makeFormatter('AKC', 'fast_cat'));
    expect(listFormatters()).toHaveLength(2);
  });
});
