import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  diffPremiumContent,
  fetchPremiumContentDraft,
  isNetworkFailure,
  overlayPremiumContent,
  persistPremiumDraftOnSave,
} from '../premiumContentDraft';
import { generatedPremium } from './fixtures/generatedPremium';

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  readError: null as unknown,
  upsert: vi.fn(),
  published: null as unknown,
  publishedError: null as unknown,
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: db.row, error: db.readError, table }),
        }),
      }),
      upsert: async (values: unknown, options: unknown) => {
        db.upsert(table, values, options);
        return { error: null };
      },
    }),
  },
}));
vi.mock('@/features/experience/usePublishedExperienceContent', () => ({
  fetchPublishedExperienceContent: async () => {
    if (db.publishedError) throw db.publishedError;
    return db.published;
  },
}));

const base = generatedPremium();
const edited = {
  ...base,
  narratives: { ...base.narratives, showHours: 'Doors open at 7' },
};

beforeEach(() => {
  db.row = null;
  db.readError = null;
  db.published = { narratives: base.narratives, supplemental: base.supplemental };
  db.publishedError = null;
  db.upsert.mockReset();
});

describe('premium draft persistence (MYK9-2201)', () => {
  it('stores only the changed fields, in the managers-only drafts table', async () => {
    const result = await persistPremiumDraftOnSave('show-1', edited);

    expect(result).toBe('saved');
    expect(db.upsert).toHaveBeenCalledWith(
      'show_premium_drafts',
      { show_id: 'show-1', content: { narratives: { showHours: 'Doors open at 7' } } },
      { onConflict: 'show_id' }
    );
  });

  it('writes nothing when nothing differs from the published snapshot', async () => {
    expect(await persistPremiumDraftOnSave('show-1', base)).toBe('unchanged');
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it('writes nothing when the published content cannot be read', async () => {
    db.publishedError = new Error('boom');

    expect(await persistPremiumDraftOnSave('show-1', edited)).toBe('unsaved');
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it('writes nothing when the saved draft cannot be read', async () => {
    db.readError = new Error('boom');

    expect(await persistPremiumDraftOnSave('show-1', edited)).toBe('unsaved');
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it('re-saving an identical draft writes nothing, whatever the jsonb key order', async () => {
    db.row = {
      content: { narratives: { showHours: 'Doors open at 7' } },
      saved_at: '2026-11-19T10:00:00Z',
    };

    expect(await persistPremiumDraftOnSave('show-1', edited)).toBe('unchanged');
  });

  it('empties an existing draft when the secretary reverts to the published text', async () => {
    db.row = {
      content: { narratives: { showHours: 'Doors open at 7' } },
      saved_at: '2026-11-19T10:00:00Z',
    };

    expect(await persistPremiumDraftOnSave('show-1', base)).toBe('saved');
    expect(db.upsert).toHaveBeenCalledWith(
      'show_premium_drafts',
      { show_id: 'show-1', content: {} },
      { onConflict: 'show_id' }
    );
  });

  it('reads a saved draft back with its server time, and a failed read as an error', async () => {
    db.row = { content: { narratives: { showHours: 'x' } }, saved_at: '2026-11-19T10:00:00Z' };
    expect(await fetchPremiumContentDraft('show-1')).toEqual({
      content: { narratives: { showHours: 'x' } },
      savedAt: '2026-11-19T10:00:00Z',
    });
    db.row = null;
    expect(await fetchPremiumContentDraft('show-1')).toBeNull();
    db.readError = new Error('boom');
    await expect(fetchPremiumContentDraft('show-1')).rejects.toThrow('boom');
  });
});

describe('premium draft content', () => {
  it('never stores a null or inline cover, and stores a real new one', () => {
    const withCover = (coverImageUrl: string | null) => ({
      ...base,
      supplemental: { ...base.supplemental, coverImageUrl },
    });
    const publishedWithCover = {
      narratives: base.narratives,
      supplemental: { ...base.supplemental, coverImageUrl: 'https://cdn.test/old.png' },
    };

    expect(diffPremiumContent(withCover(null), publishedWithCover)).toEqual({});
    expect(diffPremiumContent(withCover('data:image/png;base64,AAAA'), publishedWithCover)).toEqual(
      {}
    );
    expect(diffPremiumContent(withCover('https://cdn.test/new.png'), publishedWithCover)).toEqual({
      supplemental: { coverImageUrl: 'https://cdn.test/new.png' },
    });
  });

  it('overlays only the changed fields and leaves the rest of the premium alone', () => {
    const generated = {
      ...base,
      narratives: { showHours: 'Template hours', trialInformation: 'Template trial info' },
      supplemental: { ...base.supplemental, coverImageUrl: 'https://cdn.test/cover.png' },
    };

    const result = overlayPremiumContent(generated, {
      narratives: { showHours: 'Edited hours' },
      supplemental: { hospitalityNotes: 'Coffee', coverImageUrl: null },
    });

    expect(result.narratives).toEqual({
      showHours: 'Edited hours',
      trialInformation: 'Template trial info',
    });
    expect(result.supplemental.hospitalityNotes).toBe('Coffee');
    expect(result.supplemental.coverImageUrl).toBe('https://cdn.test/cover.png');
  });

  it('treats an offline browser or a fetch failure as a network failure only', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure(new Error('permission denied'))).toBe(false);
  });
});
