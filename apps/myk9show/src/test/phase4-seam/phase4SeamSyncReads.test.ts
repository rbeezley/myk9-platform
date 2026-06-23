/**
 * Unit tests for the Phase 4 render-only sync-down read serving.
 *
 * Proves that the harness serves the replication sync-down GETs
 * (shows / trials / classes / entries-view) from fixture state in the exact
 * snake_case DB shape each replication mapper reads, honoring the PostgREST `eq`
 * scope filter and the `updated_at=gt.<iso>` watermark — the render-only read
 * strategy (docs/plan-phase4-seam-render-only.md). Runs under vitest (no browser).
 *
 * Located outside e2e/ so vitest collects it (Playwright owns e2e/).
 */

import { describe, it, expect } from 'vitest';
import {
  createPhase4SeamState,
  PHASE4_IDS,
  type Phase4SeamState,
} from '../e2e/fixtures/phase4SeamFixture';
import { handleSeamRequest, type SeamRequest } from '../e2e/fixtures/phase4SeamRoutes';

const REST = 'https://x.supabase.co/rest/v1';

function get(url: string): SeamRequest {
  return { method: 'GET', url, postData: null, headers: {} };
}

function body(state: Phase4SeamState, url: string, options?: Parameters<typeof handleSeamRequest>[2]) {
  const { response } = handleSeamRequest(state, get(url), options);
  expect(response.action).toBe('fulfill');
  expect(response.status).toBe(200);
  return response.body as Array<Record<string, unknown>>;
}

