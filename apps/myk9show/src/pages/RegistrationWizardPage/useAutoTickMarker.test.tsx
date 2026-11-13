/**
 * MYK9-1795 — an untouched automatic tick is not a started entry.
 *
 * Runs the REAL `useDraftPersistence` (timer, unmount, `pagehide`) and the real
 * registration owner against the marker, so the passive-visit case is proven on
 * what actually writes, not only on the selection hook.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEffect, useMemo, useState } from 'react';
import type { Dog } from '@/types/dog-types';
import type { RegistrationFormData } from '@/types/show-registration-types';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import { useDraftPersistence } from '@/hooks/useDraftPersistence';
import { selectedDogsOwner } from '@/features/registration/selectedDogsOwner';
import { useWizardRegistrationOwner } from './useWizardRegistrationOwner';
import { useAutoTickMarker } from './useAutoTickMarker';

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const dogs = [{ id: 'dog-1', ownerId: 'owner-1' }] as unknown as Dog[];
const initial = { selectedDogs: [] } as unknown as RegistrationFormData;

function useHarness() {
  const [registrationData, setRegistrationData] = useState<RegistrationFormData>(initial);
  const [currentStepId, setStep] = useState('dog-selection');
  const { isPassiveAutoTick, markAutoTick } = useAutoTickMarker({
    registrationData,
    currentStepId,
    classSelectionCount: 0,
    handlerAssignmentCount: 0,
  });
  const setDraftData = useShowRegistrationStore(s => s.setDraftData);
  useEffect(() => {
    setDraftData({ selectedDogs: registrationData.selectedDogs });
  }, [registrationData, setDraftData]);
  const persistence = useDraftPersistence('show-1', 'user-1', currentStepId, {
    autoSaveInterval: 1000,
    suppressSave: isPassiveAutoTick,
  });
  const [registrationId, setRegistrationId] = useState<string | undefined>();
  const ownerResolution = useMemo(
    () => selectedDogsOwner(dogs, registrationData.selectedDogs),
    [registrationData.selectedDogs]
  );
  const createRegistration = useShowRegistrationStore(s => s.createRegistration);
  useWizardRegistrationOwner({
    ownerResolution,
    hasSelection: registrationData.selectedDogs.length > 0 && !isPassiveAutoTick,
    registrationId,
    setRegistrationId,
    createRegistration,
    showId: 'show-1',
    userId: 'user-1',
  });
  const select = (selectedDogs: string[]) =>
    setRegistrationData(prev => ({ ...prev, selectedDogs }));
  return { persistence, registrationId, isPassiveAutoTick, markAutoTick, select, setStep };
}

// Read through a fresh hook: `localStorage` is a mock whose keys cannot be enumerated.
const storedDrafts = () =>
  renderHook(() => useDraftPersistence('show-1', 'user-1', 'dog-selection')).result.current
    .availableDrafts;
const registrations = () => Object.keys(useShowRegistrationStore.getState().registrations ?? {});

function tickAutomatically(result: { current: ReturnType<typeof useHarness> }) {
  act(() => {
    result.current.select(['dog-1']);
    result.current.markAutoTick('dog-1');
  });
}

describe('untouched automatic tick', () => {
  beforeEach(() => {
    localStorage.clear();
    useShowRegistrationStore.setState(useShowRegistrationStore.getInitialState());
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes no draft and creates no registration on the timer, pagehide or unmount', () => {
    const { result, unmount } = renderHook(useHarness);
    tickAutomatically(result);

    expect(result.current.isPassiveAutoTick).toBe(true);
    expect(result.current.persistence.hasUnsavedChanges).toBe(false);
    act(() => vi.advanceTimersByTime(5000));
    act(() => window.dispatchEvent(new Event('pagehide')));
    unmount();

    expect(storedDrafts()).toEqual([]);
    expect(registrations()).toEqual([]);
  });

  it('behaves as today once she unticks it, and does not treat a re-tick as automatic', () => {
    const { result, unmount } = renderHook(useHarness);
    tickAutomatically(result);

    act(() => result.current.select([]));
    expect(result.current.isPassiveAutoTick).toBe(false);
    act(() => result.current.select(['dog-1']));
    expect(result.current.isPassiveAutoTick).toBe(false);
    expect(result.current.persistence.hasUnsavedChanges).toBe(true);
    expect(result.current.registrationId).toBeDefined();

    act(() => vi.advanceTimersByTime(1100));
    expect(result.current.persistence.availableDrafts).toHaveLength(1);
    unmount();
  });

  it('saves on unmount after she leaves the dog step', () => {
    const { result, unmount } = renderHook(useHarness);
    tickAutomatically(result);

    act(() => result.current.setStep('class-selection'));
    expect(result.current.isPassiveAutoTick).toBe(false);
    unmount();

    expect(storedDrafts()).toHaveLength(1);
  });
});
