import { describe, expect, it } from 'vitest';
import { showSchemas } from '@/lib/validation';
import { ENTRY_WINDOW_PUBLISHED_MESSAGE } from '@/features/payments/onlineEntryGate';
import { showToFormData } from '../ShowEditPanel.helpers';
import { withPublishedEntryWindow } from '../showEditPublishedWindow';
import type { ShowEditFormData } from '../ShowEditPanel.types';
import type { Show } from '@/types/show-types';
import type { z } from 'zod';

const base = (status: string): Partial<Show> => ({
  id: 'show-1',
  name: 'Fall Trial',
  status: status as Show['status'],
  organization: 'AKC',
  clubId: 'club-1',
  startDate: '2026-11-07',
  endDate: '2026-11-08',
  location: 'Expo Hall',
  entryOpenDate: '2026-10-01',
  entryCloseDate: '2026-10-24',
  preEntryFee: '30',
  dayOfShowFee: '35',
});

const schemaFor = (status: string) =>
  withPublishedEntryWindow(
    showSchemas.edit as unknown as z.ZodSchema<ShowEditFormData>,
    status,
    showToFormData(base(status))
  );

const messages = (status: string, patch: Partial<ShowEditFormData>) => {
  const result = schemaFor(status).safeParse({ ...showToFormData(base(status)), ...patch });
  return result.success ? null : result.error.issues.map(i => [i.path[0], i.message]);
};

describe('clearing an entry date on a public show (MYK9-2433)', () => {
  it.each(['entryOpenDate', 'entryCloseDate'] as const)(
    'a published show refuses a cleared %s with the server wording',
    field => {
      expect(messages('published', { [field]: '' })).toContainEqual([
        field,
        ENTRY_WINDOW_PUBLISHED_MESSAGE,
      ]);
    }
  );

  it('a draft show still clears the date', () => {
    expect(messages('draft', { entryCloseDate: '' })).toBeNull();
  });

  it('an unchanged published show validates', () => {
    expect(messages('published', {})).toBeNull();
  });
});
