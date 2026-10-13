import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import { render } from '@/test/utils/testUtils';
import { AddDogPanel } from '../index';
import type { EditPanelSaveContext } from '../../EditPanelWrapper';

/**
 * MYK9-1125 (Codex review of fa4358531): when the person chose "Leave anyway"
 * while the dog was saving, the late completion must not run onDogCreated (it
 * routes to the new dog, or switches Quick Create's view under whatever form is
 * open now) nor raise the panel's own toast; the wrapper reports the save.
 */
const captured = vi.hoisted(() => ({ onSave: null as unknown }));
const { addDog, success } = vi.hoisted(() => ({ addDog: vi.fn(), success: vi.fn() }));

vi.mock('../../EditPanelWrapper', async importOriginal => {
  const actual = await importOriginal<typeof import('../../EditPanelWrapper')>();
  const Real = actual.EditPanelWrapper;
  return {
    ...actual,
    EditPanelWrapper: (props: { onSave: unknown }) => {
      captured.onSave = props.onSave;
      return <Real {...(props as React.ComponentProps<typeof Real>)} />;
    },
  };
});
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    addDog,
    addDogOfflineFirst: vi.fn(),
    dogs: [],
    isLoading: false,
    error: null,
  }),
}));
vi.mock('@/lib/notifications', () => ({
  notifications: { success, error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const formData = {
  callName: 'Liddle',
  gender: 'Female',
  dateOfBirth: '2020-01-01',
  ownerId: 'person-1',
  microchip: '',
  registrations: [],
};

async function save(current: boolean) {
  const run = captured.onSave as (d: typeof formData, c: EditPanelSaveContext) => Promise<void>;
  // The wrapper's own context: its runSelfNavigation stands down once not current.
  const context: EditPanelSaveContext = {
    isCurrent: () => current,
    runSelfNavigation: fn => {
      if (current) fn();
    },
  };
  await act(async () => {
    await run(formData, context);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  addDog.mockResolvedValue(fromAny({ id: 'dog-1', callName: 'Liddle', name: 'Liddle' }));
});

describe('AddDogPanel save the person left (MYK9-1125)', () => {
  it('does not call onDogCreated or raise its own toast', async () => {
    const onDogCreated = vi.fn();
    render(<AddDogPanel open onClose={vi.fn()} onDogCreated={onDogCreated} />);
    await save(false);
    expect(addDog).toHaveBeenCalledTimes(1);
    expect(onDogCreated).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  it('a save the person waited for still toasts and hands the dog on', async () => {
    const onDogCreated = vi.fn();
    render(<AddDogPanel open onClose={vi.fn()} onDogCreated={onDogCreated} />);
    await save(true);
    expect(success).toHaveBeenCalledTimes(1);
    expect(onDogCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'dog-1' }));
  });
});
