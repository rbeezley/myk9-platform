# Claude Code Workflow Optimization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce skill/command noise, persist domain knowledge across sessions, and automate quality gates via hooks.

**Architecture:** Configuration-only changes across Claude Code settings, memory files, skills directories, and command files. No application code changes.

**Tech Stack:** Claude Code hooks (JSON), Markdown memory files, shell scripts, Bash

---

### Task 1: Delete Generic Skills

**Files:**
- Delete: `.claude/skills/brand-analyzer/`
- Delete: `.claude/skills/business-analytics-reporter/`
- Delete: `.claude/skills/business-document-generator/`
- Delete: `.claude/skills/csv-data-visualizer/`
- Delete: `.claude/skills/data-analyst/`
- Delete: `.claude/skills/docker-containerization/`
- Delete: `.claude/skills/finance-manager/`
- Delete: `.claude/skills/nutritional-specialist/`
- Delete: `.claude/skills/personal-assistant/`
- Delete: `.claude/skills/pitch-deck/`
- Delete: `.claude/skills/research-paper-writer/`
- Delete: `.claude/skills/resume-manager/`
- Delete: `.claude/skills/script-writer/`
- Delete: `.claude/skills/seo-optimizer/`
- Delete: `.claude/skills/social-media-generator/`
- Delete: `.claude/skills/startup-validator/`
- Delete: `.claude/skills/storyboard-manager/`
- Delete: `.claude/skills/travel-planner/`
- Delete: `.claude/skills/cicd-pipeline-generator/`
- Delete: `.claude/skills/brainstorming/` (duplicate of superpowers:brainstorming)
- Delete: `.claude/skills/frontend-enhancer/` (duplicate of frontend-design-shadcn)

**Step 1: Delete all 21 generic/duplicate skill directories**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform"
rm -r .claude/skills/brand-analyzer \
  .claude/skills/business-analytics-reporter \
  .claude/skills/business-document-generator \
  .claude/skills/csv-data-visualizer \
  .claude/skills/data-analyst \
  .claude/skills/docker-containerization \
  .claude/skills/finance-manager \
  .claude/skills/nutritional-specialist \
  .claude/skills/personal-assistant \
  .claude/skills/pitch-deck \
  .claude/skills/research-paper-writer \
  .claude/skills/resume-manager \
  .claude/skills/script-writer \
  .claude/skills/seo-optimizer \
  .claude/skills/social-media-generator \
  .claude/skills/startup-validator \
  .claude/skills/storyboard-manager \
  .claude/skills/travel-planner \
  .claude/skills/cicd-pipeline-generator \
  .claude/skills/brainstorming \
  .claude/skills/frontend-enhancer
```

**Step 2: Verify remaining skills are the 13 project-relevant ones**

```bash
ls .claude/skills/
```

Expected output (13 directories):
```
codebase-documenter
commit
document-skills
frontend-design-shadcn
health-audit
performance-profiling
sprint-next
supabase-postgres-best-practices
tech-debt-analyzer
test-specialist
vercel-react-best-practices
verify-plan
writing-clearly-and-concisely
```

**Step 3: Commit**

```bash
git add .claude/skills/
git commit -m "chore: remove 21 generic/duplicate skills to reduce noise"
```

---

### Task 2: Delete /sc:* Command Suite

**Files:**
- Delete: `.claude/commands/sc/` (entire directory, 17 files)

**Step 1: Delete the sc directory**

```bash
rm -r "/Users/richardbeezley/AI Projects/myk9-platform/.claude/commands/sc"
```

**Step 2: Verify remaining root commands**

```bash
ls .claude/commands/
```

Expected output (7 files):
```
add-to-todos.md
arewedone.md
check-todos.md
create-prompt.md
refactor.md
run-prompt.md
whats-next.md
```

**Step 3: Commit**

```bash
git add .claude/commands/
git commit -m "chore: remove /sc:* command suite — superpowers covers this"
```

---

### Task 3: Create Domain Knowledge Memory File

**Files:**
- Create: `~/.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/domain-knowledge.md`

**Step 1: Write the domain knowledge file**

Create the file with the following content. This is the persistent domain reference that loads every session:

```markdown
# myK9 Platform — Domain Knowledge

## Entity Hierarchy

```
Club → Show → Trial → Class → Entry → Result/Score
```

- **Club**: Organization managing shows
- **Show**: Event container (date, location, fees, status)
- **Trial**: Competition instance within a show
- **Class**: Division defined by sport + element + level
- **Entry**: Dog registration in a class (links dog → class → handler)
- **Result/Score**: Outcome (qualification status, time, placement)

## User Roles

| Role | Access | Typical Actions |
|------|--------|-----------------|
| Exhibitor | Own entries/dogs, published shows | Enter dogs, view results |
| Steward | Assigned ring entries | Manage entry status, ring flow |
| Judge | Assigned ring entries | Score entries |
| Trial Secretary | Show-level entries | Entries, armbands, results, waitlist |
| Club Admin | All club shows | Club profile, show management |
| Platform Admin | Everything | Full system access |

