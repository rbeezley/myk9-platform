import { render, screen } from '@/test/utils/testUtils';
import { ShowMapNodeStatusBadge } from './ShowMapStatusBadge';
import type { ShowMapNode } from './showMapTypes';

function node(overrides: Partial<ShowMapNode>): ShowMapNode {
  return {
    id: 'node-1',
    type: 'trial',
    label: 'Saturday Trial',
    childrenCount: 5,
    ...overrides,
  };
}

describe('ShowMapNodeStatusBadge', () => {
  it('derives trial progress from completed child classes and uses the derived label', () => {
    render(
      <ShowMapNodeStatusBadge
        node={node({
          status: { value: 'Scheduled', label: 'Not started', kind: 'neutral' },
          progress: { completed: 3, total: 5, label: '3/5 classes complete' },
        })}
      />
    );

    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.queryByText('Not started')).not.toBeInTheDocument();
  });

  it('shows in progress when an active child exists before any class completes', () => {
    render(
      <ShowMapNodeStatusBadge
        node={node({
          status: { value: 'In Progress', label: 'In Progress', kind: 'active' },
          progress: { completed: 0, total: 5, label: '0/5 classes complete' },
        })}
      />
    );

    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it.each(['scratch', 'scratched', 'cancelled', 'canceled'])('%s uses the pulled entry shape', value => {
    const { container } = render(
      <ShowMapNodeStatusBadge
        node={node({
          type: 'entry',
          childrenCount: 0,
          status: { value, label: 'Pulled', kind: 'muted' },
        })}
      />
    );

    expect(container.querySelector('[data-status="pulled"]')).toHaveAttribute(
      'data-shape',
      'complete'
    );
  });
});
