/**
 * The show wizard's sticky chrome versus keyboard focus (MYK9-764).
 *
 * The document's `scroll-padding-top` (`src/index.css`) reserves only the
 * fixed app header and PWA banner. The wizard stacks two more sticky layers
 * under them — its header and the step indicator — so a field focused or
 * scrolled to the top of the page landed underneath them (Show Name at 47px
 * behind a step indicator ending at 308px; WCAG 2.4.11, Focus Not Obscured).
 *
 * The reservation is SCOPED to the wizard's form, not the document: the
 * measured chrome height is published as `--show-wizard-chrome-height`, and
 * the step content's descendants (and the validation banner) take it as
 * `scroll-margin-top`, which adds to the document's own padding for the app
 * header. A document-wide padding would also have covered the chrome's own
 * buttons (Back, the step buttons), so tabbing onto them scrolled the page;
 * it would have pushed portalled picker lists and shortened Page Down too.
 *
 * @module ShowCreationWizard/wizardScrollChrome
 */

import { useEffect, type RefObject } from 'react';

/** A little air between the chrome and the field it uncovers. */
const GAP_PX = 8;

const CHROME_HEIGHT_VAR = '--show-wizard-chrome-height';

/**
 * `scroll-margin-top` for the wizard's form content. On the step content
 * wrapper (applies to every descendant) and on anything else scrolled into
 * view under the chrome, such as the validation banner.
 */
export const WIZARD_CONTENT_SCROLL_MARGIN_CLASS =
  '[&_*]:scroll-mt-[var(--show-wizard-chrome-height,0px)]';
export const WIZARD_SCROLL_MARGIN_CLASS = 'scroll-mt-[var(--show-wizard-chrome-height,0px)]';

/** The wizard chrome's height, header plus step indicator plus a gap, in px. */
export function wizardChromeHeightPx(headerPx: number, stepsPx: number): number {
  return Math.round(headerPx + stepsPx + GAP_PX);
}

/**
 * Publish the wizard chrome's height as `--show-wizard-chrome-height` while
 * mounted, re-measuring when either layer resizes (the breadcrumb and step
 * labels wrap on a phone). It goes on the element WizardHeader publishes its
 * own `--show-wizard-header-height` on — an ancestor of the step indicator,
 * the form and the banner — and that element resizes whenever the header
 * does, so it is observed too.
 */
export function useWizardChromeHeight(stepsRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const steps = stepsRef.current;
    if (!steps) return;
    let publisher: HTMLElement | null = steps.parentElement;
    while (publisher && !publisher.style.getPropertyValue('--show-wizard-header-height')) {
      publisher = publisher.parentElement;
    }
    const target = publisher ?? steps.parentElement;
    if (!target) return;
    const apply = () => {
      const headerPx =
        parseFloat(publisher?.style.getPropertyValue('--show-wizard-header-height') ?? '') || 0;
      target.style.setProperty(
        CHROME_HEIGHT_VAR,
        `${wizardChromeHeightPx(headerPx, steps.offsetHeight)}px`
      );
    };
    apply();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply);
    observer?.observe(steps);
    if (publisher) observer?.observe(publisher);
    return () => {
      observer?.disconnect();
      target.style.removeProperty(CHROME_HEIGHT_VAR);
    };
  }, [stepsRef]);
}

/** Top of the band a control must sit in to be clear of the chrome: the
 * document's scroll padding (app header) plus the control's own scroll margin
 * (the wizard chrome). */
function reservedTop(element: HTMLElement): number {
  return (
    (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) +
    (parseFloat(getComputedStyle(element).scrollMarginTop) || 0)
  );
}

/** On screen and not under the chrome. The GAP_PX of air the scroll margin
 * adds is for placement only: a control inside it is not obscured. */
function isClearOfChrome(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.top >= reservedTop(element) - GAP_PX && rect.bottom <= window.innerHeight;
}

function isKeyboardFocus(element: HTMLElement): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}

/**
 * Focus without moving a page the secretary is already looking at: when the
 * control is on screen below the chrome, `preventScroll`. Otherwise bring it
 * into view with `scrollIntoView({ block: 'nearest' })`, which honours the
 * scroll margin, then focus without scrolling: a bare `focus()` leaves the
 * position to Chrome's centred focus scroll, which in a ~600px window can put
 * the field back under the chrome.
 */
export function focusWithoutJump(element: HTMLElement): void {
  if (!isClearOfChrome(element)) element.scrollIntoView({ block: 'nearest' });
  element.focus({ preventScroll: true });
}

/**
 * The same guarantee for keyboard focus inside the wizard's form: after Tab
 * or Shift+Tab, a control the browser's own focus scroll left under the
 * chrome (or off screen) is re-revealed with a margin-honouring
 * `scrollIntoView`. Keyboard focus only (`:focus-visible`): a click means the
 * secretary could already see what they clicked, and nudging the page under
 * their pointer — e.g. as a date picker opens — is its own surprise. Attach
 * to the step content's `onFocus` (React's focus event bubbles).
 */
export function revealFocusedBelowChrome(event: { target: EventTarget | null }): void {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !isKeyboardFocus(target)) return;
  if (!isClearOfChrome(target)) target.scrollIntoView({ block: 'nearest' });
}
