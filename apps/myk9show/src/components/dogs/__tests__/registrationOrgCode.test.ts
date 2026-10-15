import { describe, it, expect } from 'vitest';
import { registrationOrgCode } from '../registrationForm';

describe('registrationOrgCode', () => {
  it.each([
    ['UKC (United Kennel Club)', 'UKC'],
    ['UKC', 'UKC'],
    ['AKC', 'AKC'],
    ['ASCA', 'ASCA'],
    ['CKC', 'CKC'],
    ['FCI', 'FCI'],
    ['KC', 'KC'],
    ['Mixed Breed', 'AKC'],
    ['', 'AKC'],
  ])('%s -> %s', (input, expected) => {
    expect(registrationOrgCode(input)).toBe(expected);
  });
});
