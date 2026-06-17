import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contract for migration 20260617150000 — the repaired resolve_class_result_visibility,
 * the SECURITY DEFINER function behind the public/anon scored-results gate
 * (view_public_entry_results). The original resolver referenced three tables dropped
 * by migration 103, so every anon results read errored. This pins the resolver to the
 * SURVIVING consolidated tables and guards against a regression back to the dropped
 * names (which would re-break public results) — the migration is the source of truth.
 */
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260617150000_fix_result_visibility_resolver.sql'
  ),
  'utf8'
);

/** Tables dropped by migration 103 — the resolver must reference NONE of them. */
const DROPPED_TABLES = [
  'show_result_visibility_defaults',
  'trial_result_visibility_overrides',
  'class_result_visibility_overrides',
];

/** Surviving consolidated tables the resolver must read from. */
const SURVIVING_TABLES = [
  'public.show_visibility_settings',
  'public.trial_visibility_overrides',
  'public.class_visibility_overrides',
];

/** Only the function body counts for the dropped-table check — comments may name them. */
const body = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION'));

describe('resolve_class_result_visibility resolver migration (20260617150000)', () => {
  it('replaces the resolver as SECURITY DEFINER with a locked search_path', () => {
    expect(body).toContain('FUNCTION public.resolve_class_result_visibility(p_class_id uuid)');
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toMatch(/SET search_path TO 'public'/);
  });

  it('reads from the surviving consolidated visibility tables', () => {
    for (const t of SURVIVING_TABLES) {
      expect(body).toContain(t);
    }
  });

  it('references NONE of the tables dropped by migration 103 (regression guard)', () => {
    for (const t of DROPPED_TABLES) {
      expect(body).not.toContain(t);
    }
  });

  it('reads the SHOW base timing columns directly (no show-level preset expansion)', () => {
    // The show base must read its materialized timing columns directly — expanding
    // the preset over NOT NULL columns would silently discard it and over-expose.
    // Pin the direct COALESCE column read from show_visibility_settings.
    expect(body).toContain('COALESCE(s.placement_timing,');
    expect(body).toMatch(/COALESCE\(s\.qualification_timing,[\s\S]*?FROM public\.show_visibility_settings/);
  });

  it('keeps fail-closed behaviour for an unknown class', () => {
    expect(body).toMatch(/IF NOT FOUND THEN[\s\S]*?RETURN QUERY SELECT false, false, false, false/);
  });
});
