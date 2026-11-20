import { describe, expect, it } from 'vitest';
import { otherPeopleOnEntry, type EntryPeopleIds } from '../resultsPublicBlockers';

const base: EntryPeopleIds = {
  viewerPersonId: 'me',
  ownerId: 'me',
  coOwnerId: null,
  handlerId: null,
  handlerName: null,
};

describe('otherPeopleOnEntry (MYK9-2311)', () => {
  it('nobody else by id: none', () => {
    expect(otherPeopleOnEntry(base)).toEqual({ kind: 'none' });
  });

  it('viewer is the co-owner of a dog with a different owner: someone else, unnamed', () => {
    expect(otherPeopleOnEntry({ ...base, ownerId: 'owner', coOwnerId: 'me' })).toEqual({
      kind: 'unnamed',
    });
  });

  it('viewer is the handler of a dog with a different owner: unnamed', () => {
    expect(
      otherPeopleOnEntry({ ...base, ownerId: 'owner', handlerId: 'me', handlerName: 'Me Self' })
    ).toEqual({ kind: 'unnamed' });
  });

  it('viewer id missing: unknown', () => {
    expect(otherPeopleOnEntry({ ...base, viewerPersonId: undefined })).toEqual({ kind: 'unknown' });
    expect(otherPeopleOnEntry({ ...base, viewerPersonId: null })).toEqual({ kind: 'unknown' });
  });

  it('co-owner not carried (undefined) is unknown; no co-owner (null) is not', () => {
    expect(otherPeopleOnEntry({ ...base, coOwnerId: undefined })).toEqual({ kind: 'unknown' });
    expect(otherPeopleOnEntry({ ...base, coOwnerId: null })).toEqual({ kind: 'none' });
  });

  it('owner not carried (undefined): unknown', () => {
    expect(otherPeopleOnEntry({ ...base, ownerId: undefined })).toEqual({ kind: 'unknown' });
  });

  it('a linked handler with an empty name: unnamed', () => {
    expect(otherPeopleOnEntry({ ...base, handlerId: 'pat', handlerName: '  ' })).toEqual({
      kind: 'unnamed',
    });
    expect(otherPeopleOnEntry({ ...base, handlerId: 'pat', handlerName: undefined })).toEqual({
      kind: 'unnamed',
    });
  });

  it('a linked handler with a name: named', () => {
    expect(otherPeopleOnEntry({ ...base, handlerId: 'pat', handlerName: ' Pat Handler ' })).toEqual(
      {
        kind: 'named',
        name: 'Pat Handler',
      }
    );
  });

  it('handler id not carried by the row (undefined): unknown, never "no handler"', () => {
    expect(otherPeopleOnEntry({ ...base, handlerId: undefined, handlerName: 'Pat' })).toEqual({
      kind: 'unknown',
    });
  });

  it('a typed-in handler (null id) never blocks and is never named', () => {
    expect(otherPeopleOnEntry({ ...base, handlerId: null, handlerName: 'Casey' })).toEqual({
      kind: 'none',
    });
  });

  it('the handler is also the owner (someone else): named', () => {
    expect(
      otherPeopleOnEntry({ ...base, ownerId: 'pat', handlerId: 'pat', handlerName: 'Pat Handler' })
    ).toEqual({ kind: 'named', name: 'Pat Handler' });
  });
});
