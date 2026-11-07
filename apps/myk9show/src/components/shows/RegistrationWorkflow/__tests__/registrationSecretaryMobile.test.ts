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
const handlerDialog = read('HandlerSelectionDialog.tsx');
const enhancedDog = read('DogSelectionStepEnhanced.tsx');
const dogSearch = read('DogSearchInterface.tsx');
const dogSearchFilters = read('DogSearchFilters.tsx');

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

  // MYK9-1742: "Clear all" is no longer painted destructive (clearing filters
  // loses nothing); the guard is that the filter row uses theme tokens only.
  it('the search filter controls dark-adapt (no raw palette colours)', () => {
    expect(`${dogSearch}\n${dogSearchFilters}`).not.toMatch(
      /\b(?:text|bg|border)-(?:red|gray|slate|blue|green)-\d{2,3}\b/
    );
  });

  it('dog search does not show technical latency metadata in the mail-in flow', () => {
    expect(dogSearch).not.toContain('SearchPerformanceIndicator');
  });
});
