# Codex daily commit review — 2026-11-18

## Window and baseline

Source: codex. The review covered all 55 frozen commits after `19a3b41ff55af34477cd7eb6966f063e3999cda0` through `a61b22d3ac059d80550bc1be36a5ee19bebf356a`, from 2026-11-17T07:00:29Z through 2026-11-18T05:19:59Z. The window starts at the previous cursor. Reviewed 55, unreviewed 0. Report path: `docs/qa/codex-daily-commit-review-2026-11-18.md`.

## Review and verification

All 79 focused Vitest tests passed across 13 files. Four suites covered the Finish list, handler clashes, registry deadlines and multiword dog search (41 tests). Nine covered refund amounts, premium cover regeneration, results privacy, club lookup deadlines, staff payment choices, form balances, registration notifications and ledger saves (38 tests). The review did not run the full suite, browser journeys, applied SQL, offline device replay, live email delivery, payment operations or physical print checks.

## P0 / P1

No findings recorded.

## P2 / Medium

No findings recorded.

## P3 / Low

**NCR-2026-11-18-01 — Three Finish list assertions miss the visible handler warning.** New test defect, high confidence. First and last seen November 18, one occurrence. Affects regression coverage for the secretary’s Results tab at all viewport sizes. Introduced in [PR 4079](https://github.com/rbeezley/myk9-platform/pull/4079).

The positive control finds “the same handler as another dog”. The absence checks at lines 231, 251 and 255 search for “share a handler”. That expression returns false even against the positive control’s text. CI can therefore pass if the warning persists after reassignment or appears for stale or incomplete entry data. The review observed no production failure. [Affected test at the reviewed baseline](https://github.com/rbeezley/myk9-platform/blob/a61b22d3ac059d80550bc1be36a5ee19bebf356a/apps/myk9show/src/features/results-tab/ResultsFinishRow.test.tsx#L221-L255)

Owner unassigned. Use the same accessible link selector for presence and absence. For closure, show the stale-clash assertion failing with the trust guard bypassed, then passing with it restored. Run both the component and handler-clash suites. The completed product issue retains its live positive-case evidence. [Test defect MYK9-2184](https://linear.app/myk9-platform/issue/MYK9-2184) · [Feature MYK9-2031](https://linear.app/myk9-platform/issue/MYK9-2031)

## Counts and references

New 1, unchanged 0, resolved 0, duplicate 0, rejected 0, blocked 0. Filed MYK9-2184. No filing blockers, fixes or PRs from this review. Later commits in the window addressed waitlist recipient eligibility (#4125), unknown target-trial lateness (#4118) and stale results-privacy answers (#4146). The newly filed test defect remains open at the reviewed baseline.

## Commit coverage ledger

- `b25dda317b8bb17950b5db9cd7883f2a4bcd764b` — docs(qa): complete November 17 commit review. Compared November 17 report and shared cursor with prior memory and this window start.
- `3f03215eef9b28205103d66bea8a9b2b26c8152b` — fix(premium): self-host the PDF fonts so the production CSP allows them (MYK9-2102) (#4078). Checked self-hosted WOFF imports, font registrations, manifest and production CSP regression spec.
- `4e95b7a525a2a95b097f6157c4bd54513cf5b100` — feat(results): dogs sharing a handler in a class are listed on the Finish list (MYK9-2031) (#4079). Traced handler-clash signal through trusted entries and class-filter destination, including missing-handler cases.
- `9dca92ea48401ba25d5ca449b5fdf0ef6fb4203c` — chore(agents): turn off the superpowers plugin and reroute its references (MYK9-2128) (#4081). Compared disabled plugin setting, playbook replacements and plan skill references.
- `60edbad51f99803e992c13958ed9918e70fa40f3` — fix(skills): quote the audit-pages description so its frontmatter parses (#4082). Checked YAML description quoting around the role list.
- `4d427d3e2596152c78d47d6ee410cb1cd52873fc` — chore(agents): remove the unused opsx:explore skill (MYK9-2132) (#4083). Checked removed explore command and skill against updated workflow references.
- `c1697fcd963efee96bcde0cda841634558069d03` — fix(premium): the generator prints each judge once with city, state and classes (MYK9-2056) (#4084). Reviewed show-scoped judge query, class-level rows without trial IDs, duplicate judges, deleted classes and related assertions.
- `c694318ccac2cce56d2f8878474cf50b21ea555e` — feat(email): date or venue changes email exhibitors by themselves, on one automatic job queue (MYK9-2124) (#4080). Traced show-change trigger, live-entry selection, cron auth, lease and delivery outcomes; later #4125 revises waitlist eligibility. SQL and provider not exercised.
- `43a3cf259d6dd95c72c4d0ea56db6bc3e9262084` — wip: MYK9-2135 staff with a dog entered reach Your dogs today (#4085). Checked staff ownership and unknown-ownership gate for Your dogs today.
- `751a16d588515b6b8829b54de3fee8fa80ab94d1` — feat(exhibitor): class links go to My Shows before the trial day and Ringside on it (MYK9-2134) (#4086). Compared trial-day timezone selection, missing-data fallback and routing at entry and notification callers.
- `7f25caebc0a4fe5ad720353b8f06d37aab5f89ae` — wip: MYK9-2136 class page read-only (#4087). Reviewed removal of class-page editing controls, read-only scoring cells, subscriptions and retained private-result handling.
- `2afec0b34a24fd8e26939501d05a0ccd0f771b29` — docs(deploy): watch a deploy run with gh run watch --interval 60 (#4046). Compared 60-second deploy watch in skill and settings, including exit-status propagation.
- `48481f676dc643720f8519e449959301a71de72d` — fix(print): a judge change marks printed sheets changed; hides count only on the scoresheet (MYK9-2116) (#4058). Traced assigned judges and report-specific hides through class card, Reports and packet descriptors.
- `03d7db16b24776e44b9876a5d22c9114dfb54da4` — feat(requirements): exhibitors open a class's Requirements read-only from Ringside and My Shows (MYK9-2137) (#4088). Reviewed read-only Requirements entry points, combined-class exclusion, replica lookup and dialog context.
- `ea12005bb978ba6bbc09475d666d8620efe6f893` — feat(show): a show's dates come from its trials; Show Edit links to the trial (MYK9-2131) (#4090). Reviewed first/last live trial derivation, SQL update triggers, local sync and dirty-form navigation guard.
- `90076065d07e29efd9df97deab4c7b56db422ce4` — feat(exhibitor): her own result says where she placed, and My Shows shows the running order (MYK9-2138) (#4089). Reviewed own-result release gate, placement and count formatting, and pre-run order visibility.
- `a52cb1a10877189cb82a792c242334c64b6fac65` — docs(claude): drop duplicate Issue tracker block from CLAUDE.md (#4092). Checked removal of duplicate tracker guidance from CLAUDE.md against shared Linear rules.
- `797f792f42807ea2ca25dc42c3db31e5dbbcb623` — docs(plan): archive the show-dates-from-trials plan, merged in #4090 (MYK9-2131) (#4094). Checked archived show dates plan and README registration removal against #4090.
- `6c6d14dcc777b8d0223334d34a98659324cbe73c` — refactor(print): one printed-sheet reader for the class card and Reports, no fingerprint change (MYK9-2103) (#4093). Compared shared report-entry hydration, replica subscriptions, armband backfill and printed-sheet readers across Reports and class card.
- `285e479dd7ff4c757d6eb85e98bf78072cf1f30a` — fix(seed): the Heartland demo club is seeded authorized (MYK9-2105) (#4096). Checked seeded club authorization values and conflict update preserving existing authorization.
- `77f1014f4edb37c81733455223a4dac8471a64c7` — fix(entries): name the requested class's trial on the class change line (MYK9-2129) (#4098). Reviewed source and target trial labels, same-day disambiguation and partial target facts; #4118 later corrects unknown target lateness.
- `883bd588234d2524b309fc19f66a5916ad1809b2` — refactor(show-map): delete the unused "Open Class" action (MYK9-2133) (#4100). Reviewed removal of unused Open Class action from action selection, dispatch and tree.
- `408f4434ee8b5bfbdbaab022293c68a762cb8708` — fix(print): the check-in sheet and scoresheet fingerprints hash exactly what each sheet prints (MYK9-2103) (#4101). Compared printed class header and entry facts, ordered rows, scope filters and empty-sheet handling across shared descriptor and reports.
- `f32c7728814fabaa24367e5cecf4d79f262270ae` — fix(premium): keep saved narratives when regenerate fails, never publish placeholder text (MYK9-2139) (#4095). Reviewed partial or failed generation fallback, stripping legacy placeholders and conditional PDF sections.
- `81ab38d93b3d33af63ea6027a0810c7673cb1b8d` — docs(plan): archive the printed-sheet fingerprint plan, merged in #4093 and #4101 (MYK9-2103) (#4105). Verified printed-sheet plan archive follows both reader and descriptor changes.
- `cbb83c330208dd839ccf95685eee1428a7fea563` — feat(show-desk): Ringside-style schedule card, draggable rail, leaner class panel (#4106). Reviewed keyboard and pointer rail sizing, schedule progress, queue names, lifecycle states and class-panel integration.
- `8301629bce2ff41a091c2f65874e751e26cad8ef` — fix(refunds): one count of refunds to decide; Pulls lists paid removals and no-shows; Deny works on them (MYK9-2099) (#4102). Reviewed unified pending-refund predicate, unknown metadata handling, paid removal categories, row lock and human denial RPC.
- `913fea591d6324a51b36dd51f0a126e73c7b1098` — fix(show): system-wide dog search matches a multi-word search word by word (MYK9-2026) (#4099). Reviewed multiword search filters, owner splits, relation aliases and response cleanup; #4122 adds punctuation handling.
- `84105739af288f7245fbc36106112b26bc708670` — fix(ci): the bundle budget measures the real app, and fails a build made without the environment (MYK9-2150) (#4109). Reviewed CI placeholder build environment, budget thresholds and emitted-chunk missing-environment guard.
- `31dc71788a06fc61b179e4daad58c508e897604c` — fix(class-change): Undo after Accept puts the exhibitor's request back to waiting (MYK9-2122) (#4107). Reviewed move-up reversal locks, history and stored target guard, score refusal and local restoration.
- `28e66341ee80c27932edd18245209f822a1142eb` — fix(entries): say "Amount not available" when a form's payment record is not loaded (MYK9-1968) (#4104). Reviewed missing enrollment totals across cards, both payment dialogs, footer and checklist.
- `ed8bb86318e2bf931c1790ad42802ee3b768e875` — Finish list shows each registry's results deadline (MYK9-2117) (#4110). Reviewed registry deadline applicability, local calendar arithmetic, cancellation and unknown-rule handling.
- `5d50f5992f8be22741846326a00fabe8edd32251` — fix(clubs): a pending club opens for the site admin; the clubs replica syncs in full after a different sign-in (MYK9-2153) (#4111). Reviewed replica-first club lookup, principal-scoped fallback, authorization projection and cache invalidation.
- `cab165515058170bfc389f740c121932fe13148b` — fix(email): a confirmation claim is a 15 minute lease, stamped sent only after the provider accepts (MYK9-2088) (#4113). Reviewed claim eligibility, lease expiry, provider acceptance and guarded sent/failed writes; provider and SQL execution not exercised.
- `eefd7039b2d86961211f0008878194baebcb9ca3` — feat(email): a changed judge emails the exhibitors in that judge's classes, with each registry's withdrawal rule (MYK9-2125) (#4114). Reviewed change aggregation, recipient recheck, reverted or vacant assignments and refund wording against the documented one-registry-per-show invariant.
- `2ba3cacba3663abb848e7daa1ff9597f4ac625bc` — fix(entries): a desk add-on collects only what the form still owes, and says "Already covered" when the money on the form pays for it (MYK9-1966, MYK9-2149) (#4112). Reviewed desk held-money preview, method-specific payment input, server fee and balance calculation and submission replay. No money operations run.
- `92fc7dc76218c86303fd4d32b84f6cd242d59ab5` — chore(types): regenerate database types after the 2088, 2122, 2125 and 1966 pushes; drop the desk_form_due_cents cast (#4115). Compared regenerated RPC argument and result types with desk form balance call and new lease and queue fields.
- `c2c8adb2c5cd03517913a4cf0fb0ab95901d3201` — perf(landing): the landing page starts without the signed-in app shell (MYK9-2140, trial) (#4097). Reviewed guest boot predicate, lazy router handoff, chunk-load failure path and install-prompt capture.
- `52db60959ebe73b457c9eec3e615ff35e3e81d7d` — fix(move-up): no lateness note when the requested trial is unknown (MYK9-2147) (#4118). Checked missing target trial leaves start time undefined rather than borrowing the source time.
- `c131cf8d9e70cfda71f1c75e841520a6df0e0437` — fix(akc-export): limit Scent Work results export to scent trials (MYK9-2157) (#4117). Compared eligible scent trial list for export metadata and class fetch against mixed-sport regression.
- `7e848d5cc408f4e034b3cf42bbecedfc99c58a37` — fix(entries): checklist shows form balance due whatever the entry status (#4116). Checked positive known balance drives checklist independently from entry payment flags.
- `bfc432cafae85d94ffb264710ecd82b2999ac0a4` — fix(registration): no success toast when a submission added no entries (#4119). Reviewed created, waitlisted and skipped outcome summaries and final-step notification branches.
- `d0bec76b5682cabc842904de660f295cec29c917` — fix(entries): payment and refund dialogs keep what was typed when the save fails (MYK9-2156) (#4120). Reviewed single-flight save status, distinct failure and unconfirmed messages, and draft retention across payment and refund dialogs.
- `aadef10da4a0cd70d01977cd21b761ef87aa88a9` — fix(search): a comma or parenthesis in a search no longer makes the server reject it (MYK9-2148) (#4122). Reviewed PostgREST quoted contains and LIKE escaping at dog and other search callers. Four related suites including multiword search passed 41 tests total.
- `087e0ec411dd7c99a0bdc11595b86def49ab9e90` — test: preload lazy Edit Dog panel in statusRowPlumbing (MYK9-2151) (#4123). Checked beforeAll preloads the same lazy Edit Dog panel before the timed row assertions.
- `20fe26f48293fa8014e31a8eb9227a3484943d3f` — fix(email): a date or venue change reaches exhibitors whose waitlist offer awaits payment (MYK9-2160) (#4125). Checked show-change recipient wrapper now derives from live class pairs and reviewed registration of behavioral SQL test; SQL not run.
- `adbefe5a2153423c3857ad9efd241522c67e953a` — fix(clubs): club lookup shows the retry state within 15 s (MYK9-2167) (#4128). Checked guest and signed-in fallback both use 15-second deadline and disable automatic retries.
- `91438ce5c50bf7849ca1ba99a330c59a5d851047` — fix(qa): read doubled list-marker findings in review verdict (MYK9-2169) (#4134). Reviewed doubled-marker matching and handling of active, earlier-round and pre-existing findings across review wrappers.
- `f343dd3454dc862834b898f2779d6f29450a4b13` — feat(results): ask once whether to show results publicly when a dog places (MYK9-1944) (#4132). Reviewed release, placement, consent and offline gates on both exhibitor surfaces, account-wide disclosure and later stale-answer fix in #4146.
- `fa9c8453a8fc2397304be712361930160de6c421` — fix(premium): hold edits, download and publish while Regenerate is pending (MYK9-2144) (#4126). Reviewed propagation of regeneration state through editor, form and footer, request identity and disabled edit/download/publish actions.
- `057844ff988bc078eca74030a96ecee94d776f5a` — fix(entries): each desk payment choice keeps its own check number, receipt, date and notes (MYK9-2162) (#4124). Reviewed per-choice check, cash and waiver draft seeding and active method payload; focused staff-choice suite passed.
- `9b9a1ad8dafe20b3923a5b952ac0f282f7f4eee4` — docs(plan): note Phase 3 harden-skip landed (MYK9-1789) (#4131). Compared completed harden-skip plan note with ship-it Step 3c and outstanding measurement.
- `274b8b6823f10736137507db883ed547215be203` — fix(refunds): desk refund dialog waits for the form's payment record instead of pre-filling a fee figure (MYK9-2152) (#4138). Reviewed disabled refund submission before payment data and full versus partial defaults after hydration; focused refund suite passed.
- `b034d68b6d8b93f90bcdc4393039198093d10d96` — fix(results-prompt): skip club-private shows, guard stale answers (MYK9-2174) (#4146). Reviewed club-private exclusion and conditional preference update with refetch on zero affected rows; focused selection and profile suites passed.
- `a61b22d3ac059d80550bc1be36a5ee19bebf356a` — fix(premium): bind resolved cover image to its source URL so Regenerate rebuilds the premium (MYK9-2173) (#4145). Reviewed source-URL check for resolved cover bytes and memo dependencies; focused cover regeneration suite passed.
