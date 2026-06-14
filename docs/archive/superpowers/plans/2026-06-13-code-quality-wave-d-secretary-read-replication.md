# Code Quality Wave D Secretary Read Replication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Keep this file updated as tasks complete.

## Goal

Move the secretary Entry Management read path, `getEntriesForShow(showId)`, off the direct joined `entries` PostgREST read and onto replicated `entries` + `dogs` + `classes` data so the secretary table remains useful offline.

## Scope

- Preserve the existing `SecretaryEntry` return shape used by `useEntryManagementData`.
- Use replicated entries as the primary source.
- Join replicated dog, class, and armband records locally.
- Opportunistically enrich owner/person and enrollment metadata from online tables when available.
- Keep a PostgREST fallback for replication-store failures only.
- Do not change status/bulk writes; those were completed in the previous Wave D slice.

## Implementation Tasks

- [x] Add failing tests proving `getEntriesForShow` uses replicated entries/dogs/classes and does not call `supabase.from('entries')` on the healthy path.
- [x] Add tests for soft-delete filtering, deterministic created/submitted ordering, replicated armband fallback, and optional enrollment/owner enrichment.
- [x] Extract the legacy PostGREST read into a private fallback helper.
- [x] Implement a replicated secretary row builder that maps local entries, dogs, classes, and armbands into `SecretaryEntry`.
- [x] Add best-effort online enrichment for non-replicated `people` and `enrollments` metadata without blocking offline reads.
- [x] Update code-quality tracking docs and `OPEN-TODOS.md` for this Wave D slice.

## Verification

- [x] Run the focused secretary replication test file red before implementation.
- [x] Run the focused secretary replication test file green after implementation.
- [x] Run the related hook test for `useEntryManagementData`.
- [x] Run `pnpm --filter @myk9/show typecheck`.
- [x] Run `pnpm --filter @myk9/show lint`.

## Risks

- Owner/person and enrollment metadata are not part of the current replication store. The adapter keeps the core secretary table usable offline and adds those fields only when online enrichment succeeds.
- Replicated classes do not currently carry `class_number`; the adapter preserves the existing shape with `null` where replicated data cannot supply it.
