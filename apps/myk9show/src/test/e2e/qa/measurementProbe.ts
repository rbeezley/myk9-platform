/**
 * In-page measurement probe for the route-wide a11y/geometry sweep.
 *
 * This module exports ONE function, `measurePage`, which is serialised into the
 * browser by `page.evaluate`. It therefore may not reference imports, module
 * scope, or anything outside its own body — everything it needs is inlined.
 *
 * ## Why this file is written so defensively
 *
 * The round-5 registration pass (#1901) established that a measurement harness
 * is a program, and an unverified one reports its own bugs as findings about
 * the app. That probe produced, in order: 1,113 phantom contrast defects
 * (Chrome serialises this app's computed colours as `color(srgb 0.094 ...)` —
 * CSS Color 4, components 0–1, not 8-bit, so parsing the numbers as bytes
 * collapsed every ratio to ~1.0); then a repair that read the blue channel of
 * `rgb(24, 20, 17)` as an alpha; then 504 phantom tap-target failures, because
 * each 16x16 checkbox is wrapped in a clickable card a finger cannot miss.
 *
 * None of those looked like a broken tool. They looked like an app in terrible
 * shape — which is the state of mind in which you start "fixing" working code.
 *
 * So this probe:
 *   - never parses a colour string; it composites over white and over black and
 *     recovers the channels, which is exact for every CSS syntax;
 *   - runs known-answer checks on every page and returns them alongside the
 *     findings, so a caller can refuse to trust a run whose arithmetic broke;
 *   - reports what it could NOT measure as its own count, rather than silently
 *     dropping it (a shrinking `measured` count is how a probe quietly stops
 *     looking at the app);
 *   - walks to the effective interactive target before calling a control small.
 *
 * Findings-only: nothing here asserts. The sweep records what it measured.
 */

import type {
  ContrastFinding,
  ContrastGroup,
  TargetGroup,
  NameFinding,
  OverflowSource,
  ProbeResult,
  ProbeSanity,
  TargetFinding,
} from './measurementProbeTypes';

export type * from './measurementProbeTypes';

/**
 * Serialised into the page by `page.evaluate`. Self-contained by necessity.
 *
 * @param limit Max findings retained per category. Everything is measured; only
 *   the report is truncated, and the caller is told the true totals separately.
 */
