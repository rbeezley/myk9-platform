# Archive summary: explicit-scoresheet-ring-start

- **Tracking:** [MYK9-1779](https://linear.app/myk9-platform/issue/MYK9-1779), Done 2026-11-12.
- **Implementation PR:** https://github.com/rbeezley/myk9-platform/pull/3814, squash `ae87e1ab1`, merged 2026-11-12. Adversarial gate: 2 lenses (show-day ring state; merge correctness and test integrity), no actionable defects. CI green, including the isolated ringside phone walk and show-day verification.
- **Follow-up PR:** https://github.com/rbeezley/myk9-platform/pull/3827, squash `1a2c528a9`, merged 2026-11-12. The live check of #3814 found that Start, then the phone's Back, then Discard looped on the "Discard this score?" prompt (a shared unsaved-changes dialog reset its router blocker inside React Router's POP replay window). Adversarial gate: 2 lenses, no actionable defects; a mutation check confirmed the new test fails without the fix.
- **Deploy:** Deploy myK9Show run 43318569669 put `1a2c528a9` live on myk9show.com.
- **Production acceptance (2026-11-12, test secretary, 375×812, Heartland Container Novice A, Cooper #105):** opening the sheet and pressing Back left `checked-in` unchanged; Start, then Cancel, then Discard restored `checked-in`; Start, then Back, then Discard returned to the class list and restored `checked-in` with no ring time.
- **Specs:** delta spec promoted to `openspec/specs/explicit-scoresheet-ring-start/spec.md` (new capability; the generated placeholder Purpose was replaced).
- **Proof:** `pnpm qa:openspec-proof` passed for all three scenarios before archiving.
