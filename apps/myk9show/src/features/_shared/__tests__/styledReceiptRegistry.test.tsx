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

const DOG = {
  id: 'dog-1',
  registeredName: "GCh. Ridgeway's Wandering Cooper, CGC",
  callName: 'Cooper',
  classSummary: '3 runs · Excellent Containers · Judge C. Beagles',
};

const BASE_PROPS: HeritageEntryReceivedProps = {
  showName: 'Spring Scent Work Trial',
  clubName: 'Bexar County Kennel Club',
  dateRange: '12–14 June 2026',
  dogs: [DOG],
  totalFeesFormatted: '$69.00',
  totalLabel: 'Total · Paid by check',
  registrationNumber: 'MK9-000137',
  fullConfirmationNote:
    'Once the show secretary accepts your entry, we will email you a full confirmation with your armband number, judge and directions.',
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
    expect(container.textContent).toContain('SUBMITTED');
  });

  it('does not overclaim confirmation/payment across styled receipts', () => {
    // These receipts render after submit but before the draw — a formal
    // confirmation is emailed later. They must say "submitted", never claim the
    // entry is "confirmed" or that fees were "received".
    for (const style of ALL_STYLES) {
      const element = STYLED_RECEIPT_BY_STYLE[style](BASE_PROPS, { brandColor: '#7a1f1f' });
      const { container } = render(element);
      const text = container.textContent?.toLowerCase() ?? '';

      expect(text).toContain('submitted');
      expect(text).not.toContain('confirmed');
      expect(text).not.toContain('fees received');
    }
  });

  // MYK9-2235: every style says whether the total is paid or due, including the styles that
  // show the confirmation number in the same spot (a submitted receipt always has one).
  it('shows the paid or due label beside the total in every style', () => {
    for (const style of ALL_STYLES) {
      const element = STYLED_RECEIPT_BY_STYLE[style](BASE_PROPS, { brandColor: '#7a1f1f' });
      const { container, unmount } = render(element);
      const text = container.textContent?.toLowerCase() ?? '';

      expect(text, style).toContain('total · paid by check');
      expect(text, style).toContain('mk9-000137');
      expect(text, style).not.toContain('fees due');
      unmount();
    }
  });

  it('labels the enrollment confirmation number consistently across styled receipts', () => {
    for (const style of ALL_STYLES) {
      const element = STYLED_RECEIPT_BY_STYLE[style](BASE_PROPS, { brandColor: '#7a1f1f' });
      const { container } = render(element);
      const text = container.textContent ?? '';

      expect(text).toContain('Confirmation number');
      expect(text).toContain('MK9-000137');
      expect(text).not.toContain('Entry #');
      expect(text).not.toContain('Entry №');
      expect(text).not.toContain('Registration #');
    }
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

  // MYK9-2474: a two-dog entry named only the first dog while its total covered both.
  it('lists every dog in the entry with its classes in every style', () => {
    const twoDogs: HeritageEntryReceivedProps = {
      ...BASE_PROPS,
      dogs: [
        {
          id: 'dog-lucy',
          registeredName: 'Lucy of Hollow Creek',
          callName: 'Lucy',
          classSummary: 'Container Novice A, Interior Novice A',
        },
        {
          id: 'dog-coco',
          registeredName: 'Coco Bean Dream',
          callName: 'Coco',
          classSummary: 'Exterior Advanced, Buried Advanced',
        },
      ],
    };
    for (const style of ALL_STYLES) {
      const { container, unmount } = render(
        STYLED_RECEIPT_BY_STYLE[style](twoDogs, { brandColor: '#7a1f1f' })
      );
      const text = container.textContent?.toLowerCase() ?? '';
      for (const expected of [
        'lucy of hollow creek',
        'coco bean dream',
        'container novice a, interior novice a',
        'exterior advanced, buried advanced',
      ]) {
        expect(text, `${style}: ${expected}`).toContain(expected);
      }
      unmount();
    }
  });

  it('hides the card’s own Return to dashboard exit only when asked (staff flows)', () => {
    for (const style of ALL_STYLES) {
      const shown = render(STYLED_RECEIPT_BY_STYLE[style](BASE_PROPS, { brandColor: null }));
      expect(shown.queryByRole('button', { name: 'Return to dashboard' }), style).not.toBeNull();
      shown.unmount();

      const hidden = render(
        STYLED_RECEIPT_BY_STYLE[style](
          { ...BASE_PROPS, hideReturnToDashboard: true },
          { brandColor: null }
        )
      );
      expect(hidden.queryByRole('button', { name: 'Return to dashboard' }), style).toBeNull();
      hidden.unmount();
    }
  });

  it('derives monogramLetters from clubName for the monogram receipt', () => {
    const element = STYLED_RECEIPT_BY_STYLE.monogram(BASE_PROPS, { brandColor: null });
    const { container } = render(element);
    // Monogram extracts initials from the club name ("Bexar County Kennel Club" → BCK).
    expect(container.textContent).toContain('BCK');
  });
});
