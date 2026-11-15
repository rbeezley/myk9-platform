// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  JUDGE_NOT_SET,
  formatStreetAddress,
  judgeFor,
  judgeNameByClass,
  loadJudgeNamesByClass,
  myShowsUrl,
  type ClassJudgeClient,
  type ClassJudgeRow,
} from './exhibitorEmailFacts';

const repoRoot = resolve(__dirname, '../../../../..');

describe('exhibitorEmailFacts (MYK9-1999)', () => {
  it('is the same file in both function trees', () => {
    const appCopy = readFileSync(
      resolve(repoRoot, 'apps/myk9show/supabase/functions/_shared/exhibitorEmailFacts.ts'),
      'utf8'
    );
    const rootCopy = readFileSync(
      resolve(repoRoot, 'supabase/functions/_shared/exhibitorEmailFacts.ts'),
      'utf8'
    );
    expect(appCopy).toBe(rootCopy);
  });

  it('writes the street address on one line, and is null without a street', () => {
    expect(
      formatStreetAddress({
        venue_name: 'Fairgrounds Hall',
        address: ' 1200 Fairgrounds Rd ',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
      })
    ).toBe('Fairgrounds Hall, 1200 Fairgrounds Rd, Springfield, IL 62701');
    expect(formatStreetAddress({ address: '1 Main St', city: 'Ames' })).toBe('1 Main St, Ames');
    expect(formatStreetAddress({ venue_name: 'Hall', city: 'Ames', state: 'IA' })).toBeNull();
    expect(formatStreetAddress(null)).toBeNull();
  });

  it('names only a confirmed judge per class', () => {
    const rows: ClassJudgeRow[] = [
      {
        class_id: 'c1',
        status: 'confirmed',
        person: { first_name: 'Dana', last_name: 'Whitlock' },
      },
      { class_id: 'c2', status: 'invited', person: { first_name: 'Lee', last_name: 'Okafor' } },
      { class_id: null, status: 'confirmed', person: { first_name: 'No', last_name: 'Class' } },
    ];
    const byClass = judgeNameByClass(rows);
    expect(judgeFor(byClass, 'c1')).toBe('Dana Whitlock');
    expect(judgeFor(byClass, 'c2')).toBe(JUDGE_NOT_SET);
    expect(judgeFor(byClass, null)).toBe(JUDGE_NOT_SET);
  });

  it('reads the judges of the given classes once, and reads nothing for no classes', async () => {
    const calls: string[][] = [];
    const client: ClassJudgeClient = {
      from: () => ({
        select: () => ({
          in: (_column, values) => {
            calls.push(values);
            return Promise.resolve({
              data: [
                {
                  class_id: 'c1',
                  status: 'confirmed',
                  person: { first_name: 'Dana', last_name: 'Whitlock' },
                },
              ],
              error: null,
            });
          },
        }),
      }),
    };
    const byClass = await loadJudgeNamesByClass(client, ['c1', 'c1', null]);
    expect(calls).toEqual([['c1']]);
    expect(byClass.get('c1')).toBe('Dana Whitlock');
    expect((await loadJudgeNamesByClass(client, [])).size).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('degrades to no judges when the read fails, so the email still goes', async () => {
    const client: ClassJudgeClient = {
      from: () => ({
        select: () => ({
          in: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
        }),
      }),
    };
    expect((await loadJudgeNamesByClass(client, ['c1'])).size).toBe(0);
  });

  it('links to My Shows', () => {
    expect(myShowsUrl('https://myk9show.com/')).toBe('https://myk9show.com/exhibitor/entries');
    expect(myShowsUrl(undefined)).toBe('https://myk9show.com/exhibitor/entries');
  });
});
