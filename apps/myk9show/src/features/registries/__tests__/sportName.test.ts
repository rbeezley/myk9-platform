import { describe, expect, it } from 'vitest';
import { getRegistrySportName } from '../index';

describe('getRegistrySportName', () => {
  it('names each registry sport', () => {
    expect(getRegistrySportName('AKC')).toBe('Scent Work');
    expect(getRegistrySportName('UKC')).toBe('Nosework');
    expect(getRegistrySportName('ASCA')).toBe('Scent Detection');
  });

  it('is case-insensitive', () => {
    expect(getRegistrySportName('ukc')).toBe('Nosework');
    expect(getRegistrySportName(' asca ')).toBe('Scent Detection');
  });

  it('falls back to Scent Work for null, empty and unknown', () => {
    expect(getRegistrySportName(null)).toBe('Scent Work');
    expect(getRegistrySportName(undefined)).toBe('Scent Work');
    expect(getRegistrySportName('')).toBe('Scent Work');
    expect(getRegistrySportName('FCI')).toBe('Scent Work');
    expect(getRegistrySportName('constructor')).toBe('Scent Work');
  });
});