export function measurePage(limit: number): ProbeResult {
  // ── Colour ────────────────────────────────────────────────────────────────
  // Never parse the string. Paint the colour over white and over black and
  // recover premultiplied alpha from the difference. Exact for rgb(), oklch(),
  // color(srgb ...), colour keywords, and anything a future Chrome invents.
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const parse = (css: string): [number, number, number, number] => {
    const sample = (backdrop: string) => {
      ctx.globalCompositeOperation = 'copy';
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, 1, 1);
      ctx.globalCompositeOperation = 'source-over';
      // Assigning an unparseable colour leaves fillStyle at its previous value,
      // so seed it with the backdrop: an invalid colour then reads as "fully
      // transparent" rather than as whatever the last element happened to be.
      ctx.fillStyle = backdrop;
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      return ctx.getImageData(0, 0, 1, 1).data;
    };
    const w = sample('#fff');
    const b = sample('#000');
    const a = 1 - (w[0] - b[0]) / 255;
    if (a <= 0.002) return [0, 0, 0, 0];
    return [b[0] / a, b[1] / a, b[2] / a, a];
  };

  const luminance = (rgb: number[]) => {
    const channel = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  };

  const over = (fg: number[], bg: number[]) => [
    fg[0] * fg[3] + bg[0] * (1 - fg[3]),
    fg[1] * fg[3] + bg[1] * (1 - fg[3]),
    fg[2] * fg[3] + bg[2] * (1 - fg[3]),
    1,
  ];

  const ratioOf = (fg: number[], bg: number[]) => {
    const l1 = luminance(over(fg, bg));
    const l2 = luminance(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  const round = (n: number) => Math.round(n * 100) / 100;

  // Known answers. If the arithmetic above breaks, these move and the caller
  // discards the run instead of filing its output as defects.
  const white = parse('#ffffff');
  const black = parse('#000000');
  const grey = parse('#767676');
  const contrastSanity = {
    blackOnWhite: round(ratioOf(black, white)),
    whiteOnWhite: round(ratioOf(white, white)),
    greyOnWhite: round(ratioOf(grey, white)),
  };

  // ── Shared element helpers ────────────────────────────────────────────────
  const describe = (el: Element): string => {
    const parts: string[] = [];
    let cur: Element | null = el;
    for (let i = 0; cur && i < 3; i++) {
      const id = cur.id ? `#${cur.id}` : '';
      const cls = String((cur as HTMLElement).className || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(c => `.${c}`)
        .join('');
      parts.unshift(`${cur.tagName.toLowerCase()}${id}${cls}`);
      cur = cur.parentElement;
    }
    return parts.join(' > ').slice(0, 160);
  };

  const effectiveOpacity = (el: Element) => {
    let acc = 1;
    let cur: Element | null = el;
    while (cur) {
      acc *= Number(getComputedStyle(cur).opacity);
      cur = cur.parentElement;
    }
    return acc;
  };

  /**
   * Opacity is part of visibility here, not a separate refinement. A closed
   * dialog or menu that stays mounted at `opacity: 0` still has a real bounding
   * box, `display: block` and `visibility: visible` — so a predicate built from
   * geometry alone hands its buttons to the target and accessible-name scans as
   * findings about controls nobody can see (Codex, this PR). That is the same
   * class of error as round 5's 504 phantom checkboxes: derived correctly from
   * the wrong premise.
   */
  const isVisible = (el: Element) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    if (effectiveOpacity(el) <= 0.01) return false;
    return true;
  };

  // WCAG 1.4.3 and 2.5.x both exempt inactive controls, and this app dims them
  // with `disabled:opacity-50` — counting them files findings the standard
  // excuses, which is how a report loses its credibility on the first read.
  const isInactive = (el: Element) =>
    Boolean(el.closest('[disabled],[aria-disabled="true"],:disabled'));

  /**
   * Composite the backdrop rather than stopping at the first opaque ancestor.
   * The registration wizard's step captions sit on a translucent tint over the
   * card, so the surface they are actually read against is rgb(48,38,32), not
   * the card's #1e1c19 — a 3.96:1 caption reads as 4.55:1 if the tint is
   * ignored, which is exactly what hid that defect for months.
   *
   * Returns null when an image or gradient is in the stack: those cannot be
   * reduced to one colour, so the honest answer is "not measured".
   */
  const backdropOf = (el: Element): number[] | null => {
    let acc: number[] | null = null;
    let cur: Element | null = el;
    while (cur) {
      const cs = getComputedStyle(cur);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parse(cs.backgroundColor);
      if (c[3] > 0) {
        acc = acc ? over(acc, c) : c;
        if (c[3] === 1) return acc;
      }
      cur = cur.parentElement;
    }
    // Nothing opaque was reached: the canvas below the document is the UA's
    // page background, which the app paints on <body>/<html>. Fall back to
    // white so a missing opaque layer cannot silently read as black-on-black.
    return acc ? over(acc, [255, 255, 255, 1]) : [255, 255, 255, 1];
  };

  // ── Contrast ──────────────────────────────────────────────────────────────
  // Only elements holding a direct text node are measured. Without that filter
  // every ancestor re-reports its descendants' text and one caption becomes a
  // dozen identical findings.
  const contrast: ContrastFinding[] = [];
  let measured = 0;
  let unmeasurable = 0;

  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
    const ownText = Array.from(el.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent || '')
      .join('')
      .trim();
    if (!ownText) continue;
    if (!isVisible(el) || isInactive(el)) continue;

    const bg = backdropOf(el);
    if (!bg) {
      unmeasurable++;
      continue;
    }

    const cs = getComputedStyle(el);
    const raw = parse(cs.color);
    const opacity = effectiveOpacity(el);
    if (opacity <= 0.01) continue;
    const fg = [raw[0], raw[1], raw[2], raw[3] * opacity];
    measured++;

    const fontPx = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const bold = weight >= 700;
    // WCAG "large scale": 18pt (24px), or 14pt (18.66px) bold.
    const required = fontPx >= 24 || (fontPx >= 18.66 && bold) ? 3 : 4.5;
    const ratio = ratioOf(fg, bg);
    // 0.05 of slack absorbs sub-pixel rounding in the canvas round-trip; a
    // token sitting exactly on the boundary is not a finding.
    if (ratio >= required - 0.05) continue;

    contrast.push({
      kind: 'contrast',
      text: ownText.replace(/\s+/g, ' ').slice(0, 60),
      ratio: round(ratio),
      required,
      fontPx: round(fontPx),
      bold,
      fg: cs.color,
      bg: `rgb(${bg.slice(0, 3).map(Math.round).join(', ')})`,
      opacity: round(opacity),
      where: describe(el),
    });
  }

  // ── Interactive targets and accessible names ──────────────────────────────
  const INTERACTIVE = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="switch"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="link"]',
  ].join(',');

  /**
   * The touched area, not the styled box. A 16x16 checkbox inside a clickable
   * card is not a small target — a finger cannot miss the card. Round 5's probe
   * reported 504 of exactly that before this walk existed.
   */
  const effectiveBox = (el: Element): DOMRect => {
    let best = el.getBoundingClientRect();

    const consider = (candidate: Element | null) => {
      if (!candidate) return;
      const r = candidate.getBoundingClientRect();
      if (r.width * r.height > best.width * best.height) best = r;
    };

    // An associated <label> is a real target for the control it names.
    if (el.id) consider(document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
    consider(el.closest('label'));

    // The STRETCHED-LINK pattern: an anchor whose ::after is absolutely
    // positioned across its nearest positioned ancestor, so the whole card is
    // the hit area even though the anchor is a line of text.
    //
    // `getBoundingClientRect()` excludes pseudo-elements, and the card need not
    // set `cursor: pointer` — the anchor supplies the interactivity — so the
    // ancestor walk below cannot see it either. Left unhandled this reports
    // every card title in the app as a ~24px target (MYK9-281): 12 of the 26
    // findings on /dogs alone were `BrowseCard`, which needs no fix at all.
    //
    // Same family as the round-5 trap this probe was built to avoid — 504
    // phantom checkbox findings, each wrapped in a clickable card. That one was
    // solved by the pointer-cursor walk; this one slips past it because the
    // interactivity lives in a pseudo-element rather than an ancestor.
    const after = getComputedStyle(el, '::after');
    if (after.position === 'absolute' && after.content !== 'none') {
      // Its containing block is the nearest positioned ancestor, which is the
      // box the pseudo-element actually covers.
      let host: Element | null = el.parentElement;
      for (let i = 0; host && i < 6; i++) {
        if (host === document.body) break;
        const pos = getComputedStyle(host).position;
        if (pos !== 'static') {
          consider(host);
          break;
        }
        host = host.parentElement;
      }
    }

    // A clickable ancestor: pointer cursor, and still a component-sized box
    // rather than the page shell.
    let cur: Element | null = el.parentElement;
    for (let i = 0; cur && i < 6; i++) {
      if (cur === document.body || cur.tagName === 'MAIN') break;
      const r = cur.getBoundingClientRect();
      if (r.height > window.innerHeight * 0.6) break;
      if (getComputedStyle(cur).cursor === 'pointer') consider(cur);
      cur = cur.parentElement;
    }
    return best;
  };

  /**
   * Known-answer check for `effectiveBox`, run on every page against a
   * synthetic stretched link. The contrast sanity values above catch broken
   * arithmetic; nothing caught broken GEOMETRY until MYK9-281, where every card
   * title in the app was reported as a ~24px target for a full sweep.
   *
   * Builds a 200x120 positioned card containing a one-line anchor whose ::after
   * is inset-0. The correct answer is 120 — the card. A regression returns the
   * anchor's own ~20px line box, and the report then discards the run instead of
   * publishing the inflated count.
   */
  const stretchedLinkSelfTest = (): number => {
    const card = document.createElement('div');
    card.setAttribute('style', 'position:relative;width:200px;height:120px;left:-9999px;top:0');
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = 'self test';
    card.appendChild(link);
    document.body.appendChild(card);

    const style = document.createElement('style');
    style.textContent =
      '#probe-self-test a::after{content:"";position:absolute;inset:0;}';
    card.id = 'probe-self-test';
    document.head.appendChild(style);

    const measured = Math.round(effectiveBox(link).height);

    card.remove();
    style.remove();
    return measured;
  };

  /**
   * A link inside a sentence is exempt from WCAG 2.5.8 — its size is set by the
   * text flow. Without this, every body-copy link is a finding and the target
   * list becomes unreadable.
   */
  const isInlineLink = (el: Element) => {
    if (el.tagName !== 'A') return false;
    if (!getComputedStyle(el).display.startsWith('inline')) return false;
    const parentText = (el.parentElement?.textContent || '').trim().length;
    const ownText = (el.textContent || '').trim().length;
    return parentText > ownText + 3;
  };

  const accessibleName = (el: Element): string => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map(id => document.getElementById(id)?.textContent || '')
        .join(' ')
        .trim();
      if (text) return text;
    }
    // Native labels, both associations, and BEFORE `title` — that is the
    // ACCNAME precedence, and it matters here because a wrapping
    // `<label><input> Text</label>` is every bit as valid as `label[for]`.
    // Checking only the explicit form reported the landing page's waitlist
    // radios and the sign-up consent checkbox as unnamed; `effectiveBox` two
    // functions down already walked to `closest('label')` for the target check,
    // so the probe knew about implicit labels and simply did not use them here.
    if (el.id) {
      const explicit = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (explicit?.textContent?.trim()) return explicit.textContent.trim();
    }
    const wrapping = el.closest('label');
    if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();

    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();

    const own = (el.textContent || '').trim();
    if (own) return own;
    const alt = el.querySelector('img[alt]')?.getAttribute('alt');
    if (alt && alt.trim()) return alt.trim();

    // An input's `value` names the control only for the button-like types,
    // where the value IS the visible label. For a text input the value is user
    // data, so accepting it as a name means a prefilled unlabelled field
    // reports as accessible and an empty one reports as a defect — the finding
    // would depend on whether the fixture happened to have typed something
    // (Codex, this PR). `type=image` is named by its alt attribute.
    if (el.tagName === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'image') {
        const imageAlt = el.getAttribute('alt');
        return imageAlt && imageAlt.trim() ? imageAlt.trim() : '';
      }
      if (type === 'button' || type === 'submit' || type === 'reset') {
        const value = (el as HTMLInputElement).value;
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    }
    return '';
  };

  const sanity: ProbeSanity = {
    ...contrastSanity,
    stretchedLink: stretchedLinkSelfTest(),
  };

  const targets: TargetFinding[] = [];
  const names: NameFinding[] = [];

  const candidates = Array.from(document.querySelectorAll<HTMLElement>(INTERACTIVE))
    .filter(el => isVisible(el) && !isInactive(el))
    .map(el => ({
      el,
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      name: accessibleName(el),
      box: effectiveBox(el),
    }));
  const interactive = candidates.length;

  const centers = candidates.map(c => ({
    x: c.box.left + c.box.width / 2,
    y: c.box.top + c.box.height / 2,
  }));

  /**
   * WCAG 2.5.8's spacing exception, as actually worded: an undersized target
   * conforms if a 24 CSS-pixel-diameter circle centred on it intersects neither
   * another target nor the circle of another undersized target.
   *
   * Both halves are required, and the first is the one that bites. Comparing
   * centre distances alone tests only circle-against-circle, which is the
   * weaker half: a 16px control whose neighbour is a large button 20px away
   * passes the centre test while its circle plainly overlaps that button. An
   * under-strict exception is worse here than an over-strict one, because it
   * produces a confident "no WCAG target failures" conclusion out of a check
   * that was not looking (Codex, this PR).
   *
   * Reporting these at all still needs care in the other direction — a
   * generously spaced 18px footer link row genuinely conforms, and calling it a
   * defect is the same class of error as round 5's 504 phantom checkboxes.
   */
  const RADIUS = 12;
  const spacingExempt = (index: number) => {
    const a = centers[index];
    for (let j = 0; j < candidates.length; j++) {
      if (j === index) continue;
      const other = candidates[j].box;
      const otherSmallest = Math.min(other.width, other.height);

      if (otherSmallest < 24) {
        // Both undersized: the circles must not intersect.
        const b = centers[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < 2 * RADIUS) return false;
        continue;
      }

      // Circle against the other target's bounding box: the closest point of
      // that box must lie at least one radius away from this target's centre.
      const dx = Math.max(other.left - a.x, 0, a.x - (other.left + other.width));
      const dy = Math.max(other.top - a.y, 0, a.y - (other.top + other.height));
      if (Math.hypot(dx, dy) < RADIUS) return false;
    }
    return true;
  };

  for (let i = 0; i < candidates.length; i++) {
    const { el, role, name, box } = candidates[i];

    if (!name) {
      names.push({
        kind: 'name',
        role,
        html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 120),
        where: describe(el),
      });
    }

    if (isInlineLink(el)) continue;
    const smallest = Math.min(box.width, box.height);
    if (smallest >= 44) continue;

    targets.push({
      kind: 'target',
      label: (name || '(unnamed)').slice(0, 48),
      role,
      width: Math.round(box.width),
      height: Math.round(box.height),
      under24: smallest < 24 && !spacingExempt(i),
      where: describe(el),
    });
  }

  // ── Horizontal overflow ───────────────────────────────────────────────────
  const overflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  const overflowSources: OverflowSource[] = Array.from(document.querySelectorAll('*'))
    .map(el => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        className: String((el as HTMLElement).className || '').slice(0, 80),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        left: Math.round(r.left),
        right: Math.round(r.right),
      };
    })
    .filter(s => s.left < -1 || s.right > window.innerWidth + 1)
    .slice(0, 3);

  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const bodyRgb = parse(bodyBg);
  const bodyOpaque = over(bodyRgb, [255, 255, 255, 1]);

  // Totals are captured BEFORE truncation. A report that prints `limit` rows
  // and calls that the count understates the page, which is the same class of
  // lie as a silently capped sweep.
  const totals = {
    contrast: contrast.length,
    targets: targets.length,
    names: names.length,
  };

  // Cluster signatures are ALSO aggregated before truncation, and this is not a
  // nicety. The report ranks by how many routes a signature spans, so if the
  // cross-route grouping were built from the truncated rows, a colour pair used
  // 400 times on a page would vanish from the ranking whenever it was not among
  // that page's 12 worst readings — the report would claim to rank by spread
  // while measuring only severity (Codex, this PR).
  const contrastGroups = new Map<string, ContrastGroup>();
  for (const f of contrast) {
    const signature = `${f.fg} on ${f.bg}`;
    const existing = contrastGroups.get(signature);
    if (existing) {
      existing.count++;
      existing.worst = Math.min(existing.worst, f.ratio);
    } else {
      contrastGroups.set(signature, {
        signature,
        count: 1,
        worst: f.ratio,
        required: f.required,
        fontPx: f.fontPx,
        bold: f.bold,
        sampleText: f.text,
      });
    }
  }

  const targetGroups = new Map<string, TargetGroup>();
  for (const f of targets) {
    const smallest = Math.min(f.width, f.height);
    const signature = `${f.role}, ${smallest}px shortest side, ${
      f.under24 ? 'under 24px (WCAG 2.5.8 AA)' : 'under 44px'
    }`;
    const existing = targetGroups.get(signature);
    if (existing) {
      existing.count++;
      if (existing.labels.length < 8 && !existing.labels.includes(f.label)) {
        existing.labels.push(f.label);
      }
    } else {
      targetGroups.set(signature, {
        signature,
        count: 1,
        smallest,
        under24: f.under24,
        labels: [f.label],
      });
    }
  }

  contrast.sort((a, b) => a.ratio - b.ratio);
  targets.sort((a, b) => Number(b.under24) - Number(a.under24) || a.width * a.height - b.width * b.height);

  return {
    sanity,
    measured,
    unmeasurable,
    interactive,
    totals,
    contrastGroups: [...contrastGroups.values()],
    targetGroups: [...targetGroups.values()],
    contrast: contrast.slice(0, limit),
    targets: targets.slice(0, limit),
    names: names.slice(0, limit),
    overflowPx,
    overflowSources,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    bodyBackground: bodyBg,
    bodyLuma: round((bodyOpaque[0] + bodyOpaque[1] + bodyOpaque[2]) / 3),
  };
}
