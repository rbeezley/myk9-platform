/**
 * The show wizard's sticky chrome versus keyboard focus (MYK9-764).
 *
 * The document's `scroll-padding-top` (`src/index.css`) reserves only the
 * fixed app header and PWA banner. The wizard adds two sticky layers under
 * them — its header and the step indicator — so a field focused or scrolled
 * to the top of the page landed underneath ~150–250px of chrome (WCAG 2.4.11,
 * Focus Not Obscured). While the wizard is mounted, the document's scroll
 * padding also reserves their measured heights; the browser then keeps every
 * focus and scrollIntoView clear of them.
 *
 * @module ShowCreationWizard/wizardScrollChrome
 */

import { useEffect, type RefObject } from 'react';

/** A little air between the chrome and the field it uncovers. */
const GAP_PX = 8;

/** The scroll padding for chrome of these measured heights. */
export function wizardScrollPaddingTop(headerPx: number, stepsPx: number): string {
  return `calc(var(--app-top-inset, 3rem) + ${Math.round(headerPx + stepsPx + GAP_PX)}px)`;
}

/**
 * Reserve the wizard header's and step indicator's heights in the document's
 * scroll padding while mounted, re-measuring when either resizes (the
 * breadcrumb and step labels wrap on a phone). The header's height is the
 * `--show-wizard-header-height` WizardHeader already publishes on its parent,
 * which the step indicator inherits; that parent resizes whenever the header
 * does, so it is observed too. Restores the previous inline value on unmount.
 */
export function useWizardScrollPadding(stepsRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const steps = stepsRef.current;
    if (!steps) return;
    const root = document.documentElement;
    const previous = root.style.scrollPaddingTop;
    // The element WizardHeader publishes its height on: an ancestor of the
    // step indicator, since the header is the indicator's sibling.
    let publisher: HTMLElement | null = steps.parentElement;
    while (publisher && !publisher.style.getPropertyValue('--show-wizard-header-height')) {
      publisher = publisher.parentElement;
    }
    const apply = () => {
      const headerPx =
        parseFloat(publisher?.style.getPropertyValue('--show-wizard-header-height') ?? '') || 0;
      root.style.scrollPaddingTop = wizardScrollPaddingTop(headerPx, steps.offsetHeight);
    };
    apply();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply);
    observer?.observe(steps);
    if (publisher) observer?.observe(publisher);
    return () => {
      observer?.disconnect();
      root.style.scrollPaddingTop = previous;
    };
  }, [stepsRef]);
}

/**
 * Focus without moving a page the secretary is already looking at: when the
 * control is fully on screen below the reserved chrome, `preventScroll`;
 * otherwise let the browser bring it into view (clear of the chrome, via the
 * scroll padding above). A bare `focus()` 350ms after every step change used to
 * jump a scrolled page back to the top.
 */
export function focusWithoutJump(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const reserved = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const onScreen = rect.top >= reserved && rect.bottom <= window.innerHeight;
  element.focus(onScreen ? { preventScroll: true } : undefined);
}
