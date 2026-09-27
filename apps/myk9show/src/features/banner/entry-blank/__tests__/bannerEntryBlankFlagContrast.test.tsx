/**
 * MYK9-786: what the Banner entry-blank PDF actually RENDERS for a light club
 * flag. MYK9-765 made the landing page and email paint `flagText`; the PDF
 * still painted the raw flag as text on paper (yellow #f5c211 is 1.59:1).
 *
 * `@react-pdf/renderer` is replaced by DOM stand-ins that carry each
 * element's style object, so the test reads the style props the real
 * renderer would receive. For every text node it resolves the colour and the
 * surface beneath it (nearest ancestor `backgroundColor`, compositing any
 * opacity) and measures with the repo's independent WCAG helper.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { buildEntryBlankProps } from '@/features/heritage/entry-blank/buildEntryBlankProps';
import {
  composite,
  contrastRatio,
  parseHex,
  type RgbColor,
} from '@/styles/__tests__/contrast-test-utils';
import {
  BANNER_PAPER,
  BANNER_PAPER_WARM,
} from '../../../../../../../supabase/functions/_shared/bannerBrandColors.ts';
import { deriveBannerBrandColors } from '../../hooks/useBannerBrandColor';
import { BannerEntryBlankDocument } from '../BannerEntryBlankDocument';
import { HAIR, INK, MUTE, PAPER, PAPER_WARM } from '../sections/pdfPrimitives';

type PdfStyle = Record<string, string | number | undefined>;

vi.mock('@react-pdf/renderer', () => {
  const el =
    (kind: string) =>
    ({ children, style }: { children?: ReactNode; style?: PdfStyle }) => (
      <div data-pdf={kind} data-style={JSON.stringify(style ?? {})}>
        {children}
      </div>
    );
  return {
    Document: el('document'),
    Page: el('page'),
    View: el('view'),
    Text: el('text'),
    Image: () => null,
    StyleSheet: { create: (s: unknown) => s },
    Font: { register: vi.fn(), registerHyphenationCallback: vi.fn() },
  };
});

const AA = 4.5;
/** The same spread as bannerFlagContrast.test.ts (issue flags + edges). */
const FLAGS = [
  '#0d4d4f',
  '#1a5fb4',
  '#e01b24',
  '#ff7800',
  '#33d17a',
  '#f5c211',
  '#ffffff',
  '#fafaf8',
  '#dcdcdc',
  '#c8c8c8',
  '#000000',
  '#00ffff',
] as const;

/** Every pre-filled branch on: checked trials and levels, a total, a method. */
function filledProps(brandColor: string) {
  const base = buildEntryBlankProps({
    show: {
      name: 'Spring Scent Work Trial',
      start_date: '2026-06-12',
      end_date: '2026-06-14',
      entry_close_date: '2026-06-03',
      pre_entry_fee: 25,
      organization: 'AKC',
    },
    trials: [
      {
        id: 'trial-1',
        date: '2026-06-12',
        trial_number: 'I',
        display_order: 1,
        timezone: 'America/Chicago',
      },
    ],
    classes: [
      { id: 'c-1', trial_id: 'trial-1', element: 'Containers', level: 'Novice', name: 'C' },
    ],
    judges: [{ trial_id: 'trial-1', judgeName: 'C. Beagles' }],
    club: { name: 'Bexar County Kennel Club' },
    secretary: {
      name: 'James Nakamura',
      poBox: 'PO Box 4421',
      cityStateZip: 'San Antonio, TX 78212',
      email: 'secretary@bckc.org',
    },
  });
  return {
    ...base,
    brandColor,
    trials: base.trials.map(t => ({ ...t, checked: true })),
    levelCells: base.levelCells.map(c => ({ ...c, checked: true })),
    fees: { ...base.fees, totalAmount: '$47.00', paymentMethod: 'check' as const },
  };
}

function styleOf(node: Element): PdfStyle {
  return JSON.parse(node.getAttribute('data-style') ?? '{}') as PdfStyle;
}

