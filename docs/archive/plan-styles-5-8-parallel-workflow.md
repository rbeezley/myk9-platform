# Plan — Styles 5–8 parallel workflow + integration

The four remaining premium styles (Magazine / Poster / Gazette / Field Guide) will be implemented in **4 parallel Claude Code conversations** against 4 separate git worktrees. This doc is the meta-plan: how the parallelism works, which files are off-limits to each agent, and what the final integration session does.

## Per-style plans

| Style | Plan doc | Clone-from | Sub-folder |
|---|---|---|---|
| Magazine | [`plan-magazine-style.md`](./plan-magazine-style.md) | `features/heritage/` | `features/magazine/` |
| Poster | [`plan-poster-style.md`](./plan-poster-style.md) | `features/headline/` | `features/poster/` |
| Gazette | [`plan-gazette-style.md`](./plan-gazette-style.md) | `features/heritage/` | `features/gazette/` |
| Field Guide | [`plan-fieldguide-style.md`](./plan-fieldguide-style.md) | `features/banner/` | `features/fieldGuide/` |

Each plan opens with its own scope, file tree, tests, and the same dispatch-files prohibition. Read the plan that matches your conversation's assigned style — don't try to read all four.

## Parallelism contract

To make 4 simultaneous PRs merge cleanly with zero conflicts:

### Each agent MUST build only style-local files

Style-local territories (zero conflict risk):
- `apps/myk9show/src/features/<style>/` — everything tokens, fonts, css, landing, wizard, entry-blank, components, hooks
- `packages/email/src/templates/<Style>ConfirmationEmail.tsx`
- `packages/email/src/<style>Tokens.ts`
- `supabase/functions/send-confirmation-email/<style>-email.ts`
- All style-specific tests

### Each agent MUST NOT touch these 6 dispatch files

Editing any of these guarantees a merge conflict with the three sibling PRs:

```
supabase/functions/send-confirmation-email/email-style-registry.ts
supabase/functions/send-confirmation-email/email-style-registry.test.ts
supabase/functions/send-confirmation-email/index.ts
apps/myk9show/src/pages/ShowDetailsPage.tsx
apps/myk9show/src/components/shows/RegistrationWorkflow/WorkflowStepContent.tsx
apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx
```

### Each agent MAY append to these 2 export files

These are conflict-prone but trivially resolvable — append exports at the bottom of each file in **alphabetical order by style name** (fieldGuide → gazette → magazine → poster) so the diff hunks don't collide:

```
packages/email/src/index.ts
packages/email/src/types.ts
```

### Each agent MUST document Phase 3 dispatch wiring in their PR description

Under a header called **"Phase 3 wiring instructions"**, list exactly what the integration session needs to do to wire this style's dispatch. Example shape:

```markdown
## Phase 3 wiring instructions

### `email-style-registry.ts`
- Add `'magazine'` to `EmailBuilderKey` type union
- Change `STYLE_TO_EMAIL_BUILDER.magazine` from `'heritage'` to `'magazine'`

### `email-style-registry.test.ts`
- Update the dispatch assertion: `expect(selectEmailBuilderKey('magazine')).toBe('magazine')`

### `send-confirmation-email/index.ts`
- Add `import { buildMagazineHtml } from './magazine-email.ts';`
- Add branch: `} else if (emailBuilder === 'magazine') { html = buildMagazineHtml(emailData); }`

### `ShowDetailsPage.tsx`
- Add `import { MagazineLandingPage } from '@/features/magazine/landing/MagazineLandingPage';`
- Add branch in the styled-landing dispatch: `if (publicShowStyle === 'magazine') return <MagazineLandingPage {...landingProps} />;`
- Update `isStyledLanding` to include `'magazine'`

### `WorkflowStepContent.tsx`
- Add `import { MagazineEntryReceived } from '@/features/magazine/wizard/MagazineEntryReceived';`
- Add branch in the confirmation dispatch alongside Banner / Monogram / Headline / Heritage
- Update the `style !== 'X' && style !== 'Y'` guard to allow `'magazine'`

### `ShowDetailsPage.test.tsx`
- Add `vi.mock('@/features/magazine/landing/MagazineLandingPage', ...)`
- Add a test: `'routes Magazine-style shows to the dedicated MagazineLandingPage'`
```

The integration session reads all 4 PR descriptions and executes the union of those instructions in one commit.

## Sequence (recommended)

1. **You (orchestrator)**: This PR (`plan-docs-styles-5-8`) merges first — adds the 4 plan docs.
2. **You**: Create 4 worktrees + 4 branches off main:
   ```bash
   for s in magazine poster gazette fieldguide; do
     git worktree add -b "claude/${s}-style" ".claude/worktrees/${s}-style" main
   done
   ```
3. **You**: Launch 4 Claude Code conversations, one per worktree. Paste the relevant plan's "Starter prompt" section into each.
4. **Agents (parallel)**: Each builds their style, runs tests, opens a PR with Phase 3 instructions in the description.
5. **You**: As each agent finishes, /review the PR. If issues found, agent fixes in same session per the no-deferred-followups rule.
6. **You**: Merge the 4 PRs in any order (no conflicts; the additive `index.ts`/`types.ts` exports may need 5-second hand merges).
7. **You (or new integration session)**: Open `claude/styles-5-8-integration` off updated main. Read the 4 merged PRs' descriptions. Execute the Phase 3 wiring across the 6 dispatch files in one commit. Run typecheck + tests. PR + merge.
8. **You**: Deploy the edge function: `supabase functions deploy send-confirmation-email --no-verify-jwt` (no migration this time — none of the 4 styles need schema changes).

## Effort estimate

- **Wall-clock**: ~6–9 hours (parallel agents) + 30 min integration + 30 min /reviews = **~8–10 hours**
- **Person-hours**: ~24–36 hours of agent work in parallel (same as Banner end-to-end × 4 styles, modulo cloning efficiency)
- **API spend**: 4× normal rate during the parallel window
- **Your attention**: bottleneck on /review + answering "should I do X or Y" questions across 4 conversations. Block out a half-day to act as coordinator.

## Constraints

- **CI billing-blocked until 2026-06-01** — local typecheck + tests are the source of truth. Merge with `--admin`. Vercel previews are the meaningful "build still works" signal.
- **No migrations needed** for any of the 4 styles. Banner was the special case.
- **Edge function deploys ARE shared-system writes** — defer until after all 4 PRs merge + integration ships. One deploy at the end is cheaper and safer than four mid-flight.

## Risk register

- **Drift**: 4 agents may make different judgment calls on naming, test depth, or shared abstractions. Mitigated by the strong clone-from-this-style instruction in each plan.
- **Hidden abstractions**: if Magazine and Gazette both need a definition-list grid, neither agent will know — that's a refactor opportunity after the dust settles, NOT during.
- **Shared file conflicts on `packages/email/src/{index,types}.ts`**: each agent appends at the bottom; merge resolution is mechanical. Worst case: 5 minutes per PR.
- **Integration session may discover bugs in style-local code**: agents test their style in isolation; the integration session is the first time all 8 styles run through the same dispatch. Have each agent /review their own PR before yours to catch most issues.
- **Agent quality variance**: if one agent produces shallow tests or sloppy structure, the integration session catches it. Don't merge a PR you're not happy with.
