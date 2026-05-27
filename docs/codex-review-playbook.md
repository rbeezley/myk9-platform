# Codex review playbook

Paste-ready instructions for any agent (Claude, sub-agent, future-you)
on how to auto-review PRs with the local Codex CLI. Lives here so it's
discoverable when an agent lands in this repo cold.

Validated against this workflow across PRs A–E1d (10 PRs, 9 clean
Codex passes, 2 substantive findings caught that Claude self-review
and typecheck missed).

---

## Command

```bash
codex review --commit <SHA> --title "<your PR title>"
```

- `<SHA>` is the commit you just pushed (`git rev-parse HEAD`).
- Codex reads the diff, runs relevant verifications (typecheck,
  focused tests), and returns a structured review.
- Typical runtime: 30–90 seconds.
- Codex uses your local `~/.codex/config.toml` auth — no extra setup
  if you've already run `codex login` once.

Codex CLI runs the same underlying review as the `/codex:review` slash
command — same backend, same model — but invocable via Bash without
any plugin setup.

## Prerequisites (one-time check)

```bash
codex --version    # confirms CLI is installed
codex doctor       # diagnoses config / auth / runtime issues
```

If `codex` is not on PATH, install with `npm i -g @openai/codex` (or
the team's preferred install path).

## Workflow

1. Push your PR branch.
2. Run `codex review --commit $(git rev-parse HEAD) --title "<PR title>"`.
3. **Paste the full Codex output verbatim** into your response — do
   not summarize. The user spot-checks based on the full text.
4. Branch on the result:
   - **No findings + mechanical PR** (file moves, import rewires, no
     logic change): merge directly without waiting for user merge
     ack. State "mechanical merge" explicitly so the user knows.
   - **No findings + substantive PR** (new logic, DI design, behavior
     change): ping the user for explicit merge ack.
   - **Findings**: address them. If fix is mechanical, push the fix
     and re-run Codex. If fix involves design decisions, propose the
     strategy to the user before implementing.

The "mechanical merge" pre-auth above is project-specific to this
repo's current Phase 0 ringside extraction workflow. On other
projects, default to "ping user for merge ack on all PRs" unless
the user explicitly grants the same pre-auth.

## What NOT to use

- **`codex:codex-rescue` subagent** — designed for "go investigate
  this problem," its output stream doesn't surface review findings
  cleanly back to the caller. Output file typically shows only thread
  bookkeeping (`[codex] Turn started.`) with no review content.
- **`/codex:review` slash command** — works, but requires the
  `codex@openai-codex` plugin to be enabled in
  `~/.claude/settings.json`'s `enabledPlugins` map. Direct CLI is
  equivalent quality with zero setup.

## Other useful flags

- `--uncommitted` — review staged + unstaged + untracked changes
  (useful pre-commit)
- `--base <branch>` — review changes against a base branch (useful
  for stacked PRs)
- See `codex review --help` for the rest

## Trust calibration

Codex reviews are independent of Claude's reasoning, so they catch a
class of bugs — runtime CSS contract violations, silent data loss,
security gaps, environment-coupling issues — that typecheck, build,
and Claude self-review can miss.

Documented examples from this repo:

- **PR #389 (E1b)** — Claude moved a JSX component using both Tailwind
  utility classes and semantic CSS classes. Self-review and typecheck
  passed. Codex flagged that the semantic classes' CSS rules lived in
  a host file that the package didn't ship, so consumers would render
  broken styling. Real runtime bug, invisible to compilation.

- **PR #392 (E1c)** — Claude moved a hook with a `try/catch` recovery
  path and wrote tests that documented the existing (broken) catch
  behavior as if it were correct. Codex flagged that the catch silently
  dropped subsequent writes after a malformed-storage load. Self-review
  missed it because Claude described what the code did rather than
  asking what it should do.

Treat findings as authoritative. Don't dismiss a Codex finding without
verifying the code does what Codex says. If you disagree, write a
counter-test that proves your interpretation before pushing back.

## Self-review pattern Codex pairs well with

The cheap pre-Codex steps that catch most issues before Codex even
sees the diff:

1. **Audit-first**: spend 10–15 minutes inventorying the change's
   actual scope before writing code. Catches scope-creep early, when
   the cost of pivoting is conversation rather than diff revert.
2. **Run typecheck before push**: `pnpm typecheck` or equivalent.
   Catches missing exports, broken imports, and (in stricter package
   tsconfigs) `noUncheckedIndexedAccess` errors that the host app's
   looser config would let slide.
3. **Run tests before push**: full test suite or at least the package
   you touched.
4. **Spot the `vi.mock` paths**: when moving a file, re-grep for
   `vi.mock` targets pointing at the old path. Easy to miss, silent
   failure mode.
5. **For JSX moves: enumerate every `className=` string**: separate
   Tailwind utilities (scannable by the package's content config) from
   semantic CSS classes (rules must travel with the file). PR #389's
   bug was this exact category.

Each layer catches what the others miss. The combination keeps user
review surface area small without compromising on quality.
