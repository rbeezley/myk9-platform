import { describe, expect, it } from 'vitest';
import type { User as UserType } from '@/types/user-types';
import { UserRole } from '@/types/auth-types';
import {
  formDataToUser,
  isJudgePerson,
  userFormSchema,
  userToFormData,
} from './UserEditPanel.helpers';

const formData = userToFormData({
  id: 'person-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  status: 'suspended',
  roles: [],
});

describe('UserEditPanel account lifecycle boundary', () => {
  it('does not carry account status through profile form saves', () => {
    expect(formData).not.toHaveProperty('status');
    expect(formDataToUser(formData)).not.toHaveProperty('status');
  });
});

/**
 * MYK9-570 / MYK9-664. The secretary's person editor SETS a handler's date of
 * birth and junior handler numbers but never reads them back: the form always
 * starts blank, and only what was typed is sent, as a merge patch.
 */
describe('junior handler fields are write-only', () => {
  const user: Partial<UserType> = {
    id: 'person-1',
    firstName: 'Mariana',
    lastName: 'Rivera',
    email: 'mariana@example.com',
    roles: [],
    // Even when a caller hands the panel stored values, they are not shown.
    dateOfBirth: '2011-03-04',
    juniorHandlerNumbers: { AKC: '7654321', UKC: 'UKC-42' },
  };

  it('starts blank whatever the source carried', () => {
    const form = userToFormData(user);
    expect(form.dateOfBirth).toBe('');
    expect(form.juniorHandlerNumbers).toEqual({});
  });

  it('starts blank from a raw snake_case row too', () => {
    const form = userToFormData({
      id: 'person-2',
      date_of_birth: '2012-01-02',
      junior_handler_numbers: { AKC: '111' },
    } as unknown as Parameters<typeof userToFormData>[0]);
    expect(form.dateOfBirth).toBe('');
    expect(form.juniorHandlerNumbers).toEqual({});
  });

  it('an untouched form sends neither field, so it cannot clear what is stored', () => {
    const back = formDataToUser(userToFormData(user));
    expect('dateOfBirth' in back).toBe(false);
    expect('juniorHandlerNumbers' in back).toBe(false);
  });

  it('sends what was typed, trimmed, and only the registries that were filled', () => {
    const back = formDataToUser({
      ...userToFormData(user),
      dateOfBirth: '2011-03-04',
      juniorHandlerNumbers: { AKC: ' 7654321 ', UKC: '   ' },
    });
    expect(back.dateOfBirth).toBe('2011-03-04');
    // UKC is blank, so it is absent from the patch: the stored UKC number stays.
    expect(back.juniorHandlerNumbers).toEqual({ AKC: '7654321' });
  });

  it('rejects a future date of birth and accepts a blank one', () => {
    const base = userToFormData(user);
    expect(userFormSchema.safeParse({ ...base, dateOfBirth: '2999-01-01' }).success).toBe(false);
    expect(userFormSchema.safeParse({ ...base, dateOfBirth: '' }).success).toBe(true);
    expect(userFormSchema.safeParse({ ...base, dateOfBirth: '04/03/2011' }).success).toBe(false);
  });
});

/** MYK9-2292 (ASCA §1.5.7): a judge's affiliation, typed on the person editor. */
describe('judge affiliation', () => {
  const judge: Partial<UserType> = {
    id: 'person-2',
    firstName: 'Jane',
    lastName: 'Smith',
    roles: [UserRole.JUDGE],
    judgeAffiliation: 'ASCA-approved judge, Region 4',
  };

  it('seeds the form from the person and sends it back trimmed for a judge', () => {
    const form = userToFormData(judge);
    expect(form.judgeAffiliation).toBe('ASCA-approved judge, Region 4');
    expect(formDataToUser({ ...form, judgeAffiliation: '  Region 5  ' })).toMatchObject({
      judgeAffiliation: 'Region 5',
    });
  });

  it('is never sent for a person who is not a judge', () => {
    const form = userToFormData({ ...judge, roles: [] });
    expect('judgeAffiliation' in formDataToUser(form)).toBe(false);
  });

  it('leaves the stored affiliation alone when the field was not touched', () => {
    // The admin roster never loads the affiliation, so the panel opens with '' for a judge
    // who has one stored: a phone-only edit must not send a blank (it would clear the value).
    const opened = userToFormData({ ...judge, judgeAffiliation: undefined });
    const saved = formDataToUser({ ...opened, phone: '555-0100' }, opened);
    expect(saved).toMatchObject({ phone: '555-0100' });
    expect('judgeAffiliation' in saved).toBe(false);
  });

  it('leaves a loaded affiliation alone when only another field changed', () => {
    const opened = userToFormData(judge);
    expect('judgeAffiliation' in formDataToUser({ ...opened, phone: '555-0100' }, opened)).toBe(
      false
    );
  });

  it('sends the affiliation once it was typed, and a clear of a loaded one', () => {
    const blank = userToFormData({ ...judge, judgeAffiliation: undefined });
    expect(formDataToUser({ ...blank, judgeAffiliation: ' Region 5 ' }, blank)).toMatchObject({
      judgeAffiliation: 'Region 5',
    });
    const loaded = userToFormData(judge);
    expect(formDataToUser({ ...loaded, judgeAffiliation: '' }, loaded)).toMatchObject({
      judgeAffiliation: '',
    });
  });

  describe('who counts as a judge', () => {
    const qualification = {
      organization: 'ASCA',
      level: 'General',
      disciplines: [],
      dateObtained: null,
      expirationDate: null,
      judgeNumber: '123',
      showTypes: [],
      certificationDate: '2026-01-01',
      status: 'Active',
    } as unknown as NonNullable<UserType['judgeQualifications']>[number];

    it('counts a judge qualification without a judge role (the show wizard new judge)', () => {
      const wizardJudge: Partial<UserType> = {
        id: 'person-3',
        firstName: 'Wiz',
        lastName: 'Judge',
        roles: [],
        judgeQualifications: [qualification],
      };
      expect(isJudgePerson(userToFormData(wizardJudge))).toBe(true);
      const opened = userToFormData(wizardJudge);
      expect(formDataToUser({ ...opened, judgeAffiliation: 'Region 2' }, opened)).toMatchObject({
        judgeAffiliation: 'Region 2',
      });
    });

    it('does not count a person with neither', () => {
      expect(isJudgePerson(userToFormData({ ...judge, roles: [] }))).toBe(false);
    });
  });

  it('refuses an affiliation over 200 characters', () => {
    const result = userFormSchema.safeParse({
      ...userToFormData(judge),
      judgeAffiliation: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});
