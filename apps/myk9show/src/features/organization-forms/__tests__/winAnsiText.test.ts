import { describe, expect, it } from 'vitest';
import { toWinAnsiSafeText } from '../winAnsiText';

describe('toWinAnsiSafeText', () => {
  it('leaves WinAnsi-encodable Latin-1 accents unchanged', async () => {
    await expect(toWinAnsiSafeText('Zoë Müller')).resolves.toBe('Zoë Müller');
  });

  it('transliterates a non-WinAnsi Polish letter to its ASCII equivalent', async () => {
    await expect(toWinAnsiSafeText('Łukasz')).resolves.toBe('Lukasz');
    await expect(toWinAnsiSafeText('łukasz')).resolves.toBe('lukasz');
  });

  it('transliterates a non-WinAnsi caron via NFKD while keeping WinAnsi-safe accents', async () => {
    // 'ř' (r-with-caron) isn't in WinAnsi and gets decomposed to plain 'r';
    // 'á' already is WinAnsi-safe, so it's preserved unlike 'ř'.
    await expect(toWinAnsiSafeText('Dvořák')).resolves.toBe('Dvorák');
  });

  it('drops an emoji with no ASCII equivalent', async () => {
    await expect(toWinAnsiSafeText('Chairperson 😀')).resolves.toBe('Chairperson ');
  });

  it('leaves plain ASCII untouched', async () => {
    await expect(toWinAnsiSafeText('Springfield, IL')).resolves.toBe('Springfield, IL');
  });

  it('returns an empty string unchanged', async () => {
    await expect(toWinAnsiSafeText('')).resolves.toBe('');
  });
});
