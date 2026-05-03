---
description: Add todo item to OPEN-TODOS.md with context from conversation
argument-hint: <todo-description> (optional - infers from conversation if omitted)
allowed-tools:
  - Read
  - Edit
  - Write
---

# Add Todo Item

## Context

- Current timestamp: !`date "+%Y-%m-%d %H:%M"`

## Instructions

1. Read `OPEN-TODOS.md` in the working directory (create it with the Write tool if it doesn't exist, using the standard heading and section structure).

2. Check for duplicates:
   - Extract key concept/action from the new todo
   - Search existing `- [ ]` lines in `OPEN-TODOS.md` for similar titles or overlapping scope
   - If found, ask user: "A similar todo already exists: [title]. Would you like to:\n\n1. Skip adding (keep existing)\n2. Replace existing with new version\n3. Add anyway as separate item\n\nReply with the number of your choice."
   - Wait for user response before proceeding

3. Extract todo content:
   - **With $ARGUMENTS**: Use as the focus/title for the todo
   - **Without $ARGUMENTS**: Analyze recent conversation to extract:
     - Specific problem or task discussed
     - Relevant file paths that need attention
     - Technical details (line numbers, error messages, root cause if identified)

4. Write the todo in two places:

   **A. Add a `- [ ]` line to `OPEN-TODOS.md`** under the most appropriate `##` section (add a new section if none fits):
   - Format: `- [ ] **[Action verb] [Component]** — [One-sentence description]. [Key files if space permits]. Full context in TO-DOS.md § "[heading]".`
   - Keep it short enough to read in a list — delegate the full detail to TO-DOS.md

   **B. Append a full-context section to the bottom of `TO-DOS.md`**:
   - **Heading**: `## Brief Context Title — YYYY-MM-DD HH:MM` (3-8 word title, current timestamp)
   - **Body**: `- **[Action verb] [Component]** - [Brief description]. **Problem:** [What's wrong/why needed]. **Files:** [Comma-separated paths with line numbers]. **Solution:** [Approach hints or constraints, if applicable].`
   - Required fields: Problem and Files (with line numbers like `path/to/file.ts:123-145`)
   - Optional field: Solution
   - Make each section self-contained for future Claude to understand weeks later

5. Confirm and offer to continue with original work:
   - Confirm the todo was saved: "✓ Saved to todos."
   - Ask if they want to continue with the original work: "Would you like to continue with [original task]?"
   - Wait for user response

## Format Example

```markdown
## Add Todo Command Improvements - 2025-11-15 14:23

- **Add structured format to add-to-todos** - Standardize todo entries with Problem/Files/Solution pattern. **Problem:** Current todos lack consistent structure, making it hard for Claude to have enough context when revisiting tasks later. **Files:** `commands/add-to-todos.md:22-29`. **Solution:** Use inline bold labels with required Problem and Files fields, optional Solution field.

- **Create check-todos command** - Build companion command to list and select todos. **Problem:** Need workflow to review outstanding todos and load context for selected item. **Files:** `commands/check-todos.md` (new), `TO-DOS.md` (reads from). **Solution:** Parse markdown list, display numbered list, accept selection to load full context and remove item.
```
