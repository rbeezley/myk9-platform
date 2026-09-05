---
name: setup-pre-commit
description: Set up Husky pre-commit hooks with lint-staged (Prettier), type checking, and tests in the current repo. Use when user wants to add pre-commit hooks, set up Husky, configure lint-staged, or add commit-time formatting/typechecking/testing.
---

# Setup Pre-Commit Hooks

## What This Sets Up

- **Husky** pre-commit hook
- **lint-staged** running Prettier on all staged files
- **Prettier** config (if missing)
- **typecheck** and **test** scripts in the pre-commit hook

## Steps

### 1. Detect package manager

Check for `package-lock.json` (npm), `pnpm-lock.yaml` (pnpm), `yarn.lock` (yarn), `bun.lockb` (bun). Use whichever is present. Default to npm if unclear.

### 2. Install dependencies

Install as devDependencies:

```
husky lint-staged prettier
```

### 3. Initialize Husky

**First, look at what the repo already runs on commit.** `husky init` sets
`core.hooksPath` to `.husky/_`, and a hooks path is not additive — whatever
was there stops running, silently, with no error and no mention in the husky
output. A repo with its own `.githooks` is the common case, and those hooks
are usually the load-bearing ones (this repo's `.githooks/pre-commit`
enforces the worktree rule that keeps concurrent agents from committing to
the primary checkout).

```bash
git config --get core.hooksPath   # empty, .githooks, or something else?
ls -la .githooks/ 2>/dev/null     # what would stop running?
```

If either turns up an existing hook, say so before continuing and chain it in
step 4 rather than replacing it.

```bash
npx husky init
```

This creates `.husky/` dir and adds `prepare: "husky"` to package.json.

### 4. Create `.husky/pre-commit`

Write this file (no shebang needed for Husky v9+):

```
# Chain any pre-existing hook FIRST — husky's hooks path displaced it, and
# it has to keep failing the commit exactly as it used to. `|| exit $?`,
# never `|| true`: a swallowed exit code here turns the guard into a no-op
# that still looks installed.
if [ -x .githooks/pre-commit ]; then
  .githooks/pre-commit || exit $?
fi

npx lint-staged
npm run typecheck
npm run test
```

**Adapt**: Replace `npm` with detected package manager. If repo has no `typecheck` or `test` script in package.json, omit those lines and tell the user. Drop the chaining block only if step 3 found no existing hook — and if the displaced hook lives somewhere other than `.githooks/pre-commit`, point it at that path instead.

### 5. Create `.lintstagedrc`

```json
{
  "*": "prettier --ignore-unknown --write"
}
```

### 6. Create `.prettierrc` (if missing)

Only create if no Prettier config exists. Use these defaults:

```json
{
  "useTabs": false,
  "tabWidth": 2,
  "printWidth": 80,
  "singleQuote": false,
  "trailingComma": "es5",
  "semi": true,
  "arrowParens": "always"
}
```

### 7. Verify

- [ ] `.husky/pre-commit` exists and is executable
- [ ] `.lintstagedrc` exists
- [ ] `prepare` script in package.json is `"husky"`
- [ ] `prettier` config exists
- [ ] Run `npx lint-staged` to verify it works

### 8. Commit

Stage all changed/created files and commit with message: `Add pre-commit hooks (husky + lint-staged + prettier)`

This will run through the new pre-commit hooks — a good smoke test that everything works.

## Notes

- Husky v9+ doesn't need shebangs in hook files
- `prettier --ignore-unknown` skips files Prettier can't parse (images, etc.)
- The pre-commit runs lint-staged first (fast, staged-only), then full typecheck and tests
