/**
 * MYK9-519 — wizard-side handoff behavior.
 *
 * Covers the rules that only the hook can enforce: one-shot application, the
 * draft beating the param, feedback instead of a silent substitution, and the
 * secretary flow being left alone.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { Dog } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import { useEntryDogHandoff } from './useEntryDogHandoff';

const warning = vi.fn();
vi.mock('@/lib/notifications', () => ({
  notifications: {
    warning: (...args: unknown[]) => warning(...args),
  },
}));

const permissions = { user: { id: 'owner-1' }, roles: [UserRole.EXHIBITOR] as UserRole[] };
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => permissions,
}));

function makeDog(overrides: Partial<Dog> = {}): Dog {
  return {
    id: 'dog-1',
    name: 'Maple Of The Glen',
    callName: 'Maple',
    breed: 'Border Collie',
    sex: 'female',
    ownerId: 'owner-1',
    status: 'active',
    ...overrides,
  } as Dog;
}

interface Options {
  route?: string;
  dogs?: Dog[];
  dogsReady?: boolean;
  selectedDogs?: string[];
  mode?: string;
  steps?: string[];
}

function render(options: Options = {}) {
  const handleDogSelectionChange = vi.fn();
  const props = {
    dogs: options.dogs ?? [makeDog()],
    dogsReady: options.dogsReady ?? true,
    registrationData: { selectedDogs: options.selectedDogs ?? [] },
    currentWorkflowMode: options.mode ?? 'exhibitor',
    currentWorkflowConfig: { steps: options.steps ?? ['dog-selection', 'class-selection'] },
    handleDogSelectionChange,
  };
  const result = renderHook((next: typeof props) => useEntryDogHandoff(next), {
    initialProps: props,
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[options.route ?? '/shows/s1/register?dogId=dog-1']}>
        {children}
      </MemoryRouter>
    ),
  });
  return { ...result, handleDogSelectionChange, props };
}

beforeEach(() => {
  warning.mockClear();
  permissions.user = { id: 'owner-1' };
  permissions.roles = [UserRole.EXHIBITOR];
});

describe('useEntryDogHandoff', () => {
  it('preselects the carried dog through the step handler', () => {
    const { handleDogSelectionChange } = render();
    expect(handleDogSelectionChange).toHaveBeenCalledWith(['dog-1']);
    expect(warning).not.toHaveBeenCalled();
  });

  it('leaves the ordinary no-context entry path untouched', () => {
    const { handleDogSelectionChange } = render({ route: '/shows/s1/register' });
    expect(handleDogSelectionChange).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it('waits for the roster before deciding a dog is missing', () => {
    const { rerender, handleDogSelectionChange, props } = render({ dogsReady: false, dogs: [] });
    expect(warning).not.toHaveBeenCalled();
    rerender({ ...props, dogs: [makeDog()], dogsReady: true });
    expect(handleDogSelectionChange).toHaveBeenCalledWith(['dog-1']);
  });

  it('applies at most once, so re-renders never re-add a dog the user removed', () => {
    const { rerender, handleDogSelectionChange, props } = render();
    expect(handleDogSelectionChange).toHaveBeenCalledTimes(1);
    rerender({ ...props, registrationData: { selectedDogs: ['dog-1'] } });
    rerender({ ...props, registrationData: { selectedDogs: [] } });
    expect(handleDogSelectionChange).toHaveBeenCalledTimes(1);
  });

  it('lets a resumed draft win over the param, with no toast', () => {
    const { handleDogSelectionChange } = render({ selectedDogs: ['dog-2'] });
    expect(handleDogSelectionChange).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it('explains a dog that is not theirs instead of selecting another one', () => {
    const { handleDogSelectionChange } = render({
      dogs: [makeDog({ id: 'dog-1', ownerId: 'someone-else' }), makeDog({ id: 'dog-9' })],
    });
    expect(handleDogSelectionChange).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      expect.stringMatching(/couldn't find that dog/i),
      expect.anything()
    );
  });

  it('explains a soft-deleted dog rather than silently ignoring the link', () => {
    const { handleDogSelectionChange } = render({
      dogs: [makeDog({ deletedAt: '2026-01-01T00:00:00Z' })],
    });
    expect(handleDogSelectionChange).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalled();
  });

  it("names the step's own eligibility reason for a dog too young to enter", () => {
    const puppy = new Date();
    puppy.setMonth(puppy.getMonth() - 1);
    const { handleDogSelectionChange } = render({
      dogs: [makeDog({ dateOfBirth: puppy.toISOString().slice(0, 10) })],
    });
    expect(handleDogSelectionChange).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('Too young (must be 6+ months)'),
      expect.anything()
    );
  });

  it('does not touch the secretary-on-behalf flow', () => {
    const { handleDogSelectionChange } = render({ mode: 'secretary' });
    expect(handleDogSelectionChange).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it('skips a workflow with no dog-selection step to preselect into', () => {
    const { handleDogSelectionChange } = render({ steps: ['class-selection', 'payment'] });
    expect(handleDogSelectionChange).not.toHaveBeenCalled();
  });
});
