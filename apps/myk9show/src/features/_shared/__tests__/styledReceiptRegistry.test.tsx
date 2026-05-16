import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { STYLED_RECEIPT_BY_STYLE } from '../styledReceiptRegistry';
import type { HeritageEntryReceivedProps } from '@/features/heritage/wizard/HeritageEntryReceived';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const ALL_STYLES = [
  'heritage',
  'headline',
  'monogram',
  'banner',
  'fieldGuide',
  'gazette',
  'magazine',
  'poster',
] as const;

const BASE_PROPS: HeritageEntryReceivedProps = {
  showName: 'Spring Scent Work Trial',
  clubName: 'Bexar County Kennel Club',
  dateRange: '12–14 June 2026',
  dogRegisteredName: "GCh. Ridgeway's Wandering Cooper, CGC",
  dogCallName: 'Cooper',
  classSummary: '3 runs · Excellent Containers · Judge C. Beagles',
  totalFeesFormatted: '$69.00',
  registrationNumber: '2026-0137',
  confirmationDateLabel: 'Jun 6, 2026',
};

describe('STYLED_RECEIPT_BY_STYLE', () => {
  it('has a renderer for every ShowStyle value (exhaustive)', () => {
    for (const style of ALL_STYLES) {
      expect(STYLED_RECEIPT_BY_STYLE[style]).toBeDefined();
      expect(typeof STYLED_RECEIPT_BY_STYLE[style]).toBe('function');
    }
  });

  it('renders the heritage receipt for style=heritage', () => {
    const element = STYLED_RECEIPT_BY_STYLE.heritage(BASE_PROPS, { brandColor: null });
    const { container } = render(element);
    expect(container.textContent).toContain('Cooper');
    // Heritage uses Cormorant Garamond; foreign style families must not
    // leak in. Spot-check the marker family.
    expect(container.innerHTML).toContain('Cormorant');
  });

  it('renders the fieldGuide receipt for style=fieldGuide with the chip system', () => {
    const element = STYLED_RECEIPT_BY_STYLE.fieldGuide(BASE_PROPS, { brandColor: null });
    const { container } = render(element);
    expect(container.querySelector('[data-field-guide]')).not.toBeNull();
    // The "CONFIRMED" orange chip is the Field Guide signature element.
    expect(container.textContent).toContain('CONFIRMED');
  });

  it('renders the gazette receipt for style=gazette', () => {
    const element = STYLED_RECEIPT_BY_STYLE.gazette(BASE_PROPS, { brandColor: null });
    const { container } = render(element);
    expect(container.textContent).toContain('Cooper');
  });

  it('renders the magazine receipt for style=magazine', () => {
    const element = STYLED_RECEIPT_BY_STYLE.magazine(BASE_PROPS, { brandColor: null });
    const { container } = render(element);
    expect(container.textContent).toContain('Cooper');
  });

  it('renders the poster receipt for style=poster', () => {
    const element = STYLED_RECEIPT_BY_STYLE.poster(BASE_PROPS, { brandColor: null });
    const { container } = render(element);
    // Poster uppercases display copy; match case-insensitively.
    expect(container.textContent?.toLowerCase()).toContain('cooper');
  });

  it('threads brandColor through to the banner receipt', () => {
    const element = STYLED_RECEIPT_BY_STYLE.banner(BASE_PROPS, { brandColor: '#7a1f1f' });
    const { container } = render(element);
    const masthead = container.querySelector('header') as HTMLElement | null;
    expect(masthead?.style.background).toBe('rgb(122, 31, 31)');
  });

  it('derives monogramLetters from clubName for the monogram receipt', () => {
    const element = STYLED_RECEIPT_BY_STYLE.monogram(BASE_PROPS, { brandColor: null });
    const { container } = render(element);
    // Monogram extracts initials from the club name ("Bexar County Kennel Club" → BCK).
    expect(container.textContent).toContain('BCK');
  });
});