describe('phase4 sync-down reads (render-only)', () => {
  describe('shows', () => {
    it('serves the fixture show with every mapper-required column on a full sync', () => {
      const state = createPhase4SeamState();
      const rows = body(state, `${REST}/shows?select=*&order=updated_at.asc`);
      expect(rows).toHaveLength(1);
      // rowToShow required set: id, name, organization, start_date, end_date, updated_at.
      expect(rows[0]).toMatchObject({
        id: PHASE4_IDS.show,
        name: 'Autumn Classic Scent Work Trial',
        organization: 'AKC',
        start_date: '2026-09-12',
        end_date: '2026-09-13',
        club_id: 'phase4-club-autumn',
      });
      expect(typeof rows[0].updated_at).toBe('string');
    });

    it('honors the updated_at=gt watermark (excludes the show on a later incremental sync)', () => {
      const state = createPhase4SeamState();
      const after = body(state, `${REST}/shows?select=*&updated_at=gt.2026-06-30T00:00:00.000Z`);
      expect(after).toHaveLength(0);
      const before = body(state, `${REST}/shows?select=*&updated_at=gt.2026-01-01T00:00:00.000Z`);
      expect(before).toHaveLength(1);
    });

    it('returns empty when the id/club_id scope filter does not match the fixture show', () => {
      const state = createPhase4SeamState();
      expect(body(state, `${REST}/shows?id=eq.some-other-show`)).toHaveLength(0);
      expect(body(state, `${REST}/shows?club_id=eq.some-other-club`)).toHaveLength(0);
    });
  });

  describe('trials', () => {
    it('serves the fixture trial scoped by show_id with required columns', () => {
      const state = createPhase4SeamState();
      const rows = body(state, `${REST}/trials?show_id=eq.${PHASE4_IDS.show}`);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: PHASE4_IDS.trial,
        show_id: PHASE4_IDS.show,
        name: 'Day 1 — Saturday',
        date: '2026-09-12',
      });
      expect(typeof rows[0].updated_at).toBe('string');
    });

    it('returns empty for a non-matching show_id scope', () => {
      const state = createPhase4SeamState();
      expect(body(state, `${REST}/trials?show_id=eq.nope`)).toHaveLength(0);
    });
  });

  describe('classes', () => {
    it('serves both fixture classes scoped by trial_id', () => {
      const state = createPhase4SeamState();
      const rows = body(state, `${REST}/classes?trial_id=eq.${PHASE4_IDS.trial}`);
      expect(rows).toHaveLength(2);
      const open = rows.find(r => r.id === PHASE4_IDS.classOpen);
      expect(open).toMatchObject({
        trial_id: PHASE4_IDS.trial,
        name: 'Novice A — Container',
        entry_fee: 30,
      });
    });

    it('narrows to a single class on an id filter', () => {
      const state = createPhase4SeamState();
      const rows = body(state, `${REST}/classes?id=eq.${PHASE4_IDS.classFull}`);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(PHASE4_IDS.classFull);
    });

    it('reflects a released class as status completed with results_released_at set', () => {
      const state = createPhase4SeamState();
      state.classes[PHASE4_IDS.classOpen].results_released_at = '2026-09-12T18:00:00.000Z';
      const rows = body(state, `${REST}/classes?id=eq.${PHASE4_IDS.classOpen}`);
      expect(rows[0]).toMatchObject({
        status: 'completed',
        results_released_at: '2026-09-12T18:00:00.000Z',
      });
    });
  });

  describe('entries via view_authenticated_entry_results', () => {
    it('serves every fixture entry for the show with render-critical columns', () => {
      const state = createPhase4SeamState();
      const rows = body(
        state,
        `${REST}/view_authenticated_entry_results?show_id=eq.${PHASE4_IDS.show}`
      );
      // 5 seeded entries: scratch, question, fullseat, withdraw, result.
      expect(rows).toHaveLength(5);
      const scratch = rows.find(r => r.id === PHASE4_IDS.entryScratch)!;
      expect(scratch).toMatchObject({
        show_id: PHASE4_IDS.show,
        class_id: PHASE4_IDS.classOpen,
        entry_status: 'confirmed',
        check_in_status: 'not-checked-in',
        payment_status: 'paid',
        armband: 12,
        dog_call_name: 'Scout',
        is_scored: false,
      });
    });

    it('narrows by class_id scope', () => {
      const state = createPhase4SeamState();
      const rows = body(
        state,
        `${REST}/view_authenticated_entry_results?show_id=eq.${PHASE4_IDS.show}&class_id=eq.${PHASE4_IDS.classFull}`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].class_id).toBe(PHASE4_IDS.classFull);
    });

    it('honors the updated_at=gt watermark', () => {
      const state = createPhase4SeamState();
      // All entries seed at 2026-06-01; a later watermark excludes them.
      const after = body(
        state,
        `${REST}/view_authenticated_entry_results?updated_at=gt.2026-06-02T00:00:00.000Z`
      );
      expect(after).toHaveLength(0);
    });

    it('remaps exhibitor-A entry ownership to the real signed-in person id', () => {
      const state = createPhase4SeamState();
      const rows = body(
        state,
        `${REST}/view_authenticated_entry_results?show_id=eq.${PHASE4_IDS.show}`,
        { identity: { exhibitorPersonId: 'real-person-xyz' } }
      );
      const scratch = rows.find(r => r.id === PHASE4_IDS.entryScratch)!; // exhibitor A
      expect(scratch.handler_id).toBe('real-person-xyz');
      const fullseat = rows.find(r => r.id === 'phase4-entry-fullseat')!; // exhibitor B
      expect(fullseat.handler_id).toBe(PHASE4_IDS.personB);
    });
  });

  describe('write-safety of read-only sync tables', () => {
    it('flags a stray WRITE to a sync-read-only table as an unhandled mutation', () => {
      const state = createPhase4SeamState();
      const { audit } = handleSeamRequest(state, {
        method: 'PATCH',
        url: `${REST}/shows?id=eq.${PHASE4_IDS.show}`,
        postData: { name: 'hacked' },
        headers: {},
      });
      expect(audit.isUnhandledMutation).toBe(true);
      expect(audit.fulfilled).toBe(true); // blocked locally (500), never networked
    });
  });
});
