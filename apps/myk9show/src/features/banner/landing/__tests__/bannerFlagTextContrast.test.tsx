/**
 * MYK9-765: what the Banner page actually RENDERS for a light club flag.
 *
 * The derivation test proves the colours exist; this proves the components
 * use them. For every visible text node it resolves the colour and surface
 * the browser would paint from the inline styles (walking to the nearest
 * ancestor that sets each, resolving `var(--…)` against the page scope and
 * compositing any opacity), then measures with the repo's WCAG helper.
 *
 * - On the paper surfaces, every flag-hued text node must reach 4.5:1.
 * - Inside the final flag band, EVERY text node must reach 4.5:1.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { BannerLandingPage } from '../BannerLandingPage';
import { FinalFlagBand } from '../sections/FinalFlagBand';
import { deriveBannerBrandColors, type BannerBrandColors } from '../../hooks/useBannerBrandColor';
import { bannerColors } from '../../tokens';
import type { BannerLandingData } from '../types';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import {
  composite,
  contrastRatio,
  parseHex,
  type RgbColor,
} from '@/styles/__tests__/contrast-test-utils';

vi.mock('../../fonts', () => ({
  ensureBannerFontsLoaded: vi.fn(),
  BANNER_DISPLAY_FAMILY: "'Inter Tight', system-ui, sans-serif",
  BANNER_BODY_FAMILY: "'Inter', system-ui, sans-serif",
}));

const AA = 4.5;
const FLAGS = ['#0d4d4f', '#1a5fb4', '#e01b24', '#ff7800', '#33d17a', '#f5c211'] as const;

let currentData: BannerLandingData;

vi.mock('../useBannerLandingData', () => ({
  useBannerLandingData: () => currentData,
}));

function landingData(brandColors: BannerBrandColors): BannerLandingData {
  return {
    clubName: 'Banner Kennel Club',
    showName: 'Heartland Scent Work Classic',
    showSubtitle: 'AKC Licensed Trial',
    welcomeText: 'Welcome to the trial.',
    trialChairName: 'Pat Chair',
    entryOpenDate: '2026-04-01',
    entryCloseDate: '2099-01-01',
    confirmationDate: null,
    trialStartDate: '2099-08-01',
    trialEndDate: '2099-08-03',
    timezone: 'America/Chicago',
    venueName: 'Expo Hall',
    venueAddress: '100 Dog Show Lane',
    venueCity: 'Tulsa, OK',
    trials: [],
    judges: [
      {
        id: 'j1',
        name: 'Casey Judge',
        city: 'Austin, TX',
        trials: ['1'],
        elements: ['Containers'],
        trialsLabel: 'TRIALS 01 · 02',
        elementPanel: 'Containers · Interiors',
        bio: null,
      },
    ],
    entryCount: 12,
    entryLimit: 40,
    fees: [],
    accommodations: [{ name: 'Dog Friendly Inn', address: '1 Main St' }],
    vetClinic: null,
    coverImageUrl: null,
    pullQuote: null,
    pullQuoteAttribution: null,
    hospitalityNotes: 'Coffee at the door.',
    awardsDescription: null,
    houseRulesNotes: null,
    secretaryName: 'Sam Secretary',
    secretaryEmail: 'sam@example.com',
    licenseLanguage: 'AKC Licensed Trial',
    memberClubLanguage: 'A member club of the American Kennel Club.',
    journeySteps: [],
    entryWizardUrl: '/shows/show-1/register',
    brandColors,
    officers: [{ title: 'Trial Chair', name: 'Pat Chair' }],
    onTheDay: [],
  };
}

// ─── Measurement harness ────────────────────────────────────────────────────

/** Resolve `var(--x[, fallback])` against the element's inline-style scope. */
function resolveVars(value: string, from: HTMLElement): string {
  const match = /^var\((--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(value.trim());
  if (!match) return value;
  for (let el: HTMLElement | null = from; el; el = el.parentElement) {
    const v = el.style.getPropertyValue(match[1]);
    if (v) return resolveVars(v, el);
  }
  if (match[2]) return resolveVars(match[2], from);
  throw new Error(`Unresolved ${match[1]}`);
}

function toRgb(value: string): RgbColor | null {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return parseHex(v);
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

interface Painted {
  text: string;
  fg: RgbColor;
  bg: RgbColor;
  /** The element that set the text colour. */
  colorEl: HTMLElement;
}

/** Every non-empty text node under `root`, with the colours it paints in. */
function paintedText(root: HTMLElement): Painted[] {
  const out: Painted[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    const parent = node.parentElement;
    if (!text || !parent || parent.closest('title,meta,script,style')) continue;

    let colorEl: HTMLElement | null = null;
    for (let el: HTMLElement | null = parent; el; el = el.parentElement) {
      if (el.style.color) {
        colorEl = el;
        break;
      }
    }
    if (!colorEl) continue;

    let bgEl: HTMLElement | null = null;
    let bg: RgbColor | null = null;
    let alpha = 1;
    for (let el: HTMLElement | null = parent; el; el = el.parentElement) {
      if (el.style.opacity) alpha *= Number(el.style.opacity);
      const raw = el.style.backgroundColor || el.style.background;
      if (raw) {
        const resolved = resolveVars(raw, el);
        bg = toRgb(resolved);
        if (!bg) throw new Error(`Text "${text}" sits on an unmeasurable surface: ${resolved}`);
        bgEl = el;
        break;
      }
    }
    if (!bgEl || !bg) throw new Error(`Text "${text}" has no painted surface`);

    const fgRaw = toRgb(resolveVars(colorEl.style.color, colorEl));
    if (!fgRaw) continue; // rgba() footer tints — not flag-derived
    out.push({ text, fg: composite(fgRaw, alpha, bg), bg, colorEl });
  }
  return out;
}

function sameRgb(a: RgbColor, b: RgbColor): boolean {
  return a.every((c, i) => c === b[i]);
}

function flagHues(colors: BannerBrandColors): RgbColor[] {
  return [colors.flag, colors.flagText, colors.flagDeep, colors.flagBright]
    .filter(Boolean)
    .map(parseHex);
}

function failures(painted: Painted[]): string[] {
  return painted
    .map(p => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }))
    .filter(p => p.ratio < AA)
    .map(p => `"${p.text}" ${p.ratio.toFixed(2)}:1 (fg ${p.fg.join(',')} on ${p.bg.join(',')})`);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('harness known answers', () => {
  it('measures a known pair, resolves a var chain and composites opacity', () => {
    const scope = document.createElement('div');
    scope.style.setProperty('--x', '#000000');
    scope.style.background = '#ffffff';
    const p = document.createElement('p');
    p.style.color = 'var(--x)';
    p.style.opacity = '0.5';
    p.textContent = 'probe';
    scope.appendChild(p);
    document.body.appendChild(scope);
    const [probe] = paintedText(scope);
    scope.remove();
    expect(probe.bg).toEqual([255, 255, 255]);
    expect(probe.fg).toEqual([128, 128, 128]);
    expect(contrastRatio(parseHex('#000000'), parseHex('#ffffff'))).toBeCloseTo(21, 5);
  });
});

describe.each(FLAGS)('Banner landing page with flag %s (MYK9-765)', flag => {
  const brandColors = deriveBannerBrandColors(flag);

  function renderPage() {
    currentData = landingData(brandColors);
    mockViewportWidth(1280);
    return render(
      <BannerLandingPage
        show={{ id: 'show-1', name: currentData.showName } as never}
        trial={null}
        allTrials={[]}
        hasEntryClassInventory
        entryWindowNotOpen={false}
      />
    );
  }

  it('every flag-coloured text on the paper surfaces reaches 4.5:1', () => {
    const { container } = renderPage();
    const hues = flagHues(brandColors);
    const onPaper = paintedText(container).filter(
      p => !p.colorEl.closest('.bn-flag') && hues.some(h => sameRgb(h, p.fg))
    );
    // Positive control: the sticky-nav status, seven section folios, their
    // accent fragments, the judge panel label and the officer title.
    expect(onPaper.length).toBeGreaterThanOrEqual(12);
    expect(onPaper.some(p => p.colorEl.classList.contains('bn-subbar-status'))).toBe(true);
    expect(failures(onPaper)).toEqual([]);
  });

  it('every text in the final flag band reaches 4.5:1 on the band', () => {
    const { container } = renderPage();
    const band = container.querySelector<HTMLElement>('.bn-flag--final');
    expect(band).not.toBeNull();
    const painted = paintedText(band!);
    // "Closes …", the headline lead and its accent fragment.
    expect(painted.length).toBeGreaterThanOrEqual(3);
    expect(failures(painted)).toEqual([]);
  });

  it.each([
    { canEnterOnline: false, entryClosed: true },
    { canEnterOnline: false, entryClosed: false },
  ])('the final band reads in its closed / not-open states %o', state => {
    const { container } = render(
      <FinalFlagBand
        brandColors={brandColors}
        entryCloseDate="2099-01-01"
        timezone="America/Chicago"
        {...state}
      />
    );
    const band = container.querySelector<HTMLElement>('.bn-flag--final');
    const painted = paintedText(band!);
    expect(painted.length).toBeGreaterThanOrEqual(4);
    expect(failures(painted)).toEqual([]);
  });
});

describe('fixture sanity', () => {
  it('spans flags that fail and pass on paper as-is', () => {
    const paper = parseHex(bannerColors.paper);
    const raw = FLAGS.map(f => contrastRatio(parseHex(f), paper));
    expect(raw.some(r => r < AA)).toBe(true);
    expect(raw.some(r => r >= AA)).toBe(true);
  });
});
