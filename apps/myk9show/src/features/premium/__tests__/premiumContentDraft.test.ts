import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPremiumContentDraft,
  persistPremiumDraftOnSave,
  premiumContentChanged,
  toPremiumContentDraft,
} from '../premiumContentDraft';
import { generatedPremium } from './fixtures/generatedPremium';

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  readError: null as unknown,
  update: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: db.row, error: db.readError }),
        }),
      }),
      update: (values: unknown) => ({
        eq: async (column: string, value: string) => {
          db.update(values, column, value);
          return { error: null };
        },
      }),
    }),
  },
}));

const base = toPremiumContentDraft(generatedPremium());
const edited = {
  ...base,
  narratives: { ...base.narratives, showHours: 'Doors open at 7' },
};

beforeEach(() => {
  db.row = null;
  db.readError = null;
  db.update.mockReset();
});

describe('premium draft persistence (MYK9-2201)', () => {
  it('writes the edited narratives to the show as its premium draft', async () => {
    const wrote = await persistPremiumDraftOnSave(
      'show-1',
      { ...generatedPremium(), ...edited },
      base
    );

    expect(wrote).toBe(true);
    expect(db.update).toHaveBeenCalledWith({ premium_content_draft: edited }, 'id', 'show-1');
  });

  it('reads a saved draft back, with the server time it was saved', async () => {
    db.row = { premium_content_draft: edited, premium_content_draft_at: '2026-11-19T10:00:00Z' };

    expect(await fetchPremiumContentDraft('show-1')).toEqual({
      content: edited,
      savedAt: '2026-11-19T10:00:00Z',
    });
  });

  it('reads no draft as null and a failed read as an error', async () => {
    expect(await fetchPremiumContentDraft('show-1')).toBeNull();
    db.readError = new Error('boom');
    await expect(fetchPremiumContentDraft('show-1')).rejects.toThrow('boom');
  });

  it('writes nothing when the content matches the published snapshot', async () => {
    const wrote = await persistPremiumDraftOnSave('show-1', generatedPremium(), base);

    expect(wrote).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('compares against the saved draft first: re-saving it unchanged writes nothing', async () => {
    db.row = { premium_content_draft: edited, premium_content_draft_at: '2026-11-19T10:00:00Z' };

    const wrote = await persistPremiumDraftOnSave(
      'show-1',
      { ...generatedPremium(), ...edited },
      base
    );

    expect(wrote).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('saves when the saved draft cannot be read, since "unchanged" is unproven', async () => {
    db.readError = new Error('offline');

    const wrote = await persistPremiumDraftOnSave(
      'show-1',
      { ...generatedPremium(), ...edited },
      edited
    );

    expect(wrote).toBe(true);
  });

  it("never stores the editor's inline cover copy; the last stored cover URL stays", async () => {
    const withCover = {
      ...base,
      supplemental: { ...base.supplemental, coverImageUrl: 'https://cdn.test/cover.png' },
    };
    const inline = {
      ...generatedPremium(),
      ...withCover,
      supplemental: { ...withCover.supplemental, coverImageUrl: 'data:image/png;base64,AAAA' },
    };

    const wrote = await persistPremiumDraftOnSave('show-1', inline, withCover);

    expect(wrote).toBe(false);
  });

  it('ignores jsonb key order when comparing', () => {
    const reordered = {
      supplemental: base.supplemental,
      narratives: {
        trialInformation: base.narratives.trialInformation,
        showHours: base.narratives.showHours,
      },
    };
    expect(premiumContentChanged(reordered, base)).toBe(false);
  });
});
