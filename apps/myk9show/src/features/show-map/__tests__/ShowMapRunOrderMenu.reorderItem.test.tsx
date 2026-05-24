import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowMapRunOrderMenu } from '../ShowMapRunOrderMenu';

describe('ShowMapRunOrderMenu — Reorder manually item', () => {
  it('does not render the Reorder manually item when onEnterReorderMode is omitted', () => {
    render(
      <ShowMapRunOrderMenu
        classId="c1"
        classLabel="Container Novice"
        entryCount={3}
        onAutoSort={vi.fn()}
        isAutoSorting={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Run order for Container Novice/i }));
    expect(screen.queryByText(/Reorder manually/i)).not.toBeInTheDocument();
  });

  it('renders the Reorder manually item when onEnterReorderMode is provided', () => {
    const onEnter = vi.fn();
    render(
      <ShowMapRunOrderMenu
        classId="c1"
        classLabel="Container Novice"
        entryCount={3}
        onAutoSort={vi.fn()}
        isAutoSorting={false}
        onEnterReorderMode={onEnter}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Run order for Container Novice/i }));
    fireEvent.click(screen.getByText(/Reorder manually/i));
    expect(onEnter).toHaveBeenCalledWith({ classId: 'c1', classLabel: 'Container Novice' });
  });

  it('disables menu items while isReordering is true', () => {
    const onEnter = vi.fn();
    render(
      <ShowMapRunOrderMenu
        classId="c1"
        classLabel="Container Novice"
        entryCount={3}
        onAutoSort={vi.fn()}
        isAutoSorting={false}
        onEnterReorderMode={onEnter}
        isReordering
      />
    );
    expect(
      screen.getByRole('button', { name: /Run order for Container Novice/i })
    ).toBeDisabled();
  });
});
