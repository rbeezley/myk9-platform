/**
 * These cover the write guard, not a rendering nicety.
 *
 * In edit mode the wizard saves with `updateShow(showId, <full record>)`, and
 * the wizard store persists `show`/`trials` across sessions. If the target show
 * is unresolved and the wizard renders anyway, the PREVIOUS session's draft is
 * what gets written over a real show.
 */
import { describe, it, expect } from 'vitest';
import type { Show } from '@/types/show-types';
import { resolveEditMode, parseEditMode } from '../editModeResolution';

const show = { id: 'show-1', name: 'Spring Trial' } as Show;

describe('resolveEditMode', () => {
  it('is not-applicable for a fresh create', () => {
    expect(
      resolveEditMode({ editMode: undefined, writableShows: [], showsLoading: false })
    ).toEqual({ state: 'not-applicable' });
  });

  it('resolves once the target show is present', () => {
    expect(
      resolveEditMode({
        editMode: { showId: 'show-1', mode: 'add-trials' },
        writableShows: [show],
        showsLoading: false,
      })
    ).toEqual({ state: 'resolved', show });
  });

  it('reports loading rather than guessing while the read is in flight', () => {
    expect(
      resolveEditMode({
        editMode: { showId: 'show-1', mode: 'add-trials' },
        writableShows: [],
        showsLoading: true,
      })
    ).toEqual({ state: 'loading' });
  });

  it('reports unavailable — NOT "missing" — for a settled read without the show', () => {
    // A replicated read reports every failure, including its own timeout, as an
    // empty list (MYK9-252), so `withReplicationFallback` never sees a throw and
    // the query RESOLVES empty. A settled-but-absent show is therefore genuinely
    // ambiguous, and must not reach a write either way.
    expect(
      resolveEditMode({
        editMode: { showId: 'show-1', mode: 'add-trials' },
        writableShows: [],
        showsLoading: false,
      })
    ).toEqual({ state: 'unavailable' });
  });

  it('does not resolve to a DIFFERENT show than the one requested', () => {
    expect(
      resolveEditMode({
        editMode: { showId: 'show-2', mode: 'add-classes' },
        writableShows: [show],
        showsLoading: false,
      })
    ).toEqual({ state: 'unavailable' });
  });
});

describe('parseEditMode', () => {
  it.each(['add-trials', 'add-classes'] as const)('accepts the linked mode %s', mode => {
    expect(parseEditMode('show-1', mode)).toEqual({ showId: 'show-1', mode });
  });

  it.each([
    ['edit-show', 'the removed mode nothing ever linked to'],
    ['banana', 'an arbitrary string'],
    ['ADD-TRIALS', 'the right mode in the wrong case'],
  ])('rejects %s (%s)', mode => {
    // Previously `searchParams.get('mode') as EditModeType` accepted ANY string.
    // `edit-show` in particular fell through to "Create Show (Unpublished)" and
    // wrote `status` from the button, unpublishing a live show.
    expect(parseEditMode('show-1', mode)).toBeUndefined();
  });

  it('requires both halves', () => {
    expect(parseEditMode(null, 'add-trials')).toBeUndefined();
    expect(parseEditMode('show-1', null)).toBeUndefined();
  });
});
