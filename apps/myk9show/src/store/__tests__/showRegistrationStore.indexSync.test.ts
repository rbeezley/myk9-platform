import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import { emptyRegistrationIndexes } from '@/store/buildRegistrationIndexes';

vi.mock('@/services/database/queries/showRegistrationQueries', () => ({
  getRegistrationByShowAndHandler: vi.fn(),
  createShowRegistration: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

const resetStore = () =>
  useShowRegistrationStore.setState({
    registrations: [],
    currentRegistration: null,
    currentRegistrationId: null,
    ...emptyRegistrationIndexes(),
    draftData: {},
    registrationContext: null,
  });

describe('store byId sync with registrations[]', () => {
  beforeEach(() => resetStore());

  it('rebuilds registrationsById after createRegistration', () => {
    const reg = useShowRegistrationStore
      .getState()
      .createRegistration('show-1', 'user-1', 'handler-1');
    const state = useShowRegistrationStore.getState();
    expect(state.registrationsById[reg.id]).toEqual(reg);
    expect(state.currentRegistrationId).toBe(reg.id);
  });

  it('rebuilds entriesById after addEntry', () => {
    const reg = useShowRegistrationStore
      .getState()
      .createRegistration('show-1', 'user-1', 'handler-1');
    useShowRegistrationStore.getState().addEntry(reg.id, {
      dogId: 'dog-1',
      dogName: 'Rex',
      trialId: 't',
      trialName: 'Trial',
      classes: [],
      handlerName: 'Alice',
    });
    const state = useShowRegistrationStore.getState();
    const entryIds = Object.keys(state.entriesById);
    expect(entryIds).toHaveLength(1);
    expect(state.entriesById[entryIds[0]!]?.dogName).toBe('Rex');
  });

  it('rebuilds classesById after addClassToEntry', () => {
    const reg = useShowRegistrationStore
      .getState()
      .createRegistration('show-1', 'user-1', 'handler-1');
    useShowRegistrationStore.getState().addEntry(reg.id, {
      dogId: 'dog-1',
      dogName: 'Rex',
      trialId: 't',
      trialName: 'Trial',
      classes: [],
      handlerName: 'Alice',
    });
    const entryId = Object.keys(useShowRegistrationStore.getState().entriesById)[0]!;
    useShowRegistrationStore.getState().addClassToEntry(reg.id, entryId, {
      classId: 'class-1',
      className: 'Novice A',
      classNumber: '1',
      fee: 25,
      status: 'entered',
    });
    const state = useShowRegistrationStore.getState();
    const classIds = Object.keys(state.classesById);
    expect(classIds).toHaveLength(1);
    expect(state.classesById[classIds[0]!]?.className).toBe('Novice A');
  });

  it('removes deleted registrations from registrationsById', () => {
    const reg = useShowRegistrationStore
      .getState()
      .createRegistration('show-1', 'user-1', 'handler-1');
    useShowRegistrationStore.getState().deleteRegistration(reg.id);
    const state = useShowRegistrationStore.getState();
    expect(state.registrationsById[reg.id]).toBeUndefined();
    expect(state.currentRegistrationId).toBeNull();
  });

  it('removes deleted entries from entriesById', () => {
    const reg = useShowRegistrationStore
      .getState()
      .createRegistration('show-1', 'user-1', 'handler-1');
    useShowRegistrationStore.getState().addEntry(reg.id, {
      dogId: 'dog-1',
      dogName: 'Rex',
      trialId: 't',
      trialName: 'Trial',
      classes: [],
      handlerName: 'Alice',
    });
    const entryId = Object.keys(useShowRegistrationStore.getState().entriesById)[0]!;
    useShowRegistrationStore.getState().removeEntry(reg.id, entryId);
    const state = useShowRegistrationStore.getState();
    expect(state.entriesById[entryId]).toBeUndefined();
  });

  it('updates currentRegistrationId when currentRegistration changes', () => {
    const reg = useShowRegistrationStore
      .getState()
      .createRegistration('show-1', 'user-1', 'handler-1');
    expect(useShowRegistrationStore.getState().currentRegistrationId).toBe(reg.id);

    useShowRegistrationStore.setState({ currentRegistration: null });
    expect(useShowRegistrationStore.getState().currentRegistrationId).toBeNull();
  });

  it('keeps currentRegistrationId stable and refreshes registrationsById through updateRegistration on the current registration', () => {
    const reg = useShowRegistrationStore
      .getState()
      .createRegistration('show-1', 'user-1', 'handler-1');
    expect(useShowRegistrationStore.getState().currentRegistrationId).toBe(reg.id);

    useShowRegistrationStore.getState().updateRegistration(reg.id, { notes: 'updated note' });

    const state = useShowRegistrationStore.getState();
    // Same registration is still current; id didn't drift to null or to a stale value
    expect(state.currentRegistrationId).toBe(reg.id);
    // Registration in byId reflects the update
    expect(state.registrationsById[reg.id]?.notes).toBe('updated note');
    // currentRegistration object reference advanced (new updatedAt)
    expect(state.currentRegistration?.notes).toBe('updated note');
  });
});
