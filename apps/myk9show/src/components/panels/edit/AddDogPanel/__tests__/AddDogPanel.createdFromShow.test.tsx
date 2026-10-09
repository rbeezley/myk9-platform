import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import { render } from '@/test/utils/testUtils';
import { AddDogPanel } from '../index';
import type { EditPanelSaveContext } from '../../EditPanelWrapper';

// MYK9-1059: the panel hands the store the show whose add-entry flow opened it.
const SHOW_ID = '6349d047-34fe-4307-b29a-c1ae6d7750c7';
const captured = vi.hoisted(() => ({ onSave: null as unknown }));
const { addDog, addDogOfflineFirst } = vi.hoisted(() => ({
  addDog: vi.fn(),
  addDogOfflineFirst: vi.fn(),
}));

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
    addDogOfflineFirst,
    dogs: [],
    isLoading: false,
    error: null,
  }),
}));

const formData = {
  callName: 'Liddle',
  gender: 'Female',
  dateOfBirth: '2020-01-01',
  ownerId: 'person-1',
  microchip: '',
  registrations: [],
};

async function save() {
  const run = captured.onSave as (d: typeof formData, c: EditPanelSaveContext) => Promise<void>;
  await act(async () => {
    await run(formData, { runSelfNavigation: fn => fn() });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  const saved = fromAny({ id: 'dog-1', callName: 'Liddle', name: 'Liddle' });
  addDog.mockResolvedValue(saved);
  addDogOfflineFirst.mockResolvedValue(saved);
});

describe('AddDogPanel created_from_show_id (MYK9-1059)', () => {
  it('online: addDog receives the show id', async () => {
    render(
      <AddDogPanel open onClose={vi.fn()} onDogCreated={vi.fn()} createdFromShowId={SHOW_ID} />
    );
    await save();
    expect(addDog).toHaveBeenCalledWith(expect.anything(), { createdFromShowId: SHOW_ID });
  });

  it('offline-first: addDogOfflineFirst receives the show id next to dependsOn', async () => {
    render(
      <AddDogPanel
        open
        onClose={vi.fn()}
        onDogCreated={vi.fn()}
        offlineFirst
        offlineDependsOn={['m1']}
        createdFromShowId={SHOW_ID}
      />
    );
    await save();
    expect(addDogOfflineFirst).toHaveBeenCalledWith(expect.anything(), {
      dependsOn: ['m1'],
      createdFromShowId: SHOW_ID,
    });
  });

  it('outside the wizard: no show id is sent on either path', async () => {
    const { unmount } = render(<AddDogPanel open onClose={vi.fn()} onDogCreated={vi.fn()} />);
    await save();
    expect(addDog).toHaveBeenCalledWith(expect.anything(), {});
    unmount();
    render(<AddDogPanel open onClose={vi.fn()} onDogCreated={vi.fn()} offlineFirst />);
    await save();
    expect(addDogOfflineFirst).toHaveBeenCalledWith(expect.anything(), {});
  });
});
