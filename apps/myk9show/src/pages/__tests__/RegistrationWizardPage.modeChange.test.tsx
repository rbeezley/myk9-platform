/**
 * Tests for the workflow-mode-change reset effect.
 *
 * A useEffect resets stepCompletionState and currentStep — and re-applies the
 * per-mode payment default (exhibitor → online card, on-behalf → unset) — when
 * currentWorkflowMode changes mid-session (RBAC resolving async). These tests
 * verify that behavior using renderHook to isolate the logic.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState, useRef, useEffect } from 'react';

// ─── Inline reproduction of the fix ────────────────────────────────────────────
// We extract the exact pattern used in RegistrationWizardPage so the test
// is decoupled from the massive mocking burden of the full page component.

// Mirrors RegistrationWizardPage: exhibitor self-service defaults to online
// card; on-behalf modes (secretary/admin/club) can't use card checkout, so they
// start with no method selected.
const defaultPaymentForMode = (mode: string): 'credit_card' | undefined =>
  mode === 'exhibitor' ? 'credit_card' : undefined;

function useModeChangeReset(currentWorkflowMode: string) {
  const [stepCompletionState, setStepCompletionState] = useState<Record<string, boolean>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | undefined>(
    defaultPaymentForMode(currentWorkflowMode)
  );

  const prevWorkflowMode = useRef(currentWorkflowMode);
  useEffect(() => {
    if (prevWorkflowMode.current !== currentWorkflowMode) {
      prevWorkflowMode.current = currentWorkflowMode;
      /* eslint-disable react-hooks/set-state-in-effect */
      setStepCompletionState({});
      setCurrentStep(0);
      setPaymentMethod(defaultPaymentForMode(currentWorkflowMode));
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [currentWorkflowMode]);

  return {
    stepCompletionState,
    currentStep,
    paymentMethod,
    setStepCompletionState,
    setCurrentStep,
    setPaymentMethod,
  };
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
    const mode = 'exhibitor';
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

  it('defaults paymentMethod to online card for exhibitor self-service', () => {
    const { result } = renderHook(() => useModeChangeReset('exhibitor'));
    expect(result.current.paymentMethod).toBe('credit_card');
  });

  it('starts with no paymentMethod for on-behalf modes (card checkout unavailable)', () => {
    expect(renderHook(() => useModeChangeReset('secretary_new')).result.current.paymentMethod).toBe(
      undefined
    );
    expect(renderHook(() => useModeChangeReset('club_admin')).result.current.paymentMethod).toBe(
      undefined
    );
    expect(renderHook(() => useModeChangeReset('site_admin')).result.current.paymentMethod).toBe(
      undefined
    );
  });

  it('clears the card default when RBAC flips exhibitor → on-behalf mid-session', () => {
    let mode = 'exhibitor';
    const { result, rerender } = renderHook(() => useModeChangeReset(mode));
    expect(result.current.paymentMethod).toBe('credit_card');

    // Permissions resolve and the mode flips to an on-behalf flow.
    mode = 'secretary_new';
    rerender();

    expect(result.current.paymentMethod).toBeUndefined();
  });

  it('does NOT clobber a payment choice made within the same mode', () => {
    const mode = 'exhibitor';
    const { result, rerender } = renderHook(() => useModeChangeReset(mode));

    // Exhibitor switches from the card default to pay by check at the show.
    act(() => {
      result.current.setPaymentMethod(undefined);
    });
    rerender();

    expect(result.current.paymentMethod).toBeUndefined();
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
