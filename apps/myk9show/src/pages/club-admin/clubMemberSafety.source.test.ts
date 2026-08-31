import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contracts for the roster's safety and error surfaces.
 *
 * Asserted at the source because these are structural properties of the page
 * (which queries gate it, which mutations report failure, which primitive the
 * dialogs use) rather than behaviours the existing page harness can drive.
 * Same approach as the repo's other *.source.test.ts files.
 */
const page = readFileSync(resolve(__dirname, 'ClubMembersPage.tsx'), 'utf8');
const dialogs = readFileSync(resolve(__dirname, 'ClubMemberDialogs.tsx'), 'utf8');

describe('roster query gating', () => {
  it('gates the page on all three queries, not just members', () => {
    // officersQuery and showManagersQuery rendered through `?? []` / `?? new
    // Set()`, so a failed fetch asserted "0 officers" and "nobody has show
    // access" as fact, permanently and with no retry.
    expect(page).toContain('officersQuery.isLoading');
    expect(page).toContain('showManagersQuery.isLoading');
    expect(page).toContain('officersQuery.isError');
    expect(page).toContain('showManagersQuery.isError');
  });

  it('retries whichever query actually failed', () => {
    expect(page).toContain('retryRoster');
  });
});

describe('partial failure never asserts absence', () => {
  it('suppresses the officer count when the officers query failed', () => {
    // `officers` falls back to [] on failure, so "0 officers" is a claim the
    // page cannot support. An inline "unavailable" notice alone is not enough:
    // rendering it beside a count and an empty table says both things at once.
    expect(page).toContain('officersUnavailable');
    expect(page).toContain("'Officers unavailable'");
  });

  it('suppresses the officers table entirely when the query failed', () => {
    // Its empty state reads "No Officers Assigned", which would confirm as
    // fact the very thing the notice says could not be checked.
    expect(page).toContain('{!officersUnavailable && (');
  });

  it('keeps the members roster visible when only an annotation query fails', () => {
    // The full-page error takeover is members-only. Officers populate a
    // different tab and show-managers annotate one column; letting either blank
    // a roster that loaded fine is worse than the bug it was fixing.
    expect(page).toContain('const rosterError = membersQuery.isError;');
  });
});

describe('mutation failure reporting', () => {
  it('gives every mutation an onError', () => {
    // A rejected write used to do nothing at all. club_officers has
    // UNIQUE(club_id, person_id, position), so duplicate assignment is a
    // reachable 23505 that produced no message whatsoever.
    const mutations = page.match(/useMutation\(\{/g) ?? [];
    const onErrors = page.match(/onError:/g) ?? [];
    expect(mutations.length).toBeGreaterThan(0);
    expect(onErrors.length).toBe(mutations.length);
  });

  it('does not invalidate show managers when a member is removed', () => {
    // Inverted deliberately. Membership used to gate every secretary predicate, so
    // removing a member changed who could run the club's shows. Appointment is now
    // the only grant, which makes that refetch dead — and, worse, implies to the
    // next reader that the two are still coupled.
    const removeBlock = page.slice(
      page.indexOf('removeMemberMutation = useMutation'),
      page.indexOf('addOfficerMutation = useMutation')
    );
    expect(removeBlock).not.toContain("['club-show-managers', clubId]");
  });

  it('still invalidates show managers when access is actually toggled', () => {
    // The one mutation that does change it. Without this the inverted assertion
    // above would pass just as happily on a page that never refetches at all.
    const toggleBlock = page.slice(
      page.indexOf('toggleShowAccessMutation = useMutation'),
      page.indexOf('// Handlers')
    );
    expect(toggleBlock).toContain("['club-show-managers', clubId]");
  });
});

describe('destructive removal', () => {
  it('confirms before deleting a membership record', () => {
    expect(page).toContain('AlertDialog');
    expect(page).toContain('pendingRemoval');
    expect(page).toContain('cannot be undone');
  });

  it('tells the admin that show access SURVIVES removal when the member holds it', () => {
    // The dialog used to promise the opposite ("They also lose show access"), which
    // is now false: the appointment outlives the membership record. An admin who
    // removes a member to end their access would otherwise walk away believing it
    // worked. The negative assertion is the one that matters — it fails if the old
    // sentence comes back.
    expect(page).toContain('hasShowAccess');
    expect(page).toMatch(/is NOT removed/);
    expect(page).not.toMatch(/lose show access/i);
  });

  it('does not gate the grant-access action on membership status', () => {
    // Server-side the appointment RPC no longer checks membership; leaving the menu
    // item disabled would enforce the retired rule in the client alone, which is the
    // failure mode where a fix looks shipped and is unreachable.
    expect(dialogs).not.toContain("member.membershipStatus !== 'active'");
    expect(dialogs).not.toContain('active members only');
  });

  it('routes officer removal through the same confirmation', () => {
    expect(page).toContain('handleRemoveOfficer');
    expect(page).not.toContain('officerId => removeOfficerMutation.mutate(officerId)');
  });
});

describe('dialog semantics', () => {
  it('uses the Dialog primitive rather than a hand-rolled overlay', () => {
    // The hand-rolled shells had no role="dialog", no aria-modal, no focus
    // trap, no focus restore and no Escape handler.
    expect(dialogs).toContain('DialogContent');
    expect(dialogs).not.toContain('fixed inset-0 z-50 flex items-center justify-center');
  });

  it('gives each dialog an accessible name', () => {
    expect(dialogs.match(/<DialogTitle/g)?.length).toBe(2);
  });

  it('lets the dialog scroll at large font scales', () => {
    expect(dialogs).toContain('overflow-y-auto');
  });

  it('admits when the person list is truncated', () => {
    expect(dialogs.match(/Showing the first 20 of/g)?.length).toBe(2);
  });
});