## Organizations

Primary: **AKC** (American Kennel Club). Also supports: UKC, ASCA, NACSW, CPE, USDAA, NADAC, FCI.

## Scent Work (Primary Sport)

**Elements:** Container, Interior, Exterior, Buried, Handler Discrimination
**Levels:** Novice → Advanced → Excellent → Masters

| Element | Novice | Advanced | Excellent | Masters |
|---------|--------|----------|-----------|---------|
| Container | 2:00 | 2:30 | 3:00 | 3:00 |
| Interior | 3:00 | 3:30 | 4:00/area | Varies |
| Exterior | 3:00 | 3:30 | 4:00 | 4:00 |
| Buried | 3:00 | 3:30 | 4:00 | 4:00 |

- **Multi-area timing:** Interior Excellent (2 areas) and Masters (3 areas) have per-area timers
- **Masters rules:** No warnings to handlers, unknown number of hides
- **Qualification:** Find = Q (pass). Fail reasons: timeout, wrongIndication, handlerError, noFind, absent

## Entry Lifecycle

```
draft → submitted → paid → confirmed → scheduled → competing → completed
                                      ↘ withdrawn
                                      ↘ scratched (day-of, preserves data)
```

## Qualification Codes

- **Q / Qualified**: Pass
- **NQ**: Not Qualified (with specific reason)
- **E / Excused**: Valid excuse
- **EX / Eliminated**: Rule violation
- **DQ**: Disqualified
- **ABS / Absent**: Did not compete
- **WD / Withdrawn**: Handler withdrew

## Key Terminology

- **Hide**: Scent source location for dog to find
- **Element**: Category of Scent Work (Container, Interior, etc.)
- **Armband/Bib**: Visible number worn by handler during run
- **Ring**: Physical competition space
- **Running Order**: Sequence of entries in a class
- **Entry Close**: Deadline for accepting entries
- **Trial Secretary**: Staff managing entries and logistics
- **Steward**: Assists judge, manages ring flow and entry status

## Architecture

- **myK9Show** (`apps/myk9show/`): Full show management app (React + Vite + shadcn/ui)
- **myK9Q** (`apps/myk9q/`): Lightweight scoring app (React + Vite, offline-first)
- **Offline-first**: IndexedDB + Supabase sync via `@myk9/replication` (myK9Q)
- **State**: Zustand (client), React Query (server state, myK9Show), Replication (offline, myK9Q)
- **Database**: Supabase with 56 tables, 124 RLS policies
- **Shared packages**: `@myk9/core`, `@myk9/replication`, `@myk9/supabase`, `@myk9/ui`, `@myk9/scoring`, `@myk9/scoring-ui`
```

**Step 2: Verify the file is readable**

```bash
wc -l ~/.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/domain-knowledge.md
```

Expected: ~85-95 lines

---

### Task 4: Create Testing Patterns Memory File

**Files:**
- Create: `~/.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/testing-patterns.md`

**Step 1: Write the testing patterns file**

Move the testing reference material from MEMORY.md to its own file:

```markdown
# Testing Patterns & Commands

## Mocking Patterns

### Supabase with RPC
```typescript
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));
```

### Replication Manager
```typescript
vi.mock('../replication/ReplicationManager', () => ({
  getReplicationManager: vi.fn(),
}));
```

### Cache Testing
```typescript
const mockEntriesTable = {
  get: vi.fn().mockResolvedValue({ /* entry data */ }),
  set: vi.fn().mockResolvedValue(undefined),
};

vi.mocked(getReplicationManager).mockReturnValue({
  getTable: vi.fn().mockReturnValue(mockEntriesTable),
} as any);
```

### Fake Timers
```typescript
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const promise = asyncFunction();
await vi.runAllTimersAsync();
await promise;
```

## Coverage Commands

```bash
# Specific service test with coverage
cd apps/myk9q
npm test -- src/services/entry/entryStatusManagement.test.ts --coverage --run

# All service tests
npm test -- src/services --coverage --run

# Store tests
npm test -- src/stores --coverage --run

# Watch mode
npm test -- src/services/entry/entryStatusManagement.test.ts --watch
```
```

**Step 2: Verify the file is readable**

```bash
wc -l ~/.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/testing-patterns.md
```

Expected: ~55-60 lines

---

### Task 5: Restructure MEMORY.md

**Files:**
- Modify: `~/.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/MEMORY.md`

**Step 1: Rewrite MEMORY.md as session-state only**

Replace the entire file with:

```markdown
# myK9 Platform — Session State

> See also: [domain-knowledge.md](domain-knowledge.md) | [testing-patterns.md](testing-patterns.md)

## Current Phase

**Phase 7: Testing & Validation** (in progress)

## Completed Work

