import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ResultLabelsReport } from '../ResultLabelsReport';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import { fromAny } from '@total-typescript/shoehorn';

const STORAGE_KEY = 'myk9show-label-prefs';

const buildLabelStylesheetMock = vi.fn(
  (
    _template: unknown,
    pitchAdjustment: number | undefined,
    offsetTop: number | undefined,
    offsetLeft: number | undefined
  ) => 'css'
);
vi.mock('@/lib/labels/labelStyles', () => ({
  buildLabelStylesheet: (
    template: unknown,
    pitchAdjustment: number | undefined,
    offsetTop: number | undefined,
    offsetLeft: number | undefined
  ) => buildLabelStylesheetMock(template, pitchAdjustment, offsetTop, offsetLeft),
}));

// Force a non-empty page so the iframe-write effect takes the "render a
// sheet" branch (rather than the early "clear the iframe" branch), without
// needing full result-entry fixtures.
vi.mock('../ResultLabelCell', () => ({
  ResultLabelCell: () => null,
}));

vi.mock('@/lib/labels/labelLayout', () => ({
  buildLabelPages: () => [
    {
      pageNumber: 1,
      cells: [{ type: 'item', item: { id: 'item-1' } }],
    },
  ],
}));

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Calm Canine Club',
} as Show;

const trials = fromAny<DbTrial[], unknown>([
  { id: 'trial-1', trial_number: 1, date: '2026-05-11' },
]);
const classes = [
  {
    id: 'class-1',
    trial_id: 'trial-1',
    element: 'Buried',
    level: 'Novice',
    section: '',
  },
] as DbClass[];

// The config panel (label-size radios, skip field, pitch slider) renders off
// the static template list, so it appears even with no entries to print. That
// lets these tests focus on the control migration without constructing full
// result fixtures.
const baseProps = {
  show,
  trials,
  classes,
  entries: [] as DbEntry[],
  scope: { kind: 'show', showId: 'show-1' } as const,
  sortOrder: 'armband',
} as const;

describe('ResultLabelsReport', () => {
  beforeEach(() => {
    localStorage.clear();
    buildLabelStylesheetMock.mockClear();
  });

  it('renders the inline config panel', () => {
    render(<ResultLabelsReport {...baseProps} />);
    expect(screen.getByText(/Label Size/i)).toBeInTheDocument();
  });

  it('uses shadcn primitives, not raw native radio inputs', () => {
    render(<ResultLabelsReport {...baseProps} />);
    // Base UI's Radio renders an accessible non-input element (its form
    // <input> is hidden from the a11y tree); a raw native radio would expose
    // an <input> in the a11y tree instead.
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) {
      expect(radio.tagName).not.toBe('INPUT');
    }
  });

  it('renders the shared calibration panel collapsed by default', () => {
    render(<ResultLabelsReport {...baseProps} />);
    expect(screen.getByText(/show advanced/i)).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: /row pitch/i })).not.toBeInTheDocument();
  });

  it('gives every label-size radio row a 44px-tall hit area', () => {
    render(<ResultLabelsReport {...baseProps} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) {
      const row = radio.closest('label');
      expect(row).not.toBeNull();
      expect(row?.className).toContain('min-h-[44px]');
    }
  });

  it('gives the skip-count field a 44px-tall hit area', () => {
    render(<ResultLabelsReport {...baseProps} />);
    const skip = screen.getByLabelText('Labels to skip on first page');
    expect(skip).toHaveClass('h-11');
    expect(skip.closest('label')?.className).toContain('min-h-[44px]');
  });

  it('shows the loading state and suppresses the empty state while data resolves', () => {
    // entries undefined + isLoading: the empty "No entries" copy must NOT flash.
    render(<ResultLabelsReport {...baseProps} entries={undefined} isLoading={true} />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading entry data');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByText(/No entries to print labels/i)).not.toBeInTheDocument();
  });

  it('shows the empty state once loading completes with no entries', () => {
    render(<ResultLabelsReport {...baseProps} isLoading={false} />);

    expect(screen.getByText(/No entries to print labels/i)).toBeInTheDocument();
    expect(screen.queryByText(/Loading entry data/i)).not.toBeInTheDocument();
  });

  it('builds the iframe stylesheet from stored calibration prefs', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        templateId: '18262',
        contentConfig: {},
        skip: 0,
        pitchAdjustment: 7,
        offsetTop: 12,
        offsetLeft: -5,
      })
    );

    const iframeRef = createRef<HTMLIFrameElement>();
    render(<iframe ref={iframeRef} />);
    render(<ResultLabelsReport {...baseProps} iframeRef={iframeRef} />);

    await waitFor(() => {
      expect(buildLabelStylesheetMock).toHaveBeenCalled();
    });
    const [, pitchAdjustment, offsetTop, offsetLeft] = buildLabelStylesheetMock.mock.calls[0]!;
    expect(pitchAdjustment).toBe(7);
    expect(offsetTop).toBe(12);
    expect(offsetLeft).toBe(-5);
  });
});
