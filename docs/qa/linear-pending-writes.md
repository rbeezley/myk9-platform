# Linear pending writes

Findings that could not be filed because Linear was unreachable. **Reconcile and
delete each entry once it is in Linear** — this file exists so a finding is never
lost to an outage, not as a second tracker.

Rule of record: `docs/agents/issue-tracker.md`. Dedupe with `includeArchived: true`
before filing, since Done issues auto-archive.

When reconciling after an outage, remember that a **timed-out write may still have
landed**. Check by creation time as well as by content before re-filing: on
2026-09-05 a `save_issue` timed out and created nothing, which was only provable by
listing every issue created that day and finding the gap.

---

_No pending writes._
