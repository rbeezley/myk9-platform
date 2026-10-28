import { describe, expect, it } from 'vitest';
import { judgeFieldsAfterPick } from './classJudgePick';

const old = {
  judgeId: 'judge-old',
  judgeName: 'Old Judge',
  judgeFirstName: 'Old',
  judgeLastName: 'Judge',
};

describe('judgeFieldsAfterPick (MYK9-1327)', () => {
  it('puts the picked judge and its name on the row', () => {
    expect(
      judgeFieldsAfterPick(old, {
        personId: 'judge-1',
        name: 'Jane Judge',
        firstName: 'Jane',
        lastName: 'Judge',
      })
    ).toEqual({
      judgeId: 'judge-1',
      judgeName: 'Jane Judge',
      judgeFirstName: 'Jane',
      judgeLastName: 'Judge',
      judgeResolved: true,
    });
  });

  it("never leaves the previous judge's name beside a new judge when no name is given", () => {
    const fields = judgeFieldsAfterPick(old, { personId: 'judge-1' });
    expect(fields).toMatchObject({ judgeId: 'judge-1', judgeResolved: true });
    expect(fields.judgeName).toBeUndefined();
    expect(fields.judgeFirstName).toBeUndefined();
    expect(fields.judgeLastName).toBeUndefined();
  });

  it("keeps the row's name when no name is given and the row already names that judge", () => {
    expect(judgeFieldsAfterPick(old, { personId: 'judge-old' })).toMatchObject({
      judgeId: 'judge-old',
      judgeName: 'Old Judge',
      judgeFirstName: 'Old',
      judgeLastName: 'Judge',
    });
  });

  it('clears every judge field on a removal, with explicit undefined so a spread overwrites', () => {
    const fields = judgeFieldsAfterPick(old, null);
    expect(fields).toEqual({
      judgeId: undefined,
      judgeName: undefined,
      judgeFirstName: undefined,
      judgeLastName: undefined,
      judgeResolved: true,
    });
    expect(Object.keys(fields).sort()).toEqual(
      ['judgeFirstName', 'judgeId', 'judgeLastName', 'judgeName', 'judgeResolved'].sort()
    );
  });
});
