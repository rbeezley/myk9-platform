---
description: Verify work is complete, run structural review, then commit
---

# Are We Done?

Complete verification checkpoint before claiming work is done. Evidence before assertions.

## 1. Functional Verification

**Run ALL verification commands and confirm output before proceeding.**

Run these commands (as applicable to the project):
- `pnpm test` or equivalent - all tests must pass
- `pnpm build` or equivalent - build must succeed
- `pnpm typecheck` or equivalent - no type errors
- `pnpm lint` or equivalent - no lint errors

**Gate check:**
- Did you RUN each command (not assume)?
- Did you READ the full output?
- Did you CONFIRM zero failures/errors?

If ANY verification fails: STOP. Fix the issues first. Do not proceed.

## 2. Structural Completeness Review

Launch the `structural-completeness-reviewer` agent to verify:
- Changes are fully integrated
- Old code is properly removed
- No technical debt introduced
- Structural integrity maintained

## 3. Address Issues

After both verifications complete, immediately fix any issues found:
- Test failures
- Build errors
- Structural problems
- Dead code that should be removed

If fixes were needed, return to Step 1 and re-verify.

## 4. Commit

Only after Steps 1-3 pass cleanly:

Create a conventional commit for all completed changes.

---

**Remember:** "Should pass" is not evidence. "Looks correct" is not verification. Run the commands. Read the output. Then claim success.
