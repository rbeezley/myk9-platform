---
description: List outstanding todos and select one to work on
allowed-tools:
  - Read
  - Edit
  - Glob
---

# Check Todos

## Instructions

1. Read `OPEN-TODOS.md` in the working directory (if it doesn't exist, say "No outstanding todos" and exit).

2. Parse and display open items:
   - Scan for all `- [ ]` lines in the file
   - Group them under their parent `##` section heading
   - Skip the **Post-Fall** section entirely — do not display those items
   - If no open items remain outside Post-Fall, say "No outstanding todos" and exit
   - Display a compact numbered list:
     - Section heading (bold, not numbered)
     - Number (for selection) + bold title (the text between the first pair of `**`)
   - Prompt: "Reply with the number of the todo you'd like to work on."
   - Wait for user to reply with a number

3. Load full context for selected todo:
   - Display the complete `- [ ]` line including all description text
   - If the description mentions a plan file path, read it and summarize
   - If the description references TO-DOS.md for full context (look for `§` anchor), read TO-DOS.md, find the matching `##` section, and summarize the Problem and Solution fields

4. Check for established workflows:
   - Read `CLAUDE.md` to understand project-specific workflows and rules
   - Match the todo type to a known skill:
     - Walk/audit tasks → `qa-feature`
     - DB migration tasks → `db-push`
     - Browser automation tasks → `playwright-cli`
     - Bug investigation → `debugging-patterns`

5. Present action options to user:
   - **If matching skill found**: "This looks like [domain] work. Would you like to:\n\n1. Invoke [skill-name] skill and start\n2. Work on it directly\n3. Brainstorm approach first\n4. Put it back and browse other todos\n\nReply with the number of your choice."
   - **If no workflow match**: "Would you like to:\n\n1. Start working on it\n2. Brainstorm approach first\n3. Put it back and browse other todos\n\nReply with the number of your choice."
   - Wait for user response

6. Handle user choice:
   - **Option "Invoke skill" or "Start working"**: Remove the `- [ ]` line from `OPEN-TODOS.md` (if the `##` section becomes empty of `- [ ]` items after removal, remove the section heading too), then begin work
   - **Option "Brainstorm approach"**: Keep the line in `OPEN-TODOS.md`, invoke `/brainstorm` with the todo description as argument
   - **Option "Put it back"**: Keep the line in `OPEN-TODOS.md`, return to step 2 to display the full list again

## Display Format

```
Outstanding Todos:

**North Star — Phase 2: Walk the Golden Paths**
1. Phase 2 re-walk
2. Build `/exhibitor/check-in/:entryId` page
3. Secretary Task Timeline View

**North Star — Phase 3: Real-User Testing**
4. Phase 3 — Real-User Testing

**Phase 3 Polish**
5. Show cards: no personalized badge for logged-in users
6. Entry date missing label on MyEntriesPage

**Route & Page Audit Findings**
7. Admin / judge / club-admin interior audit
8. `/results/dashboard` Base UI button warning
9. Judge surfaces: mock/seed data

**People & Clubs CRUD**
10. People CRUD full audit
11. Clubs full CRUD audit
12. Add Club: silent validation + RLS gate as secretary

**Payments & Email**
13. Wire Up Resend API Key
14. Stripe Integration
15. Exhibitor Payments page

**Pre-Launch Housekeeping**
16. CI-gated Vercel deploys
17. Require PRs to merge into main
18. Make E2E CI jobs blocking
19. Pre-load AKC & UKC Judge Directory

Reply with the number of the todo you'd like to work on.
```
