import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ListToolbarLayout } from '../ListToolbarLayout';

const parts = {
  viewTabs: <div>views</div>,
  filterBar: <div>filters</div>,
  resultLine: <div>count</div>,
};

function order(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('div > div > div, div > div:not(:has(div))'))
    .map(node => node.textContent ?? '')
    .filter(text => ['views', 'filters', 'applied', 'count'].includes(text));
}

describe('ListToolbarLayout', () => {
  it('stacks views, filters and count as before when no applied filters are passed', () => {
    const { container } = render(<ListToolbarLayout compact={false} {...parts} />);
    expect(order(container)).toEqual(['views', 'filters', 'count']);
    expect(screen.queryByText('applied')).not.toBeInTheDocument();
  });

  it('puts the applied filters between the controls and the count', () => {
    const { container } = render(
      <ListToolbarLayout compact={false} {...parts} appliedFilters={<div>applied</div>} />
    );
    expect(order(container)).toEqual(['views', 'filters', 'applied', 'count']);
  });

  it('keeps the applied filters below the single compact row', () => {
    const { container } = render(
      <ListToolbarLayout compact {...parts} appliedFilters={<div>applied</div>} />
    );
    expect(order(container)).toEqual(['filters', 'views', 'applied', 'count']);
  });
});
