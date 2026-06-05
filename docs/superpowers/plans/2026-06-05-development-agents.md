# Development Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable development agent definitions that support launch-readiness work without duplicating existing skills.

**Architecture:** Agent definitions live under `.agents/agents/` as portable Markdown prompts. Each file describes a bounded delegated role, when to use it, what inputs it expects, what it must inspect, and what output it returns.

**Tech Stack:** Markdown project artifacts, Codex sub-agent prompts, existing myK9 planning and review conventions.

---

### Task 1: Agent Directory And Index

**Files:**
- Create: `.agents/agents/README.md`

- [ ] **Step 1: Create the agent index**

Create `.agents/agents/README.md` with the directory purpose, the agent-vs-skill distinction, and the five initial agent entries.

- [ ] **Step 2: Verify the index has no unresolved markers**

Run: `rg "TO[D]O:|T[B]D|coming[ ]soon" .agents/agents/README.md`

Expected: no matches.

### Task 2: Launch-Risk Review Agents

**Files:**
- Create: `.agents/agents/offline-reliability-reviewer.md`
- Create: `.agents/agents/ux-consolidation-reviewer.md`
- Create: `.agents/agents/show-day-workflow-qa.md`

- [ ] **Step 1: Create the offline reliability reviewer**

The agent must focus on replication-backed reads, mutation-manager paths, direct Supabase exceptions, schema verification, and sync/offline risks.

- [ ] **Step 2: Create the UX consolidation reviewer**

The agent must enforce `docs/INTENT.md`, the current consolidation phase, and the duplication question before accepting new UI surface area.

- [ ] **Step 3: Create the show-day workflow QA agent**

The agent must inspect secretary/ring/scoring/class-status flows through the fall 2026 launch-readiness lens and recommend focused verification.

- [ ] **Step 4: Verify no unresolved markers**

Run: `rg "TO[D]O:|T[B]D|coming[ ]soon" .agents/agents/offline-reliability-reviewer.md .agents/agents/ux-consolidation-reviewer.md .agents/agents/show-day-workflow-qa.md`

Expected: no matches.

### Task 3: Delivery-Gate Agents

**Files:**
- Create: `.agents/agents/db-migration-sanity.md`
- Create: `.agents/agents/pr-finish.md`

- [ ] **Step 1: Create the DB migration sanity agent**

The agent must require inventory of referenced role/config/link tables before migration fixes and must not perform shared-system writes.

- [ ] **Step 2: Create the PR finish agent**

The agent must run or recommend focused tests, typecheck, tracking-doc updates, branch/worktree hygiene, and final risk reporting.

- [ ] **Step 3: Verify no unresolved markers**

Run: `rg "TO[D]O:|T[B]D|coming[ ]soon" .agents/agents/db-migration-sanity.md .agents/agents/pr-finish.md`

Expected: no matches.

### Task 4: Final Validation

**Files:**
- Read: `.agents/agents/*.md`

- [ ] **Step 1: List created files**

Run: `find .agents/agents -maxdepth 1 -type f | sort`

Expected: README plus five agent definitions.

- [ ] **Step 2: Check repository status**

Run: `git status --short`

Expected: only the new plan and agent files are changed.
