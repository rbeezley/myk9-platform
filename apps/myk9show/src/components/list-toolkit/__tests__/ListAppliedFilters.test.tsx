import { createRef } from 'react';
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
  classLoading?: boolean;
  trialLoading?: boolean;
}): ListMenuFilterField[] {
  return [
    {
      kind: 'options',
      key: 'trial',
      label: 'Trial',
      value: over.trial ?? null,
      loading: over.trialLoading,
      onChange: over.onTrial ?? vi.fn(),
      options: [{ value: 't2', label: 'Trial 2 · Nov 10' }],
    },
    {
      kind: 'multiOptions',
      key: 'class',
      label: 'Class',
      values: over.classes ?? [],
      loading: over.classLoading,
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
  it('draws nothing when nothing is applied, and tells a screen reader so', () => {
    render(<ListAppliedFilters fields={fields({})} onClearAll={vi.fn()} />);

    expect(screen.queryByRole('group', { name: 'Applied filters' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No filters applied');
  });

  it('writes each applied field as a plain sentence', () => {
    render(<ListAppliedFilters fields={fields({ trial: 't2', classes: ['c2', 'c1'] })} />);

    expect(screen.getByText('Trial: Trial 2 · Nov 10')).toBeInTheDocument();
    expect(screen.getByText('Class: Interior Novice B, Exterior Excellent')).toBeInTheDocument();
  });

  it('keeps the full sentence available as a tooltip when the chip is long', () => {
    render(<ListAppliedFilters fields={fields({ classes: ['c1', 'c2'] })} />);

    expect(
      screen.getByText('Class: Interior Novice B, Exterior Excellent').closest('[title]')
    ).toHaveAttribute('title', 'Class: Interior Novice B, Exterior Excellent');
  });

  it('announces how many filters are applied, from one status line that stays mounted', () => {
    const { rerender } = render(<ListAppliedFilters fields={fields({ classes: ['c1'] })} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('1 filter applied');

    rerender(<ListAppliedFilters fields={fields({ trial: 't2', classes: ['c1'] })} />);
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('2 filters applied');

    rerender(<ListAppliedFilters fields={fields({})} />);
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('No filters applied');
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

    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(onClearAll).toHaveBeenCalledWith();
  });

  it('has no Clear all without a reset to call', () => {
    render(<ListAppliedFilters fields={fields({ classes: ['c1'] })} />);
    expect(screen.queryByRole('button', { name: /Clear all/ })).not.toBeInTheDocument();
  });

  it('keeps Clear all when only something outside the fields narrows the list', () => {
    render(<ListAppliedFilters fields={fields({})} onClearAll={vi.fn()} alsoNarrowed />);

    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove filter/ })).not.toBeInTheDocument();
  });

  describe('a field that narrows the list but cannot be named yet', () => {
    it('shows "loading…" and keeps Clear all, for a multi-select field', async () => {
      const onClass = vi.fn();
      render(
        <ListAppliedFilters
          fields={fields({ classes: ['c1'], classLoading: true, onClass })}
          onClearAll={vi.fn()}
        />
      );

      expect(screen.getByText('Class: loading…')).toBeInTheDocument();
      expect(screen.queryByText(/c1/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeInTheDocument();

      await userEvent.setup().click(screen.getByRole('button', { name: /Remove filter Class/ }));
      expect(onClass).toHaveBeenCalledWith([]);
    });

    it('does the same for a single-select field, so a restored id never shows raw', () => {
      render(<ListAppliedFilters fields={fields({ trial: 'bd5f-uuid', trialLoading: true })} />);

      expect(screen.getByText('Trial: loading…')).toBeInTheDocument();
      expect(screen.queryByText(/bd5f-uuid/)).not.toBeInTheDocument();
    });

    it('says "applied" when the picked values have no name to show', () => {
      render(<ListAppliedFilters fields={fields({ classes: ['  '] })} onClearAll={vi.fn()} />);

      expect(screen.getByText('Class: applied')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeInTheDocument();
    });
  });

  describe('focus after a removal', () => {
    it('moves to the next chip’s × when there is one', async () => {
      render(<ListAppliedFilters fields={fields({ trial: 't2', classes: ['c1'] })} />);

      await userEvent.setup().click(screen.getByRole('button', { name: /Remove filter Trial/ }));

      expect(screen.getByRole('button', { name: /Remove filter Class/ })).toHaveFocus();
    });

    it('moves to the target (the Filter button) when the last chip goes', async () => {
      const target = createRef<HTMLButtonElement>();
      render(
        <>
          <button ref={target} type="button">
            Filter
          </button>
          <ListAppliedFilters fields={fields({ classes: ['c1'] })} focusTargetRef={target} />
        </>
      );

      await userEvent.setup().click(screen.getByRole('button', { name: /Remove filter Class/ }));

      expect(target.current).toHaveFocus();
    });

    it('moves to the target on Clear all', async () => {
      const target = createRef<HTMLButtonElement>();
      render(
        <>
          <button ref={target} type="button">
            Filter
          </button>
          <ListAppliedFilters
            fields={fields({ classes: ['c1'] })}
            focusTargetRef={target}
            onClearAll={vi.fn()}
          />
        </>
      );

      await userEvent.setup().click(screen.getByRole('button', { name: 'Clear all filters' }));

      expect(target.current).toHaveFocus();
    });
  });
});
