import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowMapReorderBanner } from '../ShowMapReorderBanner';

describe('ShowMapReorderBanner', () => {
  it('renders the class label in the heading copy', () => {
    render(
      <ShowMapReorderBanner
        active={{ classId: 'c1', classLabel: 'Container Novice A' }}
        isPersisting={false}
        onDone={vi.fn()}
      />
    );
    expect(screen.getByText(/Reordering Container Novice A/i)).toBeInTheDocument();
  });

  it('calls onDone when the Done button is clicked', () => {
    const onDone = vi.fn();
    render(
      <ShowMapReorderBanner
        active={{ classId: 'c1', classLabel: 'Container Novice A' }}
        isPersisting={false}
        onDone={onDone}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Done/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows a Saving indicator while persisting', () => {
    render(
      <ShowMapReorderBanner
        active={{ classId: 'c1', classLabel: 'Container Novice A' }}
        isPersisting
        onDone={vi.fn()}
      />
    );
    expect(screen.getByText(/Saving/i)).toBeInTheDocument();
  });

  it('mentions Escape as an exit affordance', () => {
    render(
      <ShowMapReorderBanner
        active={{ classId: 'c1', classLabel: 'Container Novice A' }}
        isPersisting={false}
        onDone={vi.fn()}
      />
    );
    expect(screen.getByText(/Press Escape or Done/i)).toBeInTheDocument();
  });
});
