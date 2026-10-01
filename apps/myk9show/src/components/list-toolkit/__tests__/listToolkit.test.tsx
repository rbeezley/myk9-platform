import { describe, it, expect, vi } from 'vitest';
import { createPortal } from 'react-dom';
import { render, screen, fireEvent, userEvent } from '@/test/utils/testUtils';
import { BulkBarButton, FloatingBulkBar } from '../FloatingBulkBar';
import {
  describeDateRange,
  fromDateInputValue,
  summarizeFilters,
  toDateInputValue,
} from '../filterFieldState';

const NOUN = ['user', 'users'] as const;

describe('FloatingBulkBar', () => {
  it('renders nothing with no selection', () => {
    render(
      <FloatingBulkBar count={0} noun={NOUN} onClear={vi.fn()}>
        <BulkBarButton onClick={vi.fn()} icon={null}>
          Export
        </BulkBarButton>
      </FloatingBulkBar>
    );
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('floats fixed to the viewport, states the count, and runs its actions', async () => {
    const onExport = vi.fn();
    render(
      <FloatingBulkBar count={3} noun={NOUN} onClear={vi.fn()}>
        <BulkBarButton onClick={onExport} icon={null}>
          Export
        </BulkBarButton>
      </FloatingBulkBar>
    );
    const bar = screen.getByRole('toolbar', { name: 'Bulk actions' });
    expect(bar.parentElement?.className).toContain('fixed');
    expect(bar.parentElement?.className).toContain('bottom-');
    expect(screen.getByText('3 users selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it('clears from its button and from Escape inside the bar', async () => {
    const onClear = vi.fn();
    render(
      <FloatingBulkBar count={1} noun={NOUN} onClear={onClear}>
        <BulkBarButton onClick={vi.fn()} icon={null}>
          Export
        </BulkBarButton>
      </FloatingBulkBar>
    );
    expect(screen.getByText('1 user selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Export' }), { key: 'Escape' });
    expect(onClear).toHaveBeenCalledTimes(2);
  });

  it('disables Clear and ignores Escape while busy', async () => {
    const onClear = vi.fn();
    render(
      <FloatingBulkBar count={1} noun={NOUN} onClear={onClear} busy>
        <BulkBarButton onClick={vi.fn()} icon={null}>
          Export
        </BulkBarButton>
      </FloatingBulkBar>
    );
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Export' }), { key: 'Escape' });
    expect(onClear).not.toHaveBeenCalled();
  });
});

describe('FloatingBulkBar portals', () => {
  it('ignores an Escape that bubbles in from a portal (a dialog opened from the bar)', () => {
    const onClear = vi.fn();
    const portalTarget = document.createElement('div');
    document.body.appendChild(portalTarget);
    render(
      <FloatingBulkBar count={2} noun={NOUN} onClear={onClear}>
        {createPortal(<button type="button">In a dialog</button>, portalTarget)}
      </FloatingBulkBar>
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'In a dialog' }), { key: 'Escape' });
    expect(onClear).not.toHaveBeenCalled();
    portalTarget.remove();
  });
});

describe('filterFieldState', () => {
  it('round-trips a date input value in local time, rejecting junk', () => {
    const date = fromDateInputValue('2026-07-03');
    expect(date?.getDate()).toBe(3);
    expect(toDateInputValue(date)).toBe('2026-07-03');
    expect(fromDateInputValue('')).toBeNull();
    expect(fromDateInputValue('07/03/2026')).toBeNull();
    expect(toDateInputValue(null)).toBe('');
  });

  it('describes open and closed ranges', () => {
    const start = new Date(2026, 6, 3);
    const end = new Date(2026, 7, 1);
    expect(describeDateRange({ start, end })).toContain('–');
    expect(describeDateRange({ start, end: null })).toMatch(/^after /);
    expect(describeDateRange({ start: null, end })).toMatch(/^before /);
    expect(describeDateRange({ start: null, end: null })).toBe('any time');
  });

  it('summarizes the view (unless it is the default), active fields and the search', () => {
    const views = [
      { id: 'all', label: 'All' },
      { id: 'pending', label: 'Pending' },
    ];
    const fields = [
      {
        kind: 'options' as const,
        key: 'class',
        label: 'Class',
        value: 'a',
        onChange: vi.fn(),
        options: [{ value: 'a', label: 'Novice A' }],
      },
      {
        kind: 'options' as const,
        key: 'trial',
        label: 'Trial',
        value: null,
        onChange: vi.fn(),
        options: [],
      },
    ];
    expect(summarizeFilters({ views, activeViewId: 'all' })).toEqual([]);
    expect(summarizeFilters({ views, activeViewId: 'pending', fields, search: ' bob ' })).toEqual([
      'Pending',
      'Class: Novice A',
      'matching “bob”',
    ]);
  });
});
