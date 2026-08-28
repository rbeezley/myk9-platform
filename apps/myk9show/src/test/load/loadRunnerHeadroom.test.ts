import { describe, expect, it } from 'vitest';
import {
  CURRENT,
  SIBLING,
  fullInventory,
  headroom,
  verdictReason,
} from './loadRunnerHeadroom.fixtures';

describe('evaluateHeadroom', () => {
  it('counts jobs in a sibling repository against the account ceiling', () => {
    // The regression NCR-2026-08-27-01 names: the rehearsal repo is idle, so a
    // per-repo gate sees 20 free and dispatches. Account-wide, only 16 are.
    const verdict = headroom({
      repos: [
        { fullName: CURRENT, activeJobs: 0 },
        { fullName: SIBLING, activeJobs: 4 },
      ],
    });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain(`${SIBLING}=4`);
    expect(verdictReason(verdict)).toContain('leaving 16 free but 17 required');
  });

  it('admits the rehearsal when the whole account has room', () => {
    const verdict = headroom({
      repos: [
        { fullName: CURRENT, activeJobs: 1 },
        { fullName: SIBLING, activeJobs: 2 },
      ],
    });

    expect(verdict).toEqual({ ok: true, busy: 3, free: 17 });
  });

  it('admits exactly at the boundary', () => {
    expect(headroom({ repos: [{ fullName: CURRENT, activeJobs: 3 }] })).toEqual({
      ok: true,
      busy: 3,
      free: 17,
    });
  });

  it('refuses one job past the boundary', () => {
    expect(headroom({ repos: [{ fullName: CURRENT, activeJobs: 4 }] }).ok).toBe(false);
  });

  it('refuses when any repository could not be read, even with apparent room', () => {
    const verdict = headroom({ unreadableRepos: [`${SIBLING} (HTTP 404)`] });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain('could not be verified');
    expect(verdictReason(verdict)).toContain(SIBLING);
  });

  it('refuses an inventory that omits the rehearsal repository', () => {
    const verdict = headroom({ inventory: [SIBLING] });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain('not an account-wide view');
  });

  it('refuses an empty inventory rather than reading it as an idle account', () => {
    const verdict = headroom({ inventory: [] });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain('inventory was empty');
  });

  // The finding this section exists for: a token scoped to ONLY the rehearsal's
  // own repository passes every structural check and still undercounts.
  it('refuses a token scoped to only the rehearsal repository', () => {
    const verdict = headroom({ inventory: [CURRENT] });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain(SIBLING);
    expect(verdictReason(verdict)).toContain('did not enumerate');
  });

  it('refuses a narrowly-scoped token even when every visible repo is idle', () => {
    // Idle + readable + contains our own repo — the shape that would otherwise
    // sail through with 20 free slots while the sibling is running CI.
    const verdict = headroom({
      repos: [{ fullName: CURRENT, activeJobs: 0 }],
      inventory: [CURRENT],
    });

    expect(verdict.ok).toBe(false);
  });

  it('names every expected repository the token failed to enumerate', () => {
    const verdict = headroom({ inventory: [CURRENT, SIBLING] });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain('rbeezley/AKC-Scent-Work-Rules');
    expect(verdictReason(verdict)).toContain('rbeezley/myk9show-launch-video');
  });

  it('refuses when the account reports more public repos than the token can see', () => {
    // The one scope proof the API supplies: `public_repos` is an account
    // property, so a token hiding a public repository shows up as a shortfall.
    const verdict = headroom({ publicRepoAudit: { reported: 3, enumerated: 1 } });

    expect(verdict.ok).toBe(false);
    expect(verdictReason(verdict)).toContain('reports 3 public repositories');
    expect(verdictReason(verdict)).toContain('enumerated only 1');
  });

  it('does not refuse when the public-repo audit could not run', () => {
    // `reported: null` means the profile read failed. That is a check that did
    // not run, and the other guards still stand; it must not become a refusal
    // that blocks every dispatch on a transient profile read.
    expect(headroom({ publicRepoAudit: { reported: null, enumerated: 0 } }).ok).toBe(true);
  });

  it('accepts an enumeration ahead of the reported public count', () => {
    // A repo made public between the two reads is not evidence of narrowing.
    expect(headroom({ publicRepoAudit: { reported: 1, enumerated: 2 } }).ok).toBe(true);
  });

  it('accepts repositories beyond the expected floor', () => {
    // The pinned set is a floor, not a ceiling: a repo created later is counted
    // without anyone having to update the list first.
    const verdict = headroom({
      repos: [
        { fullName: CURRENT, activeJobs: 1 },
        { fullName: 'rbeezley/brand-new', activeJobs: 2 },
      ],
      inventory: fullInventory(['rbeezley/brand-new']),
    });

    expect(verdict).toEqual({ ok: true, busy: 3, free: 17 });
  });
});
