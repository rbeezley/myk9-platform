import { describe, it, expect } from 'vitest';
import { resolveExamplePath } from '../utils/resolveExamplePath';
import type { ExampleIds } from '../types';

const fullIds: ExampleIds = {
  showId: 'SHOW_1',
  trialId: 'TRIAL_1',
  trialShowId: 'SHOW_1',
  classId: 'CLASS_1',
  classTrialId: 'TRIAL_1',
  classShowId: 'SHOW_1',
  dogId: 'DOG_1',
  clubId: 'CLUB_1',
  roleId: 'ROLE_1',
  templateId: 'TEMPLATE_1',
  personId: 'PERSON_1',
  entryId: 'ENTRY_1',
  registrationId: 'REG_1',
  userId: 'USER_1',
};

describe('resolveExamplePath', () => {
  it('returns non-parameterized paths unchanged', () => {
    expect(resolveExamplePath('/admin/dashboard', fullIds)).toBe('/admin/dashboard');
    expect(resolveExamplePath('/shows', fullIds)).toBe('/shows');
  });

  it('resolves single-param patterns using the id map', () => {
    expect(resolveExamplePath('/shows/:id', fullIds)).toBe('/shows/SHOW_1');
    expect(resolveExamplePath('/dogs/:id', fullIds)).toBe('/dogs/DOG_1');
    expect(resolveExamplePath('/clubs/:id', fullIds)).toBe('/clubs/CLUB_1');
  });

  it('resolves multi-param chains with consistent parent ids', () => {
    expect(resolveExamplePath('/shows/:showId/trials/:trialId', fullIds)).toBe(
      '/shows/SHOW_1/trials/TRIAL_1'
    );
    expect(resolveExamplePath('/shows/:showId/trials/:trialId/classes/:classId', fullIds)).toBe(
      '/shows/SHOW_1/trials/TRIAL_1/classes/CLASS_1'
    );
  });

  it('resolves class results sub-route with the same chain', () => {
    expect(
      resolveExamplePath('/shows/:showId/trials/:trialId/classes/:classId/results', fullIds)
    ).toBe('/shows/SHOW_1/trials/TRIAL_1/classes/CLASS_1/results');
  });

  it('resolves admin parameterized routes', () => {
    expect(resolveExamplePath('/admin/permissions/roles/:roleId', fullIds)).toBe(
      '/admin/permissions/roles/ROLE_1'
    );
    expect(resolveExamplePath('/admin/permissions/roles/:roleId/clone', fullIds)).toBe(
      '/admin/permissions/roles/ROLE_1/clone'
    );
    expect(resolveExamplePath('/admin/templates/:templateId/edit', fullIds)).toBe(
      '/admin/templates/TEMPLATE_1/edit'
    );
    expect(resolveExamplePath('/admin/templates/:templateId/test', fullIds)).toBe(
      '/admin/templates/TEMPLATE_1/test'
    );
  });

  it('resolves exhibitor check-in and tv display patterns', () => {
    expect(resolveExamplePath('/exhibitor/check-in/:entryId', fullIds)).toBe(
      '/exhibitor/check-in/ENTRY_1'
    );
    expect(resolveExamplePath('/tv/:showId', fullIds)).toBe('/tv/SHOW_1');
    expect(resolveExamplePath('/shows/:showId/register', fullIds)).toBe('/shows/SHOW_1/register');
  });

  it('returns null when any required id is missing', () => {
    const partial: ExampleIds = { showId: 'SHOW_1' };
    expect(resolveExamplePath('/dogs/:id', partial)).toBeNull();
    expect(resolveExamplePath('/shows/:showId/trials/:trialId', partial)).toBeNull();
  });

  it('returns null for an unknown parameterized pattern', () => {
    expect(resolveExamplePath('/totally/:unknown/route', fullIds)).toBeNull();
  });
});
