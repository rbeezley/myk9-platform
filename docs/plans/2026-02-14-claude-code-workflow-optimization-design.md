# Claude Code Workflow Optimization

**Date:** 2026-02-14
**Status:** Approved
**Goal:** Reduce skill/command noise, persist domain knowledge across sessions, automate quality gates

## Problem

1. **Skill/command noise:** 36 custom skills (20 irrelevant) + 17 `/sc:*` commands overlapping with superpowers
2. **Context loss:** Domain knowledge and task state re-explained every session
3. **Manual quality gates:** Typecheck, lint, and push are manual steps that can be forgotten

## Design

### A. Skill & Command Cleanup

**Delete 20 generic skills** from `.claude/skills/`:
- brand-analyzer, business-analytics-reporter, business-document-generator
- csv-data-visualizer, data-analyst, docker-containerization
- finance-manager, nutritional-specialist, personal-assistant
- pitch-deck, research-paper-writer, resume-manager
- script-writer, seo-optimizer, social-media-generator
- startup-validator, storyboard-manager, travel-planner
- cicd-pipeline-generator, brainstorming (duplicate of superpowers)

**Delete entire `/sc:*` command suite** (17 commands in `.claude/commands/sc/`):
- Superpowers skills cover all this functionality

**Keep 16 project-relevant skills:**
- test-specialist, tech-debt-analyzer, supabase-postgres-best-practices
- vercel-react-best-practices, frontend-design-shadcn, performance-profiling
- codebase-documenter, writing-clearly-and-concisely
- commit, health-audit, sprint-next, verify-plan, document-skills
- + all 14 superpowers skills (plugin-managed)

**Keep root commands:**
- /add-to-todos, /check-todos, /whats-next, /arewedone, /refactor, /create-prompt, /run-prompt

### B. Domain Knowledge Memory

**New file: `memory/domain-knowledge.md`** (~90 lines)

Contents:
- Core domain model: Club → Show → Trial → Class → Entry → Result
- 6 user roles and permissions summary
- Supported organizations (AKC primary)
- Scent work rules: elements, levels, time limits, multi-area timing
- Qualification codes and NQ reasons
- Key terminology: hide, element, armband, ring, running order, trial secretary, steward
- Entry lifecycle: draft → submitted → paid → confirmed → scheduled → competing → completed
- Architecture quick reference: offline-first, state management, two-app structure

**New file: `memory/testing-patterns.md`**

Moved from MEMORY.md:
- Supabase mocking patterns
- Replication manager mocking
- Cache testing patterns
- Timer testing patterns (fake timers)
- Coverage commands

**Restructured `memory/MEMORY.md`** (~50 lines)

Session-resumable state only:
- Current phase/sprint and active work
- Last completed task + next task
- Links to domain-knowledge.md and testing-patterns.md
- Quality gate rules

### C. Hooks

**Pre-commit hook** (quality gate enforcement):
- Trigger: Before `git commit` Bash commands
- Action: `pnpm typecheck & pnpm lint & wait`
- Behavior: Block commit if either fails, show errors
- Runs typecheck and lint in parallel for speed

**Post-commit hook** (auto-push):
- Trigger: After successful `git commit`
- Action: `git push`
- Enforces CLAUDE.md rule: "always push after commit"

**Session-start hook** (context loading):
- Trigger: On session start
- Action: Display current task state from MEMORY.md
- Immediately grounds session without re-explaining

### D. `/whats-next` Enhancement

- Update command to also write task state back to MEMORY.md
- Next session picks up cleanly without needing to run `/whats-next` first

## Impact

- ~37 fewer items in skill/command list (cleaner system prompt)
- Domain knowledge persists automatically (no re-explaining)
- Quality gates enforced by hooks (no forgetting)
- Auto-push after commit (no manual step)
- Session start shows current state (immediate context)

## Files Changed

| Action | Count | Location |
|--------|-------|----------|
| Delete | ~20 | `.claude/skills/` (generic skills) |
| Delete | ~17 | `.claude/commands/sc/` (command suite) |
| Create | 1 | `memory/domain-knowledge.md` |
| Create | 1 | `memory/testing-patterns.md` |
| Modify | 1 | `memory/MEMORY.md` (restructure) |
| Modify | 1 | `~/.claude/settings.json` (hooks) |
| Modify | 1 | `.claude/commands/whats-next.md` (enhancement) |
