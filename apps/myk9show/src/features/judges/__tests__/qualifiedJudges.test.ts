/**
 * The judge-eligibility rule, extracted because two surfaces had drifted.
 *
 * `ShowEditForm`'s Judges tab required an active qualification FOR THE SHOW'S
 * ORGANIZATION. `ClassManagementPage` required only that a qualification be active, with
 * no organization test at all — so an AKC show's per-class dropdown offered UKC- and
 * ASCA-only judges. That is not cosmetic: `showMappers` derives `show.assignedJudges`
 * from every `judge_assignments` row, so assigning a judge to a class is what puts them
 * on the show and onto its registry paperwork.
 */
import { describe, expect, it } from 'vitest';
import {
  isQualifiedForOrganization,
  judgeDisplayName,
  selectQualifiedJudges,
} from '../qualifiedJudges';

const akcJudge = {
  id: 'j-akc',
  firstName: 'Pat',
  lastName: 'Lee',
  judgeQualifications: [{ status: 'Active', organization: 'AKC' }],
};

const ukcJudge = {
  id: 'j-ukc',
  firstName: 'Sam',
  lastName: 'Alvarez',
  judgeQualifications: [{ status: 'Active', organization: 'UKC' }],
};

const lapsedAkcJudge = {
  id: 'j-lapsed',
  firstName: 'Chris',
  lastName: 'Doyle',
  judgeQualifications: [{ status: 'Expired', organization: 'AKC' }],
};

const dualJudge = {
  id: 'j-dual',
  firstName: 'Robin',
  lastName: 'Ng',
  judgeQualifications: [
    { status: 'Expired', organization: 'AKC' },
    { status: 'Active', organization: 'UKC' },
  ],
};

describe('isQualifiedForOrganization', () => {
  it('accepts an active qualification for the organization', () => {
    expect(isQualifiedForOrganization(akcJudge, 'AKC')).toBe(true);
  });

  it('rejects a judge qualified for a DIFFERENT registry', () => {
    // The regression: Manage Classes offered this person on an AKC show.
    expect(isQualifiedForOrganization(ukcJudge, 'AKC')).toBe(false);
  });

  it('rejects a lapsed qualification for the right organization', () => {
    expect(isQualifiedForOrganization(lapsedAkcJudge, 'AKC')).toBe(false);
  });

  it('requires status and organization to match on the SAME qualification', () => {
    // Robin has an AKC qualification and an Active one -- but not an Active AKC one.
    // Testing the two conditions separately would pass this judge.
    expect(isQualifiedForOrganization(dualJudge, 'AKC')).toBe(false);
    expect(isQualifiedForOrganization(dualJudge, 'UKC')).toBe(true);
  });

  it('rejects everyone when the organization is unknown', () => {
    // Falling back to "everyone" is the permissive reading this module exists to remove.
    expect(isQualifiedForOrganization(akcJudge, undefined)).toBe(false);
    expect(isQualifiedForOrganization(akcJudge, null)).toBe(false);
    expect(isQualifiedForOrganization(akcJudge, '')).toBe(false);
  });

  it('rejects a person with no qualifications at all', () => {
    expect(isQualifiedForOrganization({ id: 'x' }, 'AKC')).toBe(false);
  });
});

describe('selectQualifiedJudges', () => {
  const all = [ukcJudge, akcJudge, lapsedAkcJudge, dualJudge];

  it('returns only the judges eligible for that organization', () => {
    expect(selectQualifiedJudges(all, 'AKC').map(j => j.id)).toEqual(['j-akc']);
    expect(selectQualifiedJudges(all, 'UKC').map(j => j.id)).toEqual(['j-dual', 'j-ukc']);
  });

  it('sorts by display name', () => {
    expect(selectQualifiedJudges(all, 'UKC').map(j => j.name)).toEqual(['Robin Ng', 'Sam Alvarez']);
  });

  it('returns nothing when the organization is unknown', () => {
    expect(selectQualifiedJudges(all, undefined)).toEqual([]);
  });

  it('tolerates a missing judge list', () => {
    expect(selectQualifiedJudges(undefined, 'AKC')).toEqual([]);
    expect(selectQualifiedJudges(null, 'AKC')).toEqual([]);
  });
});

describe('judgeDisplayName', () => {
  it('joins the parts it has', () => {
    expect(judgeDisplayName(akcJudge)).toBe('Pat Lee');
    expect(judgeDisplayName({ id: 'x', firstName: 'Solo' })).toBe('Solo');
  });

  it('never renders an empty label', () => {
    // An empty string in a Select renders as a blank row the user cannot identify.
    expect(judgeDisplayName({ id: 'x' })).toBe('Unknown Judge');
    expect(judgeDisplayName({ id: 'x', firstName: null, lastName: null })).toBe('Unknown Judge');
  });
});
