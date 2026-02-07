# Git Commit with Quality Checks

This skill should be used when the user wants to commit changes, push to GitHub, or asks to "save my work" or "commit this".

## What This Skill Does

Commits and pushes changes with quality gates:

1. Runs lint and type checks (if available)
2. Shows what changed
3. Drafts a meaningful commit message
4. Stages and commits
5. Asks before pushing

## Trigger Phrases

- "commit this"
- "commit my changes"
- "push to GitHub"
- "save my work"
- "git commit"
- "commit and push"
- `/commit`

## Project Detection

First, detect the project type to determine which quality checks to run:

| File | Project Type | Quality Checks |
|------|-------------|----------------|
| `package.json` | Node.js | `npm run typecheck`, `npm run lint` |
| `pyproject.toml` | Python | `ruff check .`, `mypy .` |
| `Cargo.toml` | Rust | `cargo clippy`, `cargo check` |
| `go.mod` | Go | `go vet ./...`, `golangci-lint run` |

## Workflow

### Step 1: Quality Checks (Parallel)

**Node.js/TypeScript:**
```bash
npm run typecheck     # if script exists
npm run lint          # if script exists
```

**Python:**
```bash
ruff check .          # or flake8/pylint
mypy .                # if configured
```

**Rust:**
```bash
cargo clippy
cargo check
```

**Go:**
```bash
go vet ./...
golangci-lint run     # if installed
```

**If any check fails**: STOP and fix errors first.

**If no quality scripts found**: Skip checks, proceed with warning.

### Step 2: Review Changes
```bash
git status
git diff --stat
git diff              # for detailed changes
git log -3 --oneline  # recent commit style
```

### Step 3: Draft Commit Message

Format:
- First line: Concise summary (50 chars max), present tense
- Use conventional commit prefixes: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- Blank line
- Bullet points explaining WHY (not what)
- Focus on user/developer impact

Example:
```
feat(auth): Add session timeout handling

- Improves security by logging out inactive users
- Prevents stale data issues after long idle periods
- Users see clear message before being redirected

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Step 4: Stage and Commit
```bash
git add .
git commit -m "$(cat <<'EOF'
[commit message]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Step 5: Push (Ask First)
Ask: "Ready to push to GitHub? (yes/no)"

If yes:
```bash
git push
```

If upstream not set:
```bash
git push -u origin HEAD
```

## Important Rules

- NEVER skip quality checks if they exist
- NEVER commit if checks fail
- ALWAYS ask before pushing
- Use HEREDOC for multi-line commit messages
- Focus on "why" not "what"
- Include emoji line AND `Co-Authored-By` for AI-assisted commits
