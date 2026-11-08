import { expect } from 'vitest';

/**
 * MYK9-1770: on every ringside screen the menu trigger sits immediately before
 * the Up control, in the same top-left group.
 */
export function expectMenuBeforeUp(menu: HTMLElement, up: HTMLElement): void {
  expect(menu.parentElement).toBe(up.parentElement);
  expect(menu.compareDocumentPosition(up) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}
