/**
 * Mobile/dark-mode guard for the secretary & mail-in registration surfaces
 * (impeccable #7 PR C). Source-text regression tests (repo fs.readFileSync
 * convention) pinning the dark: variants, grid-stacking, table horizontal
 * scroll, and dialog form stacking so a refactor can't silently drop them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(dir, rel), 'utf8');

const secretaryPayment = read('PaymentStep/SecretaryPaymentManagement.tsx');
const createExhibitor = read('CreateExhibitorDialog.tsx');
const handlerDialog = read('HandlerSelectionDialog.tsx');
const enhancedDog = read('DogSelectionStepEnhanced.tsx');
const dogSearch = read('DogSearchInterface.tsx');

describe('secretary surfaces — dark-mode + grid-stacking guards', () => {
  it('SecretaryPaymentManagement drops raw gray and dark-adapts status colors + grids', () => {
    expect(secretaryPayment).not.toContain('text-gray-600');
    expect(secretaryPayment).not.toContain('bg-gray-50');
    expect(secretaryPayment).toContain('text-success');
    expect(secretaryPayment).toContain('bg-info/10');
    // tabs and action grids stack on mobile
    expect(secretaryPayment).toContain('grid-cols-2 sm:grid-cols-4');
    expect(secretaryPayment).toContain('grid-cols-1 gap-3 sm:grid-cols-2');
  });

  it('CreateExhibitorDialog form grids stack on mobile and drop raw gray', () => {
    expect(createExhibitor).not.toContain('text-gray-');
    expect(createExhibitor).toContain('grid-cols-1 gap-4 sm:grid-cols-3'); // City/State/ZIP
    expect(createExhibitor).toContain('grid-cols-1 gap-4 sm:grid-cols-2');
  });
});

describe('secretary surfaces — a11y + responsive guards', () => {
  it('the handler reset icon button has an accessible name', () => {
    expect(handlerDialog).toContain('aria-label="Reset to owner"');
  });

  it('the dense dog table scrolls horizontally instead of crushing columns', () => {
    expect(enhancedDog).toContain('overflow-x-auto');
    expect(enhancedDog).toContain('min-w-[640px]');
    expect(enhancedDog).toContain('text-warning');
  });

  it('the search "Clear All" control dark-adapts', () => {
    expect(dogSearch).toContain('text-destructive');
  });
});
