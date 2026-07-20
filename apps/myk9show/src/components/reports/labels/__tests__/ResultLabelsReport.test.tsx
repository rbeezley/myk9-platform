import { render, screen } from '@testing-library/react';
import { ResultLabelsReport } from '../ResultLabelsReport';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import { fromAny } from '@total-typescript/shoehorn';

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
  it('renders the inline config panel', () => {
    render(<ResultLabelsReport {...baseProps} />);
    expect(screen.getByText(/Label Size/i)).toBeInTheDocument();
  });

  it('uses shadcn primitives, not raw native radio/range inputs', () => {
    render(<ResultLabelsReport {...baseProps} />);
    // Base UI's Radio renders an accessible non-input element (its form
    // <input> is hidden from the a11y tree); a raw native radio would expose
    // an <input> in the a11y tree instead.
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) {
      expect(radio.tagName).not.toBe('INPUT');
    }
    // The Slider primitive renders <input type="range"> (role slider) with an
    // accessible name.
    expect(screen.getByRole('slider', { name: /vertical pitch adjustment/i })).toBeInTheDocument();
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
});