### Tier 1: Critical Services (COMPLETE)
- subscriptionCleanup.ts — 100% coverage
- announcementService.ts — 88.26% coverage
- entryStatusManagement.ts — 95.55% coverage

### Tier 2: Zustand Stores (IN PROGRESS)
- entryStore.ts — 100% coverage (101 tests) ✅
- scoringStore.ts — pending
- timerStore.ts — pending

## Last Completed Task

entryStore.ts test suite — 101 comprehensive tests, 100% coverage (2026-02-08)

## Next Task

scoringStore.ts — Scoring session management tests (target: 50% coverage)

## Quality Gate Rules

- Fix ALL errors found during typecheck/lint, even pre-existing ones.
- Never skip or ignore errors just because they weren't introduced by the current change.
```

**Step 2: Verify line count is under 50**

```bash
wc -l ~/.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/MEMORY.md
```

Expected: ~35-40 lines

---

### Task 6: Add Hooks to Settings

**Files:**
- Modify: `~/.claude/settings.json`

**Step 1: Read current settings file**

Read `~/.claude/settings.json` to get the latest version (already read above).

**Step 2: Add three hooks to the hooks object**

Add `PreToolUse` (pre-commit), `PostToolUse` (post-commit), and `SessionStart` hooks alongside the existing `Notification` hook.

The hooks object in `~/.claude/settings.json` should become:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code needs your attention\" with title \"Claude Code\" sound name \"Submarine\"'"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "input=$(cat); command=$(echo \"$input\" | jq -r '.tool_input.command // empty'); if echo \"$command\" | grep -qE '^git commit'; then cd \"$(echo \"$input\" | jq -r '.cwd')\" && pnpm typecheck & pnpm lint & wait; fi"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "input=$(cat); command=$(echo \"$input\" | jq -r '.tool_input.command // empty'); exit_code=$(echo \"$input\" | jq -r '.tool_result.exit_code // 1'); if echo \"$command\" | grep -qE '^git commit' && [ \"$exit_code\" = \"0\" ]; then cd \"$(echo \"$input\" | jq -r '.cwd')\" && git push 2>&1; fi"
          }
        ]
      }
    ]
  }
}
```

**Important implementation notes:**
- The `PreToolUse` hook reads stdin as JSON, extracts the command, checks if it starts with `git commit`, and if so runs `pnpm typecheck & pnpm lint & wait` in parallel. Non-zero exit blocks the commit.
- The `PostToolUse` hook checks if the command was `git commit` AND succeeded (exit_code 0), then runs `git push`.
- Both hooks use `jq` to parse the JSON input from Claude Code.
- The `cwd` field from the hook input ensures commands run in the correct directory.

**Step 3: Verify the JSON is valid**

```bash
cat ~/.claude/settings.json | jq .
```

Expected: Valid JSON output with all three hook types.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: add pre-commit, post-commit, and session-start hooks"
```

---

### Task 7: Enhance /whats-next Command

**Files:**
- Modify: `.claude/commands/whats-next.md`

**Step 1: Add MEMORY.md update instruction to whats-next**

Append the following section to the end of the existing `whats-next.md` file, before the closing output format section:

```markdown
## Memory Update

After writing the handoff document, also update the session state in the persistent memory file at `~/.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/MEMORY.md`:

1. Update "Last Completed Task" with the most recently finished work
2. Update "Next Task" with the first item from work_remaining
3. Update completion status tables if any tier/phase items were completed
4. Keep the file concise (under 50 lines)

This ensures the next session starts with accurate state without needing to read the handoff document.
```

**Step 2: Verify the file reads correctly**

```bash
wc -l "/Users/richardbeezley/AI Projects/myk9-platform/.claude/commands/whats-next.md"
```

Expected: ~120-125 lines (original 108 + ~15 new lines)

**Step 3: Commit**

```bash
git add .claude/commands/whats-next.md
git commit -m "feat: enhance /whats-next to update MEMORY.md session state"
```

---

### Task 8: Final Verification

**Step 1: Verify skill count**

```bash
ls "/Users/richardbeezley/AI Projects/myk9-platform/.claude/skills/" | wc -l
```

Expected: 13

**Step 2: Verify commands — no sc directory**

```bash
ls "/Users/richardbeezley/AI Projects/myk9-platform/.claude/commands/"
```

Expected: 7 .md files, no `sc` directory

**Step 3: Verify memory files exist**

```bash
ls ~/.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/
```

Expected: `MEMORY.md`, `domain-knowledge.md`, `testing-patterns.md`

**Step 4: Verify settings JSON is valid**

```bash
cat ~/.claude/settings.json | jq .hooks
```

Expected: JSON with `Notification`, `PreToolUse`, and `PostToolUse` keys

**Step 5: Verify all changes are committed and pushed**

```bash
git status && git log --oneline -5
```

Expected: Clean working tree, recent commits for skills cleanup, commands cleanup, hooks, and whats-next enhancement.
