/**
 * MYK9-1970: a place in line is shown only as far as the server's claim state allows.
 * Paper reads "7th in the running order" plus the note; stale reads "Order may be out of date";
 * neither is a countdown. Wording lives in formatRunQueueState, once.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Entry } from '../../stores/entryStore';
import {
  applyClaimToDogsAhead,
  buildEntryListOwnership,
  formatDogsAheadInList,
} from './dogsAheadInList';
import { OwnDogQueuePill } from './SortableEntryCardBadges';
import {
  PAPER_CLASS_NOTE,
  applyQueueClaim,
  classScoresOnPaper,
  formatRunQueueState,
  runQueueStateNote,
} from './runQueue';

function entry(id: string, armband: number): Entry {
  return {
    id,
    armband,
    callName: `Dog ${armband}`,
    classId: 'c1',
    isScored: false,
    status: undefined,
  } as unknown as Entry;
}

describe('paper and stale wording', () => {
  it('says the place in the running order, never "Nth up"', () => {
    expect(formatRunQueueState({ kind: 'paper', place: 7 })).toBe('7th in the running order');
    expect(formatRunQueueState({ kind: 'paper', place: 1 })).toBe('1st in the running order');
    expect(formatRunQueueState({ kind: 'paper' })).toBe('In the running order');
  });

  it('says the order may be out of date for a stale claim', () => {
    expect(formatRunQueueState({ kind: 'stale' })).toBe('Order may be out of date');
  });

  it('carries the paper note only for paper', () => {
    expect(runQueueStateNote({ kind: 'paper', place: 3 })).toBe(
      'This class is scored on paper. Listen for your number at the ring.'
    );
    expect(runQueueStateNote({ kind: 'stale' })).toBeNull();
    expect(runQueueStateNote({ kind: 'waiting', place: 3 })).toBeNull();
    expect(runQueueStateNote(null)).toBeNull();
  });
});

describe('classScoresOnPaper', () => {
  it('follows the class flag, else the show switch (the server rule)', () => {
    expect(classScoresOnPaper(true, true)).toBe(true);
    expect(classScoresOnPaper(false, false)).toBe(false);
    expect(classScoresOnPaper(null, false)).toBe(true);
    expect(classScoresOnPaper(undefined, false)).toBe(true);
    expect(classScoresOnPaper(null, true)).toBe(false);
    expect(classScoresOnPaper(null, undefined)).toBe(false);
  });
});

describe('applyQueueClaim', () => {
  it('turns a waiting dog into the claim the server states', () => {
    expect(applyQueueClaim({ kind: 'waiting-unknown' }, { place: 4, claim: 'live' })).toEqual({
      kind: 'waiting',
      place: 4,
    });
    expect(applyQueueClaim({ kind: 'waiting-unknown' }, { place: 4, claim: 'paper' })).toEqual({
      kind: 'paper',
      place: 4,
    });
    expect(applyQueueClaim({ kind: 'waiting-unknown' }, { place: 4, claim: 'stale' })).toEqual({
      kind: 'stale',
    });
  });

  it('keeps a paper class on paper with no answer, and lets a settled live answer win', () => {
    expect(applyQueueClaim({ kind: 'paper' }, undefined)).toEqual({ kind: 'paper' });
    expect(applyQueueClaim({ kind: 'paper' }, { place: 2, claim: 'paper' })).toEqual({
      kind: 'paper',
      place: 2,
    });
    expect(applyQueueClaim({ kind: 'paper' }, { place: 2, claim: 'live' })).toEqual({
      kind: 'waiting',
      place: 2,
    });
  });

  it('never overrides a state the row already decided', () => {
    expect(applyQueueClaim({ kind: 'in-ring' }, { place: 2, claim: 'paper' })).toEqual({
      kind: 'in-ring',
    });
    expect(applyQueueClaim({ kind: 'done' }, { place: 2, claim: 'stale' })).toEqual({
      kind: 'done',
    });
    expect(applyQueueClaim(null, { place: 2, claim: 'live' })).toBeNull();
  });
});

describe('the entry list pill', () => {
  const entries = [entry('e1', 1), entry('e2', 2), entry('e3', 3), entry('e4', 4)];

  it('restates a counted place for a paper class: place, not a countdown', () => {
    const own = new Set(['e1', 'e4']);
    const claims = new Map([
      ['e1', 'paper' as const],
      ['e4', 'paper' as const],
    ]);
    const ownership = buildEntryListOwnership(entries, own, undefined, true, claims);
    expect(ownership?.dogsAheadByEntryId.get('e1')).toEqual({ kind: 'paper', place: 1 });
    expect(ownership?.dogsAheadByEntryId.get('e4')).toEqual({ kind: 'paper', place: 4 });
    expect(formatDogsAheadInList(ownership?.dogsAheadByEntryId.get('e4') ?? null)).toBe(
      '4th in the running order'
    );
  });

  it('drops the number for a stale claim and leaves a live one a countdown', () => {
    expect(applyClaimToDogsAhead({ kind: 'waiting', dogsAhead: 3 }, 'stale')).toEqual({
      kind: 'stale',
    });
    expect(applyClaimToDogsAhead({ kind: 'waiting', dogsAhead: 3 }, 'live')).toEqual({
      kind: 'waiting',
      dogsAhead: 3,
    });
    expect(applyClaimToDogsAhead({ kind: 'in-ring' }, 'paper')).toEqual({ kind: 'in-ring' });
  });

  it('renders the paper place and note, with no "up" or "ahead" wording', () => {
    render(<OwnDogQueuePill dogsAhead={{ kind: 'paper', place: 7 }} />);
    expect(screen.getByTestId('own-dog-queue-pill')).toHaveTextContent('7th in the running order');
    expect(screen.getByTestId('own-dog-queue-note')).toHaveTextContent(PAPER_CLASS_NOTE);
    expect(document.body.textContent).not.toMatch(/\bup\b|ahead|next/i);
  });

  it('renders a stale claim with no note', () => {
    render(<OwnDogQueuePill dogsAhead={{ kind: 'stale' }} />);
    expect(screen.getByTestId('own-dog-queue-pill')).toHaveTextContent('Order may be out of date');
    expect(screen.queryByTestId('own-dog-queue-note')).toBeNull();
  });
});
