import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { premiumJuniorFee } from './juniorFee.ts';

describe('premiumJuniorFee', () => {
  it('omits the junior tier for ASCA even when a stale value is stored', () => {
    expect(premiumJuniorFee('ASCA', 15)).toBeNull();
  });

  it('includes a positive numeric fee for a supported registry', () => {
    expect(premiumJuniorFee('AKC', 15)).toBe(15);
  });

  it('rejects untyped and zero fee values', () => {
    expect(premiumJuniorFee('AKC', '15')).toBeNull();
    expect(premiumJuniorFee('UKC', 0)).toBeNull();
  });
});

it('uses the supported junior fee in both the payload and narrative prompt', () => {
  const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
  expect(
    source.match(/premiumJuniorFee\(show\.organization, show\.junior_handler_fee\)/g)
  ).toHaveLength(2);
});
