import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import { render } from '@/test/utils/testUtils';
import type { Show } from '@/types/show-types';
import { OfferedClassesSection } from '../OfferedClassesSection';
import { OFFERED_CLASSES_ANCHOR } from '../offeredClasses';

function show(trials: unknown[]): Show {
  return fromAny<Show, unknown>({ id: 'show-1', name: 'Heartland', trials });
}

const HEARTLAND = show([
  {
    id: 't1',
    name: 'Saturday Trial',
    classes: [
      { id: 'c1', element: 'Interior', level: 'Advanced' },
      { id: 'c2', element: 'Container', level: 'Novice', section: 'A' },
    ],
  },
  {
    id: 't2',
    name: 'Sunday UKC Nosework',
    classes: [{ id: 'c3', element: 'Vehicle', level: 'Advanced' }],
  },
]);

describe('OfferedClassesSection', () => {
  it('carries the anchor the See classes link targets', () => {
    const { container } = render(<OfferedClassesSection show={HEARTLAND} />);
    expect(container.querySelector(`#${OFFERED_CLASSES_ANCHOR}`)).not.toBeNull();
  });

  it('renders one block per trial so registries stay distinguishable', () => {
    render(<OfferedClassesSection show={HEARTLAND} />);
    expect(screen.getAllByTestId('offered-classes-trial')).toHaveLength(2);
    expect(screen.getByText('Saturday Trial')).toBeInTheDocument();
    expect(screen.getByText('Sunday UKC Nosework')).toBeInTheDocument();
  });

  it('shows the element with its levels, and section letters beside the level', () => {
    render(<OfferedClassesSection show={HEARTLAND} />);
    // Scoped to the Saturday block: 'Advanced' legitimately appears in both
    // trials (Interior Advanced and Vehicle Advanced), which is the point.
    const saturday = within(screen.getAllByTestId('offered-classes-trial')[0] as HTMLElement);
    expect(saturday.getByText('Interior')).toBeInTheDocument();
    expect(saturday.getByText('Advanced')).toBeInTheDocument();
    expect(saturday.getByText('Novice A')).toBeInTheDocument();
  });

  it('lets an exhibitor see that Interior runs Saturday but not the UKC trial', () => {
    render(<OfferedClassesSection show={HEARTLAND} />);
    const blocks = screen.getAllByTestId('offered-classes-trial');
    expect(blocks[0]).toHaveTextContent('Interior');
    expect(blocks[1]).not.toHaveTextContent('Interior');
  });

  it('renders nothing when the show has no published classes', () => {
    const { container } = render(
      <OfferedClassesSection show={show([{ id: 't1', name: 'T', classes: [] }])} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing rather than an empty shell for a null show', () => {
    const { container } = render(<OfferedClassesSection show={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('inherits the host theme colour instead of imposing its own', () => {
    const { container } = render(<OfferedClassesSection show={HEARTLAND} />);
    const section = container.querySelector(`#${OFFERED_CLASSES_ANCHOR}`) as HTMLElement;
    expect(section.style.color).toBe('currentcolor');
  });
});
