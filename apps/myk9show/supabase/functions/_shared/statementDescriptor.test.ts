import { describe, expect, it } from 'vitest';
import { formatStatementDescriptorSuffix } from './statementDescriptor';

describe('formatStatementDescriptorSuffix', () => {
  it('removes statement-invalid punctuation and keeps readable words', () => {
    expect(formatStatementDescriptorSuffix("Bob's & Club")).toBe('BOBS CLUB');
    expect(formatStatementDescriptorSuffix('Club "A" Trial')).toBe('CLUB A');
  });

  it('transliterates accented Latin characters to ASCII', () => {
    expect(formatStatementDescriptorSuffix('Café Déjà Vu')).toBe('CAFE DEJA');
  });

  it('falls back to the platform name for an empty name', () => {
    expect(formatStatementDescriptorSuffix('')).toBe('MYK9SHOW');
    expect(formatStatementDescriptorSuffix(null)).toBe('MYK9SHOW');
  });

  it('falls back to a value containing a letter when the name is only punctuation', () => {
    expect(formatStatementDescriptorSuffix('<>\\"\' *&')).toBe('MYK9SHOW');
    expect(formatStatementDescriptorSuffix('1234567890')).toBe('MYK9SHOW');
    expect(formatStatementDescriptorSuffix('1234567890 Club')).toBe('1C');
  });

  it('truncates at a word boundary within the safe suffix budget', () => {
    const suffix = formatStatementDescriptorSuffix('Cascade Kennel Club Fall Trial');

    expect(suffix).toBe('CASCADE');
    expect(suffix).toHaveLength(7);
    expect(suffix).toMatch(/^[A-Z0-9 ]+$/);
  });

  it('uses initials when the first word is too long to preserve a word boundary', () => {
    expect(formatStatementDescriptorSuffix('International Club')).toBe('IC');
  });
});
