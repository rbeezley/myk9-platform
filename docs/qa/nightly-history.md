# Nightly QA History

Track scheduled Nightly outcomes here until a more automated report exists. Keep entries short, evidence-backed, and tied to `docs/qa/findings.md` when failures repeat.

## Entry Template

```markdown
### YYYY-MM-DD

- **Playwright command:** pass | fail | skipped
- **Route sweep:** pass | fail | partial | skipped
- **Active specs:** passed/total
- **Failures:** spec or route, trace/screenshot path, finding id
- **Fixes made:** file paths or none
- **Demotions/promotions:** suite map changes or none
- **Notes:** timeout, missing credentials, known environmental issue, or follow-up
```

## History

### 2026-05-12

- **Playwright command:** pass
- **Route sweep:** scheduled for overnight run
- **Active specs:** 25/25
- **Failures:** none
- **Fixes made:** Wave 1 Playwright repairs and QA docs before scheduling
- **Demotions/promotions:** promoted Wave 1 specs into `Nightly Active`
- **Notes:** Verified locally with `--retries=0`: `25 passed (1.1m)`
