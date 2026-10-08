import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { ListAppliedFilters } from '../ListAppliedFilters';
import type { ListMenuFilterField } from '../types';

function fields(over: {
  classes?: string[];
  trial?: string | null;
  created?: { start: Date | null; end: Date | null };
  onClass?: (v: string[]) => void;
  onTrial?: (v: string | null) => void;
  onCreated?: (v: { start: Date | null; end: Date | null }) => void;
  loading?: boolean;
}): ListMenuFilterField[] {
  return [
    {
      kind: 'options',
      key: 'trial',
      label: 'Trial',
      value: over.trial ?? null,
      onChange: over.onTrial ?? vi.fn(),
      options: [{ value: 't2', label: 'Trial 2 · Nov 10' }],
    },
    {
      kind: 'multiOptions',
      key: 'class',
      label: 'Class',
      values: over.classes ?? [],
      loading: over.loading,
      onChange: over.onClass ?? vi.fn(),
      options: [
        { value: 'c1', label: 'Interior Novice B' },
        { value: 'c2', label: 'Exterior Excellent' },
      ],
    },
    {
      kind: 'dateRange',
      key: 'created',
      label: 'Created',
      value: over.created ?? { start: null, end: null },
      onChange: over.onCreated ?? vi.fn(),
    },
  ];
}

describe('ListAppliedFilters', () => {
  it('renders nothing when nothing is applied', () => {
    const { container } = render(<ListAppliedFilters fields={fields({})} onClearAll={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('writes each applied field as a plain sentence', () => {
    render(<ListAppliedFilters fields={fields({ trial: 't2', classes: ['c2', 'c1'] })} />);

    expect(screen.getByText('Trial: Trial 2 · Nov 10')).toBeInTheDocument();
    expect(screen.getByText('Class: Interior Novice B, Exterior Excellent')).toBeInTheDocument();
  });

  it('clears only the field whose × is pressed, each kind its own way', async () => {
    const onClass = vi.fn();
    const onTrial = vi.fn();
    const onCreated = vi.fn();
    render(
      <ListAppliedFilters
        fields={fields({
          trial: 't2',
          classes: ['c1'],
          created: { start: new Date(2026, 10, 9), end: null },
          onClass,
          onTrial,
          onCreated,
        })}
      />
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: /Remove filter Class: Interior Novice B/ })
    );
    expect(onClass).toHaveBeenCalledWith([]);
    expect(onTrial).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Remove filter Trial/ }));
    expect(onTrial).toHaveBeenCalledWith(null);

    await user.click(screen.getByRole('button', { name: /Remove filter Created/ }));
    expect(onCreated).toHaveBeenCalledWith({ start: null, end: null });
  });

  it('shows Clear all only with something applied, and calls the page’s own reset', async () => {
    const onClearAll = vi.fn();
    render(<ListAppliedFilters fields={fields({ classes: ['c1'] })} onClearAll={onClearAll} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('has no Clear all without a reset to call', () => {
    render(<ListAppliedFilters fields={fields({ classes: ['c1'] })} />);
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
  });

  it('keeps Clear all when only something outside the fields narrows the list', () => {
    render(<ListAppliedFilters fields={fields({})} onClearAll={vi.fn()} alsoNarrowed />);

    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove filter/ })).not.toBeInTheDocument();
  });

  it('hides a field’s sentence while its options are loading, so no raw id shows', () => {
    const { container } = render(
      <ListAppliedFilters fields={fields({ classes: ['c1'], loading: true })} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
