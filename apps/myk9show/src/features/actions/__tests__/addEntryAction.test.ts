import { describe, expect, it } from 'vitest';
import { resolveActions, type ActionViewer } from '@/features/actions/actionRegistry';
import { ADD_ENTRY_NO_SHOW_REASON } from '@/features/actions/createActions';

// MYK9-1490: Add Entry is in the Create group, the one Add path now the Home tile is gone.
const SHOW_ID = 'show-1';
const GLOBAL = { kind: 'global' } as const;
const IN_SHOW = { kind: 'show', showId: SHOW_ID, shellMounted: true } as const;

const secretary: ActionViewer = {
  canManageShow: false,
  canOperateShow: false,
  canCreateShows: true,
  canCreateDogs: true,
  canCreatePeople: true,
  canCreateClubs: true,
  canAddEntries: true,
};

const addEntry = (viewer: ActionViewer, route: Parameters<typeof resolveActions>[0] = GLOBAL) =>
  resolveActions(route, viewer).find(action => action.id === 'create-entry');

describe('Add Entry in the Create group', () => {
  it('goes straight to the one eligible show', () => {
    const action = addEntry({ ...secretary, entryShows: [{ id: 'a', name: 'Spring Trial' }] });

    expect(action).toMatchObject({
      group: 'create',
      label: 'Add Entry',
      href: '/secretary/register/a',
    });
    expect(action?.command).toBeUndefined();
    expect(action?.disabledReason).toBeUndefined();
  });

  it('opens the show picker when several shows can take an entry', () => {
    const action = addEntry({
      ...secretary,
      entryShows: [
        { id: 'a', name: 'Spring Trial' },
        { id: 'b', name: 'Fall Trial' },
      ],
    });

    expect(action).toMatchObject({ command: 'pick-entry-show' });
    expect(action?.href).toBeUndefined();
  });

  it('stays, greyed with the reason, when no show can take an entry', () => {
    const action = addEntry({ ...secretary, entryShows: [] });

    expect(action).toMatchObject({ disabledReason: ADD_ENTRY_NO_SHOW_REASON });
    expect(action?.href).toBeUndefined();
    expect(action?.command).toBeUndefined();
  });

  it("inside a show the viewer manages, leaves Add entry to that show's own item", () => {
    const actions = resolveActions(IN_SHOW, {
      ...secretary,
      canManageShow: true,
      canOperateShow: true,
      entryShows: [
        { id: 'a', name: 'Spring Trial' },
        { id: SHOW_ID, name: 'This Show' },
      ],
    });

    expect(actions.find(action => action.id === 'create-entry')).toBeUndefined();
    expect(actions.find(action => action.id === 'show-add-mail-in-entry')).toMatchObject({
      href: `/secretary/register/${SHOW_ID}`,
    });
  });

  it('is offered on a show the viewer does not manage, as on any other page', () => {
    const action = addEntry(
      { ...secretary, entryShows: [{ id: 'a', name: 'Spring Trial' }] },
      IN_SHOW
    );

    expect(action).toMatchObject({ href: '/secretary/register/a' });
  });

  it("is withheld on a show route until the show's scope resolves, never shown then withdrawn", () => {
    const action = addEntry(
      { ...secretary, showScopeResolving: true, entryShows: [{ id: 'a', name: 'Spring Trial' }] },
      IN_SHOW
    );

    expect(action).toBeUndefined();
  });

  it('is absent for a viewer the register route would refuse', () => {
    expect(addEntry({ ...secretary, canAddEntries: false })).toBeUndefined();
  });

  it('sits right after Add Show', () => {
    const ids = resolveActions(GLOBAL, { ...secretary, entryShows: [] })
      .filter(action => action.group === 'create')
      .map(action => action.id);

    expect(ids).toEqual([
      'create-show',
      'create-entry',
      'create-dog',
      'create-person',
      'create-club',
    ]);
  });
});
