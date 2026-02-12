# Codebase Health Audit

Run a read-only health audit across the monorepo. Generates a report with prioritized findings — does NOT auto-fix anything.

## Trigger Phrases

- "health audit", "codebase audit", "health check"
- "run an audit", "check codebase health"
- `/health-audit`

## Workflow

### Step 1: @ts-nocheck / @ts-ignore Audit

Find all files using TypeScript escape hatches:

```bash
# Count @ts-nocheck files
grep -r "@ts-nocheck" apps/ packages/ --include="*.ts" --include="*.tsx" -l

# Count @ts-ignore comments
grep -r "@ts-ignore" apps/ packages/ --include="*.ts" --include="*.tsx" -l
```

For each file found, note the line number and what type error is being suppressed. Cross-reference against TO-DOS.md to see if already tracked.

### Step 2: `any` Type Usage

Count explicit `any` types by directory:

```bash
grep -r ": any" apps/ packages/ --include="*.ts" --include="*.tsx" -c
grep -r "as any" apps/ packages/ --include="*.ts" --include="*.tsx" -c
```

Group counts by top-level directory (e.g., `apps/myk9show/src/services/`, `apps/myk9q/src/pages/`). Flag directories with high density.

### Step 3: Console Statement Audit

Find console usage outside of LoggingService:

```bash
grep -rn "console\.\(log\|warn\|error\|debug\|info\)" apps/ packages/ \
  --include="*.ts" --include="*.tsx" \
  | grep -v "LoggingService" \
  | grep -v "node_modules" \
  | grep -v ".test."
```

Categorize by type (log/warn/error) and whether they look intentional (error boundaries, dev-only) vs leftover debugging.

### Step 4: Large File Detection

Find all .ts/.tsx files over 400 lines:

```bash
find apps/ packages/ -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -40
```

Cross-reference against the "Refactor Oversized Components" section in TO-DOS.md. Flag any NEW large files not already tracked.

### Step 5: Unused Dependencies

For each app and package with a package.json:

```bash
# List declared dependencies
node -e "const p=require('./apps/myk9show/package.json'); console.log(Object.keys(p.dependencies||{}).join('\n'))"

# Check if each is actually imported
# For each dependency, grep for its import across the app's src/
```

Flag dependencies declared in package.json but never imported in source files. Note: some deps are used indirectly (Tailwind plugins, Vite plugins, type packages) — flag but don't auto-remove.

### Step 6: TO-DOS.md Staleness Check

Read TO-DOS.md and for each item:
1. Verify the referenced files still exist
2. Verify the referenced line numbers are still approximately correct
3. Check if any referenced issues have already been fixed (e.g., a `@ts-nocheck` that was removed)

Flag stale items that reference deleted files or already-fixed issues.

## Step 7: Compile Report

Generate a report at `docs/AUDIT-REPORT.md` with this structure:

```markdown
# Codebase Health Audit Report
Generated: [date]

## Summary
| Category | Count | Trend |
|----------|-------|-------|
| @ts-nocheck files | N | (up/down/same vs last audit) |
| @ts-ignore comments | N | |
| Explicit `any` types | N | |
| Console statements | N | |
| Files over 400 lines | N | |
| Unused dependencies | N | |
| Stale TO-DOS items | N | |

## Findings by Category

### 1. TypeScript Escape Hatches
[List each file with @ts-nocheck/@ts-ignore, whether it's tracked in TO-DOS.md]

Severity: moderate | Effort: sprint-task

### 2. `any` Type Hotspots
[Top 10 directories by any-count]

Severity: low | Effort: sprint-task

### 3. Console Statements
[List files and line numbers, categorized as intentional vs leftover]

Severity: low | Effort: quick-win (for leftover debugging statements)

### 4. Large Files
[Files over 400 lines NOT already in TO-DOS.md refactoring backlog]

Severity: moderate | Effort: sprint-task per file

### 5. Unused Dependencies
[List per app/package]

Severity: low | Effort: quick-win

### 6. Stale TO-DOS
[Items referencing deleted files or already-fixed issues]

Severity: low | Effort: quick-win (just update TO-DOS.md)

## Recommended Actions
1. [Highest priority items as potential TO-DOS.md entries]
2. [Quick wins that could be fixed in 5 minutes]
3. [Items to add to next sprint]
```

## Step 8: Present Results

Show the summary table to the user and ask:
```
Audit complete. Report saved to docs/AUDIT-REPORT.md.

Quick wins found: [N] (can be fixed now)
Sprint items found: [N] (add to TO-DOS.md?)

Would you like to:
1. Fix quick wins now (console cleanup, stale todos)
2. Add sprint items to TO-DOS.md
3. Both
4. Just keep the report
```

Wait for user selection before making any changes.

## Rules

- NEVER auto-fix during the audit — report only
- NEVER modify source files without user approval
- ALWAYS cross-reference findings against TO-DOS.md to avoid duplicate tracking
- ALWAYS note when a finding is already tracked
- If a previous audit report exists, compare counts to show trends
- Keep the report factual — no speculation about "potential issues"
