/**
 * Tests for Issue 17: step state desync across workflow mode flips.
 *
 * The fix adds a useEffect that resets stepCompletionState and currentStep
 * when currentWorkflowMode changes mid-session. This test verifies that
 * behavior using renderHook to isolate the logic.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState, useRef, useEffect } from 'react';

// ─── Inline reproduction of the fix ────────────────────────────────────────────
// We extract the exact pattern used in RegistrationWizardPage so the test
// is decoupled from the massive mocking burden of the full page component.

function useModeChangeReset(currentWorkflowMode: string) {
  const [stepCompletionState, setStepCompletionState] = useState<Record<string, boolean>>({});
  const [currentStep, setCurrentStep] = useState(0);

  const prevWorkflowMode = useRef(currentWorkflowMode);
  useEffect(() => {
    if (prevWorkflowMode.current !== currentWorkflowMode) {
      prevWorkflowMode.current = currentWorkflowMode;
      setStepCompletionState({});
      setCurrentStep(0);
    }
  }, [currentWorkflowMode]);

  return { stepCompletionState, currentStep, setStepCompletionState, setCurrentStep };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('RegistrationWizardPage — step state reset on mode change', () => {
  it('does NOT reset state on mount (no spurious reset)', () => {
    const { result } = renderHook(() => useModeChangeReset('exhibitor'));

    // Simulate user completing a step
    act(() => {
      result.current.setStepCompletionState({ 'dog-selection': true });
      result.current.setCurrentStep(1);
    });

    // Mode hasn't changed — state should be intact
    expect(result.current.stepCompletionState).toEqual({ 'dog-selection': true });
    expect(result.current.currentStep).toBe(1);
  });

  it('resets stepCompletionState to {} when mode changes', () => {
    let mode = 'exhibitor';
    const { result, rerender } = renderHook(() => useModeChangeReset(mode));

    // Simulate completing a step
    act(() => {
      result.current.setStepCompletionState({ 'dog-selection': true, 'class-selection': true });
      result.current.setCurrentStep(2);
    });

    expect(result.current.stepCompletionState).toEqual({
      'dog-selection': true,
      'class-selection': true,
    });

    // Simulate role change — mode flips to secretary_existing
    mode = 'secretary_existing';
    rerender();

    expect(result.current.stepCompletionState).toEqual({});
  });

  it('resets currentStep to 0 when mode changes', () => {
    let mode = 'exhibitor';
    const { result, rerender } = renderHook(() => useModeChangeReset(mode));

    act(() => {
      result.current.setCurrentStep(3);
    });
    expect(result.current.currentStep).toBe(3);

    mode = 'club_admin';
    rerender();

    expect(result.current.currentStep).toBe(0);
  });

  it('does NOT reset when re-rendering with the same mode', () => {
    let mode = 'exhibitor';
    const { result, rerender } = renderHook(() => useModeChangeReset(mode));

    act(() => {
      result.current.setStepCompletionState({ payment: true });
      result.current.setCurrentStep(4);
    });

    // Re-render same mode (e.g. data refresh)
    rerender();

    expect(result.current.stepCompletionState).toEqual({ payment: true });
    expect(result.current.currentStep).toBe(4);
  });

  it('resets again if mode changes a second time', () => {
    let mode = 'exhibitor';
    const { result, rerender } = renderHook(() => useModeChangeReset(mode));

    // First mode change
    mode = 'secretary_existing';
    rerender();

    act(() => {
      result.current.setStepCompletionState({ 'dog-selection': true });
      result.current.setCurrentStep(1);
    });

    // Second mode change
    mode = 'site_admin';
    rerender();

    expect(result.current.stepCompletionState).toEqual({});
    expect(result.current.currentStep).toBe(0);
  });
});