/** Nearest ancestor-or-self value of a style property. */
function inherited(node: Element, prop: string): string | undefined {
  for (let n: Element | null = node; n; n = n.parentElement) {
    const v = n.hasAttribute('data-style') ? styleOf(n)[prop] : undefined;
    if (typeof v === 'string') return v;
  }
  return undefined;
}

function opacityOf(node: Element): number {
  let alpha = 1;
  for (let n: Element | null = node; n; n = n.parentElement) {
    const v = n.hasAttribute('data-style') ? styleOf(n).opacity : undefined;
    if (typeof v === 'number') alpha *= v;
  }
  return alpha;
}

interface PaintedText {
  text: string;
  color: string;
  surface: string;
  ratio: number;
}

/** Every text node painted on a paper surface, with its measured contrast. */
function textsOnPaper(container: HTMLElement): PaintedText[] {
  const papers = new Set([PAPER, PAPER_WARM]);
  return [...container.querySelectorAll('[data-pdf="text"]')].flatMap(node => {
    const color = inherited(node, 'color');
    const surface = inherited(node, 'backgroundColor');
    if (!color || !surface || !papers.has(surface)) return [];
    const bg: RgbColor = parseHex(surface);
    const fg = composite(parseHex(color), opacityOf(node), bg);
    return [{ text: node.textContent ?? '', color, surface, ratio: contrastRatio(fg, bg) }];
  });
}

const BORDER_PROPS = ['borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor'];

function borderColors(container: HTMLElement): Set<string> {
  const found = new Set<string>();
  for (const node of container.querySelectorAll('[data-pdf]')) {
    const style = styleOf(node);
    for (const prop of BORDER_PROPS) {
      const v = style[prop];
      if (typeof v === 'string') found.add(v);
    }
  }
  return found;
}

describe('harness known answers', () => {
  it('measures the issue ratio and the entry blank paints on the shared paper surfaces', () => {
    expect(contrastRatio(parseHex('#f5c211'), parseHex(PAPER))).toBeCloseTo(1.59, 2);
    expect(PAPER).toBe(BANNER_PAPER);
    expect(PAPER_WARM).toBe(BANNER_PAPER_WARM);
  });

  it('finds flag-hued text on paper, including the warm agreement box surface', () => {
    const { container } = render(<BannerEntryBlankDocument {...filledProps('#f5c211')} />);
    const painted = textsOnPaper(container);
    const flagHued = painted.filter(p => p.color !== INK && p.color !== MUTE);
    // Every flag-text site the issue names: section headers, trial numeral,
    // level labels, checkbox marks, the fees total and the mail-to headings.
    expect(flagHued.map(p => p.text)).toEqual(
      expect.arrayContaining([
        '01 / THE DOG',
        '05 / AGREEMENT & SIGNATURE',
        'I',
        'NOVICE',
        '✕',
        '$47.00',
        'RETURN THIS BLANK, WITH PAYMENT, TO:',
        'OR SCAN AND EMAIL TO:',
      ])
    );
    expect(painted.some(p => p.surface === PAPER_WARM)).toBe(true);
  });
});

describe.each(FLAGS)('Banner entry blank with flag %s', flag => {
  const colors = deriveBannerBrandColors(flag);

  it('paints every text on paper at 4.5:1 or better', () => {
    const { container } = render(<BannerEntryBlankDocument {...filledProps(flag)} />);
    const failing = textsOnPaper(container)
      .filter(p => p.ratio < AA)
      .map(p => `${p.text} ${p.color} on ${p.surface}: ${p.ratio.toFixed(2)}`);
    expect(failing).toEqual([]);
  });

  it('paints flag-hued text in flagText, never the raw flag when it is too light', () => {
    const { container } = render(<BannerEntryBlankDocument {...filledProps(flag)} />);
    const flagHued = textsOnPaper(container).filter(p => p.color !== INK && p.color !== MUTE);
    expect(new Set(flagHued.map(p => p.color))).toEqual(new Set([colors.flagText]));
  });

  it('keeps the club flag on borders and rules', () => {
    const { container } = render(<BannerEntryBlankDocument {...filledProps(flag)} />);
    const borders = borderColors(container);
    expect(borders.has(colors.flag)).toBe(true);
    for (const c of borders) expect([colors.flag, INK, HAIR]).toContain(c);
  });
});
