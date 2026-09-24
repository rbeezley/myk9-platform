/**
 * MYK9-656: the exhibitor is told which recovered classes were removed and why.
 * Renders against the REAL cart store, with the sentences the store records for
 * the server's block codes, so the wording under test is the wording shown.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useCartStore } from '@/store/cartStore';
import { describeBlockReason } from '@/store/cartStore.classClosure';
import { ClosedClassRemovedNotice } from './ClosedClassRemovedNotice';
import { describeDroppedItem } from './closedClassRemovedNotice.helpers';

afterEach(() => {
  useCartStore.getState().reset();
});

describe('ClosedClassRemovedNotice', () => {
  it('renders nothing when no class was removed', () => {
    const { container } = render(<ClosedClassRemovedNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names each removed class and its reason, then dismisses', () => {
    useCartStore.setState({
      droppedClosedClassItems: [
        {
          itemId: 'item-1',
          dogName: 'Rover',
          className: 'Exterior Master',
          reason: describeBlockReason('cancelled'),
        },
        {
          itemId: 'item-2',
          dogName: 'Rover',
          className: 'Handler Discrimination Advanced',
          reason: describeBlockReason('full'),
        },
      ],
    });

    render(<ClosedClassRemovedNotice />);

    expect(
      screen.getByText(
        'We took 2 classes out of your saved cart, so you will not be charged for them.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Rover in Exterior Master: this class was cancelled.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Rover in Handler Discrimination Advanced: this class is full.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(useCartStore.getState().droppedClosedClassItems).toEqual([]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('falls back gracefully when the dog or class name is unknown', () => {
    expect(
      describeDroppedItem({
        itemId: 'x',
        dogName: null,
        className: null,
        reason: describeBlockReason('finished'),
      })
    ).toBe('One class: this class has finished.');
  });
});
