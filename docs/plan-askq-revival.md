# AskQ Revival & Simplification Plan

> **Status:** Active

**Goal:** Get AskQ working again, then simplify it from a half-built RAG stack into a "select-then-bundle" design that fits the actual corpus sizes. AskQ already has the right *shape* (Claude + tool-calling + SSE streaming, rate-limited by tier); the work is finishing the dark paths and deleting the retrieval machinery the corpus doesn't justify.

**Owner surface:** `supabase/functions/ask-myk9show`, `supabase/functions/ask-myk9q`, and the shared `supabase/functions/_shared/askq/*`. Frontend: `apps/myk9show/src/components/askq/*`, `apps/myk9show/src/services/askqService.ts`, `apps/myk9show/src/hooks/useAskQ.ts`.

---

## Why this plan exists — findings (June 2026)

A code investigation found AskQ is **non-functional in production** and carries abandoned RAG scaffolding:

1. **Retired model (FIXED).** `_shared/askq/promptBuilder.ts` pinned `claude-3-5-haiku-20241022`, retired 2026-02-19 → every call 404s. Swapped to `claude-haiku-4-5` ([#1048](https://github.com/rbeezley/myk9-platform/pull/1048)) and **deployed** to both functions. This plan's Phase 0.
2. **Chunking/embeddings were never built.** The `rules` table has an unused `embedding vector(1536)` column and no inference pipeline; retrieval is **not** vector-based. The live engine is lean: Claude Haiku + tool-calling + Postgres full-text search + direct DB queries.
3. **`search_rules` is broken.** `ruleLookup.ts` calls `.textSearch('search_vector', …)` on the `rules` table, which has **no `search_vector` column** (only `user_guide` does, in migration 105). Rule questions error even before considering the empty corpus.
4. **Empty corpora.** Both `rules` and `user_guide` tables exist but are never populated. The UI's **"app-help"** category shows "Coming soon…". The `docs/user-guides/*.md` files are **not** ingested anywhere.
5. **Data questions already work** via tool-calling (`get_entry_results` → `view_entry_with_results`, etc.) — direct structured queries, no RAG. Leave this path alone.

### Corpus sizes (the load-bearing facts)

| Corpus | Size | Fits in context? |
|---|---|---|
| How-to guides (`docs/user-guides/*.md`, all roles) | ~10K tokens total | Trivially — the whole set fits in one prompt |
| One rulebook (AKC Scent Work `RSW001.pdf`) | 88 pages / ~40K words / **~53K tokens** | Yes, easily (Haiku 4.5 context = 200K) |
| Show data | live | n/a (queried, not bundled) |

**Conclusion:** the corpus is small enough that AskQ needs **no vector DB, no chunking, and (mostly) no full-text search.** How-to bundles wholesale; rules bundle one selected rulebook at a time.

---

## Architecture decision — select-then-bundle, don't retrieve

| Corpus | Approach | Storage / source of truth | Retrieval infra |
|---|---|---|---|
| **How-to** | Bundle **all** guides into context on every app-help question | `docs/user-guides/*.md` (already the docs-site source); regenerated into a function asset at build/deploy time | **None** — drop `user_guide` table + `search_user_guide` tool |
| **Rules** | **Select** the relevant rulebook by `org + sport` (cheap structured lookup using the show's registry), then bundle that one rulebook with **prompt caching** | One rulebook = one whole document; see "Rules storage decision" below | **None** — drop `rules.embedding`, skip the `search_vector` FTS |
| **Show data** | Direct DB queries via tool-calling (unchanged) | live tables/views | n/a |

```
Why this beats the half-built RAG:
- No retrieval-miss risk: the model sees the entire relevant rulebook, so a
  paraphrased question ("how long in Excellent Interior?") can't miss a
  keyword the way FTS can.
- Prompt caching makes a 53K-token rulebook ~$0.005/query on a warm cache
  (Haiku 4.5: $1/1M input; cache reads ~0.1x). Cold ~$0.05. Output capped at
  1024 tokens (~$0.005).
- Single source of truth: guides regenerate from docs/user-guides at deploy,
  exactly like the Astro site — no hand-maintained DB copy to drift.
```

### Rules storage decision (resolve in Phase 2)

Rulebooks are large, per-(org, sport), and **externally authored** (AKC/UKC publish them ~annually) — unlike the how-to guides, which we author. Two options:

- **(A) Bundle rulebook text as function assets** (markdown extracted from the source PDFs, checked into the repo, deployed with the function). No DB, no drift, mirrors the how-to approach. Risk: Supabase edge-function bundle size with several rulebooks (~250KB each).
- **(B) `rulebooks` table** keyed by `(org, sport)` holding each rulebook's full text in one row; the function `SELECT`s the one relevant row at query time. This is a **keyed whole-document lookup, not a retrieval index** (no chunking/embeddings). Drift is bounded and infrequent (re-ingest only when a sanctioning body publishes a new edition).

Recommendation: **(A) if the bundle fits**, else **(B)**. Either way, the existing `rules` (row-per-rule) + `embedding` design is abandoned.

---

## Phase 0 — Unbreak production (DONE)

- [x] Swap `_shared/askq/promptBuilder.ts` model to `claude-haiku-4-5` ([#1048](https://github.com/rbeezley/myk9-platform/pull/1048)).
- [x] Deploy `ask-myk9show` and `ask-myk9q` (`--no-verify-jwt`, project `sojmvhhwsjxmfistvzbe`).
- [ ] Confirm a real AskQ question answers in-app (authenticated) — owner verification.

## Phase 1 — Turn on how-to (app-help)

**Files:** `_shared/askq/promptBuilder.ts` (or a new `_shared/askq/guides.ts`), a build/prepare step, `apps/myk9show/src/components/askq/askq-config.ts` (enable the app-help examples), tests.

- [ ] Add a build/deploy step that emits the concatenated `docs/user-guides/*.md` as a function-bundled asset (mirror the docs site's `apps/docs/scripts/prepare-content.mjs`). No `user_guide` table.
- [ ] In the system prompt, include the bundled guides as context and instruct: answer how-to **only** from the guides; if not covered, say so and link the relevant page.
- [ ] Replace the `search_user_guide` tool path with the bundled-context approach.
- [ ] Enable the "app-help" example queries in the UI (remove "Coming soon…").
- [ ] **Tests:** unit-test the guide-bundling/assembly; assert the system prompt contains the secretary guide text; a smoke question ("how does a secretary add a mail-in entry?") returns guide-grounded steps.

## Phase 2 — Turn on rules

**Files:** `_shared/askq/ruleLookup.ts` (rewrite), rulebook source (per storage decision), `_shared/askq/toolDefinitions.ts`, tests.

- [ ] **Resolve the storage decision** (A bundle vs. B `rulebooks` table). If (B), the migration must include explicit GRANTs (see CLAUDE.md DB rules).
- [ ] Extract AKC Scent Work (and any other in-scope) rulebook text from the source PDFs into the chosen store.
- [ ] Implement **rulebook selection** by `(org, sport)` from the show/trial registry context already available in `ask-myk9show`.
- [ ] Pass the selected rulebook to Claude with a `cache_control` breakpoint (prompt caching). Consider a 1-hour TTL or a re-warm for show-day bursts.
- [ ] **Remove the broken `search_rules` FTS path** (`.textSearch('search_vector', …)` on `rules`).
- [ ] **Tests:** unit-test rulebook selection (org+sport → correct rulebook); assert `cache_read_input_tokens > 0` on the second identical-prefix request (caching actually engages); a smoke rule question returns a grounded answer with the right time limit.

## Phase 3 — Delete the dead infrastructure

**Files:** a cleanup migration, `_shared/askq/*`, `apps/myk9show` askq components.

- [ ] Drop the `user_guide` table (and its trigger/index) once Phase 1 ships.
- [ ] Drop the unused `rules.embedding` column; drop `rules`/`rules_*` tables if fully replaced by the rulebook store.
- [ ] Remove `pgvector` usage if nothing else in the schema depends on it (verify first).
- [ ] Remove `search_user_guide` / `search_rules` from `toolDefinitions.ts` and `toolExecutor.ts`.
- [ ] **Tests:** confirm the remaining tool set still validates; no references to removed tables/tools.

## Phase 4 — Verify & tune

- [ ] In-app smoke each question category end-to-end: **rules** ("time limit for Excellent Interior"), **how-to** ("add a mail-in entry"), **data** ("how did my dog do today").
- [ ] Confirm prompt-caching is engaging (`usage.cache_read_input_tokens`) and record per-query cost.
- [ ] Decide whether Haiku 4.5 is sufficient for rule reasoning or whether rule questions warrant Sonnet (cost vs. quality — keep Haiku unless quality is short).

---

## Open questions

- ~~**Is `ask-myk9q` still wired to anything?**~~ **RESOLVED — retired.** No live caller (frontend uses only `ask-myk9show`; `apps/myk9q` was deleted; myK9Qv3/`myk9q.com` runs its own AskQ on a separate Supabase project). Source removed ([#1049](https://github.com/rbeezley/myk9-platform/pull/1049)) and the deployed function deleted. AskQ is now a single surface (`ask-myk9show`); Phases 1–2 target it only.
- **Rulebook source of truth & cadence.** Where do the canonical rulebook files live, and who re-ingests when a sanctioning body publishes a new edition?
- **Which rulebooks are in scope for V1?** Start with AKC Scent Work (the one we have); enumerate the rest.

## Testing Phase (required before "complete")

- Unit tests: guide bundling/prompt assembly, rulebook selection, removed-tool cleanup.
- Caching test: prove `cache_read_input_tokens > 0` on repeat identical-prefix rule queries.
- Negative tests: question outside the guides/rulebook returns a "not covered" answer, not a hallucinated one.
- End-to-end in-app smoke for all three question categories.

## Deferred beyond this plan

- Multi-rulebook cross-search (only if a single question ever needs to span rulebooks — not expected for this domain).
- Re-introducing embeddings/RAG (only if the corpus grows past what select-then-bundle can hold).
