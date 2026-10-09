import { describe, expect, it } from 'vitest';

import { diagnoseShowLooseEnds } from '../diagnostics/looseEndsDiagnostics';
import { CONFIG, OTHER_SHOW, SHOW_ID, looseEndsTables, makeCtx } from './looseEndsFixtures';

const GUESS_LABEL = 'GUESS (time-window heuristic, NOT recorded attribution)';

async function run(tables = looseEndsTables()) {
  const ctx = makeCtx(tables);
  const result = await diagnoseShowLooseEnds({ showId: SHOW_ID }, ctx);
  const rows = (labelPart: string) =>
    result.evidence.filter(e => e.label.includes(labelPart)).map(e => String(e.value));
  return { result, rows, ctx };
}

describe('diagnoseShowLooseEnds', () => {
  it('returns not_found for an unknown show', async () => {
    const ctx = makeCtx({ shows: [] });
    expect((await diagnoseShowLooseEnds({ showId: SHOW_ID }, ctx)).state).toBe('not_found');
  });

  it('returns source_unavailable when a table cannot be read', async () => {
    const ctx = makeCtx(looseEndsTables(), { failTable: 'enrollments' });
    const result = await diagnoseShowLooseEnds({ showId: SHOW_ID }, ctx);
    expect(result.state).toBe('source_unavailable');
    expect(result.limitations.join(' ')).toContain('enrollments');
  });

  it('(a) lists attributed dogs with no LIVE entry, named, with owner and links', async () => {
    const { result, rows } = await run();
    const dogs = rows('Dog created from this show');
    // Berkeley's only entry is soft-deleted; Softie is soft-deleted itself; the
    // other show's dog and the entered dogs are not this show's loose ends.
    expect(dogs).toHaveLength(1);
    expect(dogs[0]).toContain('Berkeley');
    expect(dogs[0]).toContain('dogId=dB');
    expect(dogs[0]).toContain('createdBy=auth-1');
    expect(dogs[0]).toContain('Ann Tester (a***@example.com)');
    expect(dogs[0]).not.toContain('ann@example.com');
    expect(result.links.map(l => l.url)).toContain('https://app.myk9show.com/dogs/dB');
  });

  it('(a) lists attributed people with no entry, not those with an enrollment-only tie', async () => {
    const { result, rows } = await run();
    const people = rows('Person created from this show');
    expect(people).toHaveLength(1);
    expect(people[0]).toContain('Bob Tester');
    expect(people[0]).toContain('personId=pBob');
    expect(result.links.map(l => l.url)).toContain('https://app.myk9show.com/people/pBob');
    expect(people.join()).not.toContain('Olive');
  });

  it('(b) lists enrollments with no entries and entries with no enrollment', async () => {
    const { rows } = await run();
    const empty = rows('Enrollment with no entries');
    expect(empty).toHaveLength(1);
    expect(empty[0]).toContain('C-2');
    expect(empty[0]).toContain('Bob Tester');
    const orphans = rows('Entry with no enrollment');
    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toContain('Anchor');
    expect(orphans[0]).toContain('entryId=e3');
  });

  it('(c) flags duplicate live entries but not a withdrawn twin or a soft-deleted one', async () => {
    const { rows } = await run();
    const dups = rows('Duplicate live entries');
    expect(dups).toHaveLength(1);
    expect(dups[0]).toContain('Anchor');
    expect(dups[0]).toContain('101 Novice Interior');
    expect(dups[0]).toContain('entryId=e1');
    expect(dups[0]).toContain('entryId=e2');
    expect(dups[0]).not.toContain('entryId=e5');
  });

  it('(d) flags only the real pending and failed states', async () => {
    const { rows } = await run();
    const stuck = rows('Entry stuck or failed').join('\n');
    expect(stuck).toContain("entry_status 'draft'");
    expect(stuck).toContain("entry_status 'pending-payment'");
    expect(stuck).toContain("confirmation_email_status 'failed'");
    expect(rows('Entry stuck or failed')).toHaveLength(3);
  });

  it('puts unattributed rows ONLY in the GUESS section, labelled on every row', async () => {
    const { result, rows } = await run();
    const dogs = rows(`${GUESS_LABEL}: dog`);
    const people = rows(`${GUESS_LABEL}: person`);
    // Liddle: in the session window. Excluded: Used (entered at another show),
    // Veteran (entered here), Faraway (outside the window), Anchor (entered).
    expect(dogs).toHaveLength(1);
    expect(dogs[0]).toContain('Liddle');
    expect(dogs[0]).toContain('GUESS:');
    // Zed: in window. Excluded: Acct (has a sign-in account), Olga (outside).
    expect(people).toHaveLength(1);
    expect(people[0]).toContain('Zed Tester');
    expect(people[0]).toContain('GUESS:');
    // A guess never leaks into an attributed category.
    expect(rows('Dog created from this show').join()).not.toContain('Liddle');
    expect(result.summary).toMatchObject({
      guessDogsWithoutEntry: 1,
      guessPeopleWithoutEntry: 1,
      guessSectionIsNotRecordedAttribution: true,
    });
    const note = result.limitations.find(l => l.startsWith(GUESS_LABEL));
    expect(note).toContain('Treat every GUESS row as a lead');
    expect(note).toContain('2026-10-01T09:30:00.000Z to 2026-10-01T11:00:00.000Z');
  });

  it('a row attributed to this show is never also reported as a guess', async () => {
    const tables = looseEndsTables();
    const { rows } = await run(tables);
    expect(rows(`${GUESS_LABEL}: dog`).join()).not.toContain('Berkeley');
    expect(rows(`${GUESS_LABEL}: person`).join()).not.toContain('Bob');
  });

  it('builds no guess section when the show has no entries to anchor a window', async () => {
    const tables = looseEndsTables();
    tables.entries = tables.entries!.filter(e => e.show_id === OTHER_SHOW);
    const { result, rows } = await run(tables);
    expect(rows(GUESS_LABEL)).toHaveLength(0);
    expect(result.limitations.join(' ')).toContain('no live entries, so no window could be built');
  });

  it('caps rows per category at maxLimit and says so', async () => {
    const tables = looseEndsTables();
    for (let i = 0; i < 4; i += 1) {
      tables.dogs!.push({
        id: `dx${i}`,
        call_name: `Extra${i}`,
        owner_id: null,
        created_at: '2026-10-01T10:05:00Z',
        created_by: null,
        created_from_show_id: SHOW_ID,
        deleted_at: null,
      });
    }
    const ctx = makeCtx(tables, { config: { ...CONFIG, maxLimit: 2 } });
    const result = await diagnoseShowLooseEnds({ showId: SHOW_ID }, ctx);
    expect(result.evidence.filter(e => e.label.startsWith('Dog created from'))).toHaveLength(2);
    expect(result.summary).toMatchObject({ attributedDogsWithoutEntry: 5 });
    expect(result.limitations.join(' ')).toContain('showing 2 of 5 rows');
  });

  it('names columns in every select (no star) and links the show', async () => {
    const { result, ctx } = await run();
    expect(ctx.selects.length).toBeGreaterThan(5);
    for (const select of ctx.selects) expect(select).not.toContain('*');
    expect(result.links[0]?.url).toBe(`https://app.myk9show.com/shows/${SHOW_ID}`);
    expect(result.envLabel).toBe('staging');
  });

  it('excludes accountless people who handle or own a dog entered at another show', async () => {
    const { rows } = await run();
    const people = rows(`${GUESS_LABEL}: person`).join();
    expect(people).toContain('Zed');
    expect(people).not.toContain('Hank');
    expect(people).not.toContain('Owen');
  });

  it('still sees a cross-show entry that sits past the first 1000-row page', async () => {
    const tables = looseEndsTables();
    // 1100 other-show entries for one in-window dog sort before the entry that
    // proves 'Latecomer' is in use; an unpaginated lookup would miss it.
    tables.dogs!.push(
      {
        id: 'dBusy',
        call_name: 'Busy',
        owner_id: 'pAnn',
        created_at: '2026-10-01T10:20:00Z',
        created_by: null,
        created_from_show_id: null,
        deleted_at: null,
      },
      {
        id: 'dLate',
        call_name: 'Latecomer',
        owner_id: 'pAnn',
        created_at: '2026-10-01T10:21:00Z',
        created_by: null,
        created_from_show_id: null,
        deleted_at: null,
      }
    );
    for (let i = 0; i < 1100; i += 1) {
      tables.entries!.push({
        id: `a-${String(i).padStart(5, '0')}`,
        show_id: OTHER_SHOW,
        dog_id: 'dBusy',
        class_id: `x${i}`,
        registration_id: null,
        handler_id: 'pAnn',
        entry_status: 'confirmed',
        confirmation_email_status: 'sent',
        created_at: '2026-10-02T00:00:00Z',
        deleted_at: null,
      });
    }
    tables.entries!.push({
      id: 'z-late',
      show_id: OTHER_SHOW,
      dog_id: 'dLate',
      class_id: 'c1',
      registration_id: null,
      handler_id: 'pAnn',
      entry_status: 'confirmed',
      confirmation_email_status: 'sent',
      created_at: '2026-10-02T00:00:00Z',
      deleted_at: null,
    });
    const { rows } = await run(tables);
    const guesses = rows(`${GUESS_LABEL}: dog`).join();
    expect(guesses).not.toContain('Latecomer');
    expect(guesses).not.toContain('Busy');
    expect(guesses).toContain('Liddle');
  });
});
