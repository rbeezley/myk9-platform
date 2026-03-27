import { describe, it, expect } from 'vitest';
import { deriveSportType } from '../types';

describe('deriveSportType', () => {
  it('returns akc-scent-work for AKC + Scent Work', () => {
    expect(deriveSportType('AKC', 'Scent Work')).toBe('akc-scent-work');
  });

  it('returns akc-scent-work-nationals for AKC + Scent Work Nationals', () => {
    expect(deriveSportType('AKC', 'Scent Work Nationals')).toBe('akc-scent-work-nationals');
  });

  it('returns akc-fast-cat for AKC + FastCAT', () => {
    expect(deriveSportType('AKC', 'FastCAT')).toBe('akc-fast-cat');
  });

  it('returns ukc-nosework for UKC + Nosework', () => {
    expect(deriveSportType('UKC', 'Nosework')).toBe('ukc-nosework');
  });

  it('returns ukc-rally for UKC + Rally', () => {
    expect(deriveSportType('UKC', 'Rally')).toBe('ukc-rally');
  });

  it('returns ukc-obedience for UKC + Obedience', () => {
    expect(deriveSportType('UKC', 'Obedience')).toBe('ukc-obedience');
  });

  it('returns ukc-obedience for UKC + Obedience & Rally', () => {
    expect(deriveSportType('UKC', 'Obedience & Rally')).toBe('ukc-obedience');
  });

  it('returns asca-scent-detection for ASCA + Scent Detection', () => {
    expect(deriveSportType('ASCA', 'Scent Detection')).toBe('asca-scent-detection');
  });

  it('returns null for unknown combos', () => {
    expect(deriveSportType('AKC', 'Agility')).toBeNull();
    expect(deriveSportType('AKC', '')).toBeNull();
    expect(deriveSportType('', 'Scent Work')).toBeNull();
  });
});
