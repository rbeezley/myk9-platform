import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowMapRunOrderMenu } from '../ShowMapRunOrderMenu';

describe('ShowMapRunOrderMenu', () => {
  it('renders nothing when the class has fewer than 2 entries', () => {
    const { container } = render(
      <ShowMapRunOrderMenu
        classId="class-1"
        classLabel="Container Novice"
        entryCount={1}
        onAutoSort={vi.fn()}
        isAutoSorting={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the Run order trigger when entryCount >= 2', () => {
    render(
      <ShowMapRunOrderMenu
        classId="class-1"
        classLabel="Container Novice"
        entryCount={5}
        onAutoSort={vi.fn()}
        isAutoSorting={false}
      />
    );
    expect(screen.getByRole('button', { name: /Run order for Container Novice/i })).toBeInTheDocument();
  });

  it('fires onAutoSort with the correct kind when a preset is chosen', () => {
    const onAutoSort = vi.fn();
    render(
      <ShowMapRunOrderMenu
        classId="class-1"
        classLabel="Container Novice"
        entryCount={5}
        onAutoSort={onAutoSort}
        isAutoSorting={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Run order for Container Novice/i }));
    fireEvent.click(screen.getByText('Armband ↑'));
    expect(onAutoSort).toHaveBeenCalledWith({
      classId: 'class-1',
      kind: 'armband-asc',
      classLabel: 'Container Novice',
    });
  });

  it('disables the trigger while auto-sort is in flight', () => {
    render(
      <ShowMapRunOrderMenu
        classId="class-1"
        classLabel="Container Novice"
        entryCount={5}
        onAutoSort={vi.fn()}
        isAutoSorting
      />
    );
    expect(screen.getByRole('button', { name: /Run order for Container Novice/i })).toBeDisabled();
  });
});
