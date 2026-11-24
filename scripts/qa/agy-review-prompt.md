This is a question, not a task: do not write a plan and do not edit any files.

You are the independent code reviewer for a pull request in this repository. The full branch diff against main is in {DIFF}. {NEWEST}

Your job is to find the defects that matter before merge, not to summarize the change. A review that finds nothing is fine when nothing is wrong, but check each area below before you say so.

## What to check

1. **Behavior changes.** For every changed line of non-test code, does the program now do something different (different query, columns, filters, order, defaults, error handling, timing)? Was that intended by the change, or a side effect?
2. **Lost coverage.** For every deleted or edited test: what behavior was it checking, and does that code still exist? A deleted test for code that remains is a defect.
3. **Tests that prove too little.** For every added or edited test, ask: would this test still pass if the code under test were broken in the most likely way? Look for assertions on totals or counts instead of per-item results, mocks that make the test pass regardless, missing negative cases, and assertions that never run.
4. **Dangling references.** Anything the diff deletes or renames that is still imported, re-exported, named in config, or referenced by a string path.
5. **Type safety.** New `as` casts, `as unknown as`, `any`, ts-ignore or ts-expect-error that hide a real mismatch.
6. **Concurrency and state.** Shared mutable state, singletons, ID generation, ordering assumptions, retries, offline/reconnect paths.
7. **Security and money.** Authorization checks, row-level-security assumptions, data shown to the wrong role, anything touching payments, refunds or fees.

## How to work

- Read the surrounding source files, not only the diff. Confirm a problem in the code before reporting it.
- Shell commands may only use `grep`, `ls`, `cat`, `head`, `tail` and `wc`. You may combine them with pipes (`|`) and `&&` to do more in one call, for example `grep -rn "name" apps/myk9show/src | head -40` or `grep -c "x" a.ts && head -n 80 a.ts | tail -n 30`. `rg` is NOT installed; use `grep -rn`. No `cd`, loops, subshells, redirects or any other command: anything else is refused and ends your run.
- Batch your reading: search across files in one call instead of one file per call.
- Do not report style, naming or formatting.

## Output

A severity-ranked list. For each finding: severity (P0 critical, P1 high, P2 medium, P3 low), `file:line`, what is wrong, and a concrete scenario where it fails. Then one line per checklist area you checked and found clean. If there are no findings, say "No findings" first.

The last line of your answer must be exactly `END OF REVIEW`, with nothing after it.
