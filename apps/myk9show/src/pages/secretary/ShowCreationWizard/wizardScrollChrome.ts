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

/**
 * Focus without moving a page the secretary is already looking at: when the
 * control is fully on screen below the reserved chrome — the document's scroll
 * padding plus the control's own scroll margin — `preventScroll`; otherwise let
 * the browser bring it into view, clear of the chrome. A bare `focus()` 350ms
 * after every step change used to jump a scrolled page back to the top.
 */
export function focusWithoutJump(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const reserved =
    (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) +
    (parseFloat(getComputedStyle(element).scrollMarginTop) || 0);
  const onScreen = rect.top >= reserved && rect.bottom <= window.innerHeight;
  element.focus(onScreen ? { preventScroll: true } : undefined);
}
