/**
 * exhibitor-ux-remediation (dog-rail scroll affordance): the dog rail scrolls
 * horizontally at tablet widths, but the class that was meant to hide its
 * scrollbar (`scrollbar-hide`) was never defined — leaving no scroll hint at
 * all on touch, where overlay scrollbars stay hidden. The rail now uses the
 * real `hide-scrollbar` utility plus `scroll-shadow-x`, an overflow-aware edge
 * fade that signals more content.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { DogStrip } from '@/components/exhibitor/DogStrip';

const dogs = [
  {
    id: 'dog-1',
    call_name: 'Willow',
    registrations: [{ breed: 'Border Collie', organization: 'AKC' }],
  },
  { id: 'dog-2', call_name: 'Juni', registrations: [{ breed: 'Labrador', organization: 'AKC' }] },
];

describe('DogStrip — horizontal scroll affordance', () => {
  it('gives the scroll rail an overflow-aware fade hint and the real scrollbar-hide utility', () => {
    const { container } = render(<DogStrip dogs={dogs} />);

    const rail = container.querySelector('.overflow-x-auto');
    expect(rail).not.toBeNull();
    expect(rail).toHaveClass('scroll-shadow-x');
    expect(rail).toHaveClass('hide-scrollbar');
    // The old class was a no-op typo (the defined utility is `hide-scrollbar`).
    expect(rail).not.toHaveClass('scrollbar-hide');
  });
});
