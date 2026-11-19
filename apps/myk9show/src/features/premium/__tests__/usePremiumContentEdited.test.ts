import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePremiumContentEdited } from '../usePremiumContentEdited';
import { generatedPremium } from './fixtures/generatedPremium';

describe('usePremiumContentEdited (MYK9-2201)', () => {
  it('takes the first content seen as unedited on a first mount', () => {
    const onEdited = vi.fn();
    const { supplemental, narratives } = generatedPremium();
    renderHook(() => usePremiumContentEdited(supplemental, narratives, onEdited));
    expect(onEdited).toHaveBeenLastCalledWith(false);
  });

  it('after a tab round trip, still reports an edit made before it', () => {
    const loaded = generatedPremium();
    const edited = generatedPremium();
    edited.narratives = { ...edited.narratives, showHours: 'Gates open at 6:30 AM.' };
    const onEdited = vi.fn();
    renderHook(() =>
      usePremiumContentEdited(edited.supplemental, edited.narratives, onEdited, {
        supplemental: loaded.supplemental,
        narratives: loaded.narratives,
      })
    );
    expect(onEdited).toHaveBeenLastCalledWith(true);
  });

  it('after a tab round trip with no edit, reports none', () => {
    const loaded = generatedPremium();
    const onEdited = vi.fn();
    renderHook(() =>
      usePremiumContentEdited(loaded.supplemental, loaded.narratives, onEdited, {
        supplemental: loaded.supplemental,
        narratives: loaded.narratives,
      })
    );
    expect(onEdited).toHaveBeenLastCalledWith(false);
  });
});
