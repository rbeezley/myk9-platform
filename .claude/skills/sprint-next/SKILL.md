# Sprint Next

Pick up the next task from TO-DOS.md or the current sprint plan and execute it end-to-end: task → quality checks → doc update → commit → push.

## Trigger Phrases

- "what's next", "next task", "sprint next"
- "pick up a todo", "work on the next item"
- `/sprint-next`

## Step 1: Find the Next Task

Read these files in order to find available work:

1. `TO-DOS.md` in the project root
2. Any sprint plan referenced in TO-DOS.md or `docs/` (e.g., `PHASE_7_TESTING_PLAN.md`)
3. `TECHNICAL_DEBT.md` if it exists

Parse the todo items and present a numbered list:

```
Available tasks:

1. [Section heading] — [First todo title] (Files: N)
2. [Section heading] — [Second todo title] (Files: N)
3. ...

Which task would you like to work on? (number, or "1" for the first)
```

Group by section heading from TO-DOS.md. Show the bold title and file count for each item.

Wait for user selection.

## Step 2: Load Context

For the selected task:

1. Display the full todo entry (Problem, Files, Solution)
2. Read each file referenced in the todo's **Files:** field
3. Briefly summarize what each file contains and what needs to change
4. Check for related test files (look for `*.test.ts`, `*.test.tsx` alongside source files)

Present an approach:

```
Task: [title]
Files to modify: [N]
Related tests: [N]

Approach:
1. [First step]
2. [Second step]
...

Proceed? (yes/adjust)
```

Wait for user confirmation.

## Step 3: Execute the Task

Do the actual work:

- Make the code changes described in the todo
- Follow project conventions from CLAUDE.md
- If the task involves refactoring a large file, consider using the `/refactor` command pattern (parallel agents)
- Fix any TypeScript errors as you go — don't leave them for later
- Update or add tests if the changes affect testable logic

## Step 4: Quality Gate

Run the full quality check suite:

```bash
pnpm typecheck
pnpm lint
```

If either fails:
1. Read the errors
2. Fix them
3. Re-run until clean

Do NOT proceed to the next step until both pass.

## Step 5: Update Tracking Documents

### TO-DOS.md
- Remove the completed todo item from TO-DOS.md
- If removing the item leaves a section heading with no items below it, remove the entire section (heading + separator)
- Do NOT remove items that weren't worked on

### Sprint/debt documents (if applicable)
- If the task came from a sprint plan, update its status (mark complete, update dates)
- If the task came from TECHNICAL_DEBT.md, update the entry status

## Step 6: Commit and Push

Stage all changes (source files + updated tracking docs) and commit:

```bash
git add <modified-files> TO-DOS.md
git commit -m "$(cat <<'EOF'
type(scope): summary of what was done

- Why this change matters
- Reference to todo/debt item if applicable

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git push
```

Use conventional commit format. Reference the todo section title in the commit body.

## Step 7: Report and Offer Next

```
Done: [task title]

Changes:
- [file]: [what changed]
- [file]: [what changed]
- TO-DOS.md: removed completed item

Quality: ✓ typecheck | ✓ lint
Commit: [hash] (pushed)

[N] tasks remaining in TO-DOS.md. Pick up another? (yes/no)
```

If user says yes, loop back to Step 1.

## Rules

- NEVER skip the quality gate
- NEVER commit if typecheck or lint fails
- ALWAYS update TO-DOS.md after completing a task
- ALWAYS push after committing
- If a task is too large for one session, complete what you can, update TO-DOS.md with remaining work, and commit the partial progress
- If a task is blocked (missing dependencies, unclear requirements), report the blocker and move to the next item
