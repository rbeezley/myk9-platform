import { describe, expect, it } from 'vitest';
import { getPublishedExperienceHospitalityNotes } from './published-experience';

describe('published confirmation experience', () => {
  it('returns hospitality notes from the published snapshot only when published', () => {
    const show = {
      experience_is_published: true,
      experience_published_content: {
        supplemental: {
          hospitalityNotes: 'Coffee in the morning.',
        },
      },
    };

    expect(getPublishedExperienceHospitalityNotes(show)).toBe('Coffee in the morning.');
    expect(
      getPublishedExperienceHospitalityNotes({
        ...show,
        experience_is_published: false,
      })
    ).toBeNull();
  });
});
