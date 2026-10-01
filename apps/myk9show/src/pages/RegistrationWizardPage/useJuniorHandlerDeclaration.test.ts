import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useJuniorHandlerDeclaration } from './useJuniorHandlerDeclaration';

const akcWithTier = { juniorHandlerFee: '15.00', organization: 'AKC' };

function setup(
  overrides: Partial<Parameters<typeof useJuniorHandlerDeclaration>[0]> = {},
  initialSelected = ['dog-1', 'dog-2']
) {
  return renderHook(
    (props: Parameters<typeof useJuniorHandlerDeclaration>[0]) =>
      useJuniorHandlerDeclaration(props),
    {
      initialProps: {
        selectedDogs: initialSelected,
        paymentMethod: 'credit_card',
        show: akcWithTier,
        ...overrides,
      },
    }
  );
}

describe('useJuniorHandlerDeclaration', () => {
  it('prices only the dogs the exhibitor declared, on a card checkout with a junior tier', () => {
    const { result } = setup();
    act(() => result.current.setJuniorHandlerDog('dog-2', true));
    expect(result.current.canDeclareJuniorHandler).toBe(true);
    expect([...result.current.juniorHandlerDogIds]).toEqual(['dog-2']);
  });

  it('un-ticking removes the dog', () => {
    const { result } = setup();
    act(() => result.current.setJuniorHandlerDog('dog-1', true));
    act(() => result.current.setJuniorHandlerDog('dog-1', false));
    expect(result.current.juniorHandlerDogIds.size).toBe(0);
  });

  it('prices nothing when the exhibitor pays another way, but keeps the tick for a switch back', () => {
    const { result, rerender } = setup();
    act(() => result.current.setJuniorHandlerDog('dog-1', true));
    rerender({ selectedDogs: ['dog-1', 'dog-2'], paymentMethod: 'check', show: akcWithTier });
    expect(result.current.canDeclareJuniorHandler).toBe(false);
    expect(result.current.juniorHandlerDogIds.size).toBe(0);
    rerender({ selectedDogs: ['dog-1', 'dog-2'], paymentMethod: 'credit_card', show: akcWithTier });
    expect([...result.current.juniorHandlerDogIds]).toEqual(['dog-1']);
  });

  it('offers and prices nothing on an ASCA show, even with a junior fee on file', () => {
    const { result } = setup({ show: { juniorHandlerFee: '15.00', organization: 'ASCA' } });
    act(() => result.current.setJuniorHandlerDog('dog-1', true));
    expect(result.current.canDeclareJuniorHandler).toBe(false);
    expect(result.current.juniorHandlerDogIds.size).toBe(0);
  });

  it('offers and prices nothing when the show has no junior tier', () => {
    for (const juniorHandlerFee of [undefined, '', '0', '0.00']) {
      const { result } = setup({ show: { juniorHandlerFee, organization: 'AKC' } });
      act(() => result.current.setJuniorHandlerDog('dog-1', true));
      expect(result.current.canDeclareJuniorHandler).toBe(false);
      expect(result.current.juniorHandlerDogIds.size).toBe(0);
    }
  });

  it('drops a declaration for a dog that is no longer selected', () => {
    const { result, rerender } = setup();
    act(() => result.current.setJuniorHandlerDog('dog-2', true));
    rerender({ selectedDogs: ['dog-1'], paymentMethod: 'credit_card', show: akcWithTier });
    expect(result.current.juniorHandlerDogIds.size).toBe(0);
  });
});
