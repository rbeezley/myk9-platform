import { describe, it, expect, vi } from 'vitest';
import { createPortal } from 'react-dom';
import { render, screen, fireEvent, userEvent } from '@/test/utils/testUtils';
import { BulkBarButton, FloatingBulkBar } from '../FloatingBulkBar';
import { ListResultLine } from '../ListResultLine';
import { ListViewTabs } from '../ListViewTabs';
import { describeDateRange, fromDateInputValue, toDateInputValue } from '../filterFieldState';

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

describe('ListViewTabs', () => {
  it('marks the active view, applies a pressed view, and links an off-page one', async () => {
    const onSelect = vi.fn();
    render(
      <ListViewTabs
        label="User views"
        activeId="all"
        onSelect={onSelect}
        views={[
          { id: 'all', label: 'All', count: 4812 },
          { id: 'never', label: 'Never signed in', count: 312 },
          { id: 'requests', label: 'Role requests', href: '/admin/role-requests' },
        ]}
      />
    );
    expect(screen.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /All/ })).toHaveTextContent((4812).toLocaleString());
    await userEvent.click(screen.getByRole('button', { name: /Never signed in/ }));
    expect(onSelect).toHaveBeenCalledWith('never');
    expect(screen.getByRole('link', { name: 'Role requests' })).toHaveAttribute(
      'href',
      '/admin/role-requests'
    );
  });
});

describe('ListResultLine', () => {
  it('announces "N in view" unfiltered and "N match, of M" filtered', () => {
    const { rerender } = render(
      <ListResultLine shown={1} total={1} noun={NOUN} filtered={false} />
    );
    expect(screen.getByRole('status')).toHaveTextContent('1 user in view');
    rerender(<ListResultLine shown={2} total={10} noun={NOUN} filtered />);
    expect(screen.getByRole('status')).toHaveTextContent('2 users match, of 10');
  });

  it('offers "Select all" only for a partial selection', async () => {
    const onSelectAll = vi.fn();
    const { rerender } = render(
      <ListResultLine
        shown={40}
        total={90}
        noun={NOUN}
        filtered
        selectAll={{ selectedCount: 0, onSelectAll }}
      />
    );
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();

    rerender(
      <ListResultLine
        shown={40}
        total={90}
        noun={NOUN}
        filtered
        selectAll={{ selectedCount: 3, onSelectAll }}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Select all 40 users' }));
    expect(onSelectAll).toHaveBeenCalledOnce();

    rerender(
      <ListResultLine
        shown={40}
        total={90}
        noun={NOUN}
        filtered
        selectAll={{ selectedCount: 40, onSelectAll }}
      />
    );
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();
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
});
