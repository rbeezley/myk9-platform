/**
 * MYK9-570. Two review rounds found the same six lines wrong in two different
 * ways, the second caused by the first fix, so handler identity is now decided
 * once. These are the cases that rule has to get right — and the two it is
 * knowingly allowed to get wrong.
 */
import { describe, it, expect } from 'vitest';
import {
  handlerNameMatchesPerson,
  normalizeHandlerName,
  resolveHandlerPerson,
} from '../handlerIdentity';

const KID = { id: 'person-kid', first_name: 'Chris', last_name: 'Kid' };
const OWNER = { id: 'person-sarah', first_name: 'Sarah', last_name: 'Owner' };

describe('resolveHandlerPerson', () => {
  it('takes the handler_id person when their name is the one printed', () => {
    expect(
      resolveHandlerPerson({
        printedHandlerName: 'Chris Kid',
        handlerIdPerson: KID,
        ownerPerson: OWNER,
      })
    ).toBe(KID);
  });

  it('falls back to the OWNER when the printed name is theirs', () => {
    // Round 2's P1, and 1276 of 1281 live entries: the owner handles their own
    // dog, so the entry-form fetch never identifies a separate "handler entry"
    // and `handlerIdPerson` arrives null.
    expect(
      resolveHandlerPerson({
        printedHandlerName: 'Sarah Owner',
        handlerIdPerson: null,
        ownerPerson: OWNER,
      })
    ).toBe(OWNER);
  });

  it('prefers the handler_id person over the owner when both names match', () => {
    const twin = { id: 'person-twin', first_name: 'Sarah', last_name: 'Owner' };
    expect(
      resolveHandlerPerson({
        printedHandlerName: 'Sarah Owner',
        handlerIdPerson: twin,
        ownerPerson: OWNER,
      })
    ).toBe(twin);
  });

  it('returns null when neither candidate bears the printed name', () => {
    // Round 1's P1: a rename leaves handler_id pointing at the previous person.
    expect(
      resolveHandlerPerson({
        printedHandlerName: 'Grandma Smith',
        handlerIdPerson: KID,
        ownerPerson: OWNER,
      })
    ).toBeNull();
  });

  it('returns null for a blank or missing printed name, whoever is offered', () => {
    for (const printedHandlerName of [null, undefined, '', '   ']) {
      expect(
        resolveHandlerPerson({ printedHandlerName, handlerIdPerson: KID, ownerPerson: OWNER })
      ).toBeNull();
    }
  });

  it('returns null when there are no candidates at all', () => {
    expect(
      resolveHandlerPerson({
        printedHandlerName: 'Chris Kid',
        handlerIdPerson: null,
        ownerPerson: null,
      })
    ).toBeNull();
  });
});

describe('handlerNameMatchesPerson', () => {
  it('matches First Last, ignoring case, punctuation and repeated spaces', () => {
    for (const printed of ['Chris Kid', 'chris  kid', 'CHRIS KID', ' Chris Kid ']) {
      expect(handlerNameMatchesPerson(printed, KID), printed).toBe(true);
    }
  });

  it('matches a hyphenated or apostrophised surname typed either way', () => {
    const person = { first_name: 'Sarah', last_name: "O'Brien-Smith" };
    expect(handlerNameMatchesPerson("Sarah O'Brien-Smith", person)).toBe(true);
    expect(handlerNameMatchesPerson('Sarah O Brien Smith', person)).toBe(true);
  });

  it('matches "Last, First" only when a comma was actually typed', () => {
    expect(handlerNameMatchesPerson('Kid, Chris', KID)).toBe(true);
    expect(handlerNameMatchesPerson('Kid Chris', KID)).toBe(false);
  });

  it('reads a comma POSITIONALLY: "Morgan, Riley" is Riley Morgan and nobody else', () => {
    // Round 3: treating the comma as a boolean admitted the reversed reading in
    // ADDITION to the forward one, and normalisation had already flattened the
    // comma to a space — so "Morgan, Riley" (meaning the handler Riley Morgan)
    // also matched a different person actually named Morgan Riley, and printed
    // their date of birth and AKC number on paperwork naming Riley Morgan.
    const rileyMorgan = { first_name: 'Riley', last_name: 'Morgan' };
    const morganRiley = { first_name: 'Morgan', last_name: 'Riley' };

    expect(handlerNameMatchesPerson('Morgan, Riley', rileyMorgan)).toBe(true);
    expect(handlerNameMatchesPerson('Morgan, Riley', morganRiley)).toBe(false);
  });

  it('a trailing comma is a typo, not a reversal', () => {
    expect(
      handlerNameMatchesPerson('Riley Morgan,', { first_name: 'Riley', last_name: 'Morgan' })
    ).toBe(true);
    expect(
      handlerNameMatchesPerson('Riley Morgan,', { first_name: 'Morgan', last_name: 'Riley' })
    ).toBe(false);
  });

  it('does NOT match a swapped-name pair — the round-2 false positive', () => {
    // Printed "Riley Morgan"; a stale handler_id points at a person whose first
    // name is Morgan and last name is Riley. Accepting a bare reversed reading
    // marked the wrong person as a junior.
    const swapped = { first_name: 'Morgan', last_name: 'Riley' };
    expect(handlerNameMatchesPerson('Riley Morgan', swapped)).toBe(false);
    // And the person who really is Riley Morgan still matches.
    expect(
      handlerNameMatchesPerson('Riley Morgan', { first_name: 'Riley', last_name: 'Morgan' })
    ).toBe(true);
  });

  it('accepts a DIFFERENT person who happens to share the name — the known limit', () => {
    // A name is the only evidence that the FK and the printed text mean the same
    // person, so this is the accepted residual of the whole approach. Closing it
    // needs a person picker instead of free text, which is a product change.
    const sameNameDifferentPerson = { id: 'someone-else', first_name: 'Chris', last_name: 'Kid' };
    expect(handlerNameMatchesPerson('Chris Kid', sameNameDifferentPerson)).toBe(true);
  });

  it.each([
    ['a middle initial', 'Chris J. Kid'],
    ['a nickname', 'Topher Kid'],
    ['a generational suffix', 'Chris Kid Jr'],
    ['an unfolded accent', 'Chris Kíd'],
    ['a first name alone', 'Chris'],
  ])('loses the mark rather than guessing: %s', (_label, printed) => {
    expect(handlerNameMatchesPerson(printed, KID)).toBe(false);
  });

  it('refuses a person missing either name part', () => {
    expect(handlerNameMatchesPerson('Chris Kid', { first_name: 'Chris', last_name: null })).toBe(
      false
    );
    expect(handlerNameMatchesPerson('Chris', { first_name: null, last_name: 'Kid' })).toBe(false);
    expect(handlerNameMatchesPerson('Chris Kid', null)).toBe(false);
  });
});

describe('normalizeHandlerName', () => {
  it('folds case, punctuation and whitespace but not accents', () => {
    expect(normalizeHandlerName("  O'Brien-Smith,  Sarah ")).toBe('o brien smith sarah');
    expect(normalizeHandlerName('José')).toBe('josé');
    expect(normalizeHandlerName(null)).toBe('');
  });
});
