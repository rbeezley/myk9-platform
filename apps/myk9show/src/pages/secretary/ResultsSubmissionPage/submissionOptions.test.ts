import { describe, expect, it } from 'vitest';
import type { ResultFormatter } from '@myk9/secretary';
import {
  buildRegistrySubmissionOptions,
  chooseDefaultSubmissionOptionKey,
} from './submissionOptions';

const akcFormatter = {
  organization: 'AKC',
  sportType: 'scent_work',
  submissionEmail: 'results@akc.org',
  formatXml: () => '<xml />',
} satisfies ResultFormatter;

describe('registry submission options', () => {
  it('adds manual UKC and ASCA options beside electronic formatters', () => {
    const options = buildRegistrySubmissionOptions([akcFormatter]);

    expect(options.map(option => option.key)).toEqual([
      'AKC:scent_work',
      'UKC:nosework',
      'ASCA:scent_detection',
    ]);
    expect(options.find(option => option.key === 'UKC:nosework')?.mode).toBe('manual');
    expect(options.find(option => option.key === 'ASCA:scent_detection')?.mode).toBe('manual');
  });

  it('defaults a UKC or ASCA show to the matching manual closeout option', () => {
    const options = buildRegistrySubmissionOptions([akcFormatter]);

    expect(chooseDefaultSubmissionOptionKey('UKC', options)).toBe('UKC:nosework');
    expect(chooseDefaultSubmissionOptionKey('ASCA', options)).toBe('ASCA:scent_detection');
    expect(chooseDefaultSubmissionOptionKey('AKC', options)).toBe('AKC:scent_work');
  });
});
