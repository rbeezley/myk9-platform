# Plan verification

> **Status:** Active

| Requirement                                          | Coverage | Evidence                         |
| ---------------------------------------------------- | -------- | -------------------------------- |
| Actual fee-card action and exact cart items/total    | Covered  | design Decisions; tasks 1.1      |
| Empty hydration must fail                            | Covered  | design Risks; tasks 1.2          |
| Both balances after existing payment                 | Covered  | design Decisions; tasks 2.1–2.2  |
| No repeat payment or shared-row reset                | Covered  | proposal Non-goals; design Risks |
| Failed login / changed fixture / transport isolation | Covered  | design Risks                     |
| Testing, tracking and release evidence               | Covered  | tasks 3.1–3.3                    |

Coverage: 90/100 → 100/100 after explicitly adding changed-fixture and failed-login handling. No spec-level change; skip_specs is deliberate. This OpenSpec change is the sole plan, so it is not duplicated in docs/README.md. Validation profile: low / focused, tests and evidence only. The user explicitly requested implementation; proceed under that authorization.
