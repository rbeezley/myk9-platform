/**
 * MYK9-1162 — the wizard's local registration follows the resolved owner.
 *
 * The inline Add Dog panel selects a dog before the roster lists it, so the
 * owner cannot be resolved at selection time. The registration has to appear
 * once `dogs` catches up, and re-key when the selection moves to another owner.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { StrictMode, useMemo, useState } from 'react';
import type { Dog } from '@/types/dog-types';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import { selectedDogsOwner } from '@/features/registration/selectedDogsOwner';
import { useWizardRegistrationOwner } from './useWizardRegistrationOwner';

const dog = (id: string, ownerId: string) => ({ id, ownerId }) as unknown as Dog;

function useHarness(initialDogs: Dog[], initialSelected: string[]) {
  const [dogs, setDogs] = useState(initialDogs);
  const [selectedDogs, setSelectedDogs] = useState(initialSelected);
  const [registrationId, setRegistrationId] = useState<string | undefined>();
  const ownerResolution = useMemo(
    () => selectedDogsOwner(dogs, selectedDogs),
    [dogs, selectedDogs]
  );
  const createRegistration = useShowRegistrationStore(s => s.createRegistration);
  useWizardRegistrationOwner({
    ownerResolution,
    hasSelection: selectedDogs.length > 0,
    registrationId,
    setRegistrationId,
    createRegistration,
    showId: 'show-1',
    userId: 'user-1',
  });
  return { setDogs, setSelectedDogs, registrationId };
}

const handlerOf = (id: string | undefined) =>
  id ? useShowRegistrationStore.getState().getRegistration(id)?.handlerId : undefined;

describe('useWizardRegistrationOwner', () => {
  beforeEach(() => {
    useShowRegistrationStore.setState(useShowRegistrationStore.getInitialState());
  });

  it('creates the registration when the selected dog reaches the roster after the selection', () => {
    const { result } = renderHook(() => useHarness([dog('a', 'owner-x')], []));
    act(() => result.current.setSelectedDogs(['new-dog']));
    expect(result.current.registrationId).toBeUndefined();

    act(() => result.current.setDogs([dog('a', 'owner-x'), dog('new-dog', 'owner-x')]));
    expect(handlerOf(result.current.registrationId)).toBe('owner-x');
  });

  it('replaces the registration when the selection moves to another owner', () => {
    const dogs = [dog('a', 'owner-x'), dog('b', 'owner-y')];
    const { result } = renderHook(() => useHarness(dogs, ['a']));
    expect(handlerOf(result.current.registrationId)).toBe('owner-x');
    act(() => result.current.setSelectedDogs(['b']));
    expect(handlerOf(result.current.registrationId)).toBe('owner-y');
  });

  it('keeps one registration for an unchanged owner and creates none for a multi-owner cart', () => {
    const dogs = [dog('a', 'owner-x'), dog('b', 'owner-y'), dog('c', 'owner-x')];
    const { result } = renderHook(() => useHarness(dogs, ['a']));
    const first = result.current.registrationId;
    act(() => result.current.setSelectedDogs(['a', 'c']));
    expect(result.current.registrationId).toBe(first);
    act(() => result.current.setSelectedDogs(['a', 'b']));
    expect(result.current.registrationId).toBe(first);
  });

  it('creates exactly one registration under StrictMode double effects', () => {
    renderHook(() => useHarness([dog('a', 'owner-x')], ['a']), { wrapper: StrictMode });
    expect(Object.keys(useShowRegistrationStore.getState().registrationsById)).toHaveLength(1);
  });
});
