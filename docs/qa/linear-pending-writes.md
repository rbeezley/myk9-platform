# Linear writes pending a reachable connector

> **Status:** Active — delete this file once every item below is applied.

Corrections and tracker actions that were **written but never filed**, because the Linear connector
was unreachable from the sessions that produced them. They live here so they are not lost on a
laptop, and so a false claim does not sit unchallenged in the tracker.

`plugin:linear:linear` shows as connected at the CLI (`claude mcp list`) but has not been enabled
for the recent working sessions — `ListPlugins` returns nothing for it and `ToolSearch "+linear"`
finds no tools, so no Linear tool is callable. Enabling the plugin (via `/mcp` in an interactive
terminal) is what unblocks all of this.

**Apply an item, then delete it from this file.** When the file is empty, delete the file and its
row in [`../README.md`](../README.md).

| # | Issue | Action | Blocked since |
| - | ----- | ------ | ------------- |
| 1 | MYK9-365 | Replace the final description section | 2026-09-04 |
| 2 | MYK9-372 | Add a new comment | 2026-09-04 |
| 3 | MYK9-289 | Decide: reopen, or file the harness defect separately | 2026-09-04 |

Items 1 and 2 are verbatim paste-ready. Item 3 is a judgement call that needs the issue read first.

---

## 1. MYK9-365 — REPLACE the final section of the description

Find the section titled **"Known residual, not covered here"** at the bottom of the
description and replace it entirely with:

```markdown
## Residual investigated and CLOSED — the chip does not misreport

An earlier version of this issue flagged that `ReplicationSyncProvider`'s
`lastSyncAt` is in-memory only (`useState(null)`, set only on a successful sync),
and that the at-show readiness chip keys "offline ready" off it — so it _should_
report not-ready on a cold offline boot even with data in IndexedDB.

**Measured, and it does not.** Cold offline boot on `/at-show/:showId` with a fully
primed device and IndexedDB deliberately left intact:

    DBG_PRIMED_ONLINE:        ready badge visible
    DBG_AFTER_OFFLINE_RELOAD: {notReadyVisible:false, readyVisible:true, mainTextLen:770}

The chip correctly reports **"offline ready"**. The code-level reasoning that
predicted otherwise (`triggerSync` returns early offline, so `lastSyncAt` stays
null, so `ready` is false) is wrong somewhere not yet traced — something sets that
state on the boot path.

A second inference collapses with it: I had reasoned that the committed test
_"the readiness badge tells the truth when the device is NOT primed"_ must be
vacuous, since it wipes IndexedDB and then asserts not-ready. That test passes in
CI **and** a primed device stays ready, so the chip genuinely distinguishes the two.
The test is sound. No issue to file.
```

---

## 2. MYK9-372 — ADD a new comment

The earlier closure comment's second "Risks / remaining work" bullet makes the same
false claim. Post this as a new comment (do not silently edit the old one — the
correction is the useful record):

```markdown
**Correction to the second "remaining work" bullet above: that residual is not real.**

I wrote that `lastSyncAt` being in-memory "means the chip likely reads not-ready on a
cold offline boot even with data in IndexedDB". Measured on 2026-09-04, it does not.
Cold offline boot on `/at-show/:showId`, primed device, IndexedDB intact:

    {notReadyVisible:false, readyVisible:true, mainTextLen:770}

The chip correctly reports "offline ready". My derivation — `triggerSync` returns
early when offline, so `lastSyncAt` stays null, so `ready` is false — looked airtight
and is wrong somewhere I did not trace.

The related inference that the committed test _"the readiness badge tells the truth
when the device is NOT primed"_ must therefore be vacuous is also wrong: it passes in
CI, and a primed device stays ready, so the chip does distinguish primed from wiped.

Nothing to fix. Recording it because the false version was stated as a probable defect
on a show-day surface, and an unverified claim left standing in the tracker is exactly
what MYK9-365's own description turned out to be.
```

---

---

## 3. MYK9-289 — decide whether to reopen

MYK9-289 is marked **Done** and its failure keeps recurring. The mechanism was root-caused on
2026-09-04 and is recorded in full as **NCR-2026-09-04-04** in [`findings.md`](findings.md); the
write-up is in
[`claude-daily-commit-review-2026-09-04.md`](claude-daily-commit-review-2026-09-04.md) § H-1.

**This one is a judgement call, not a paste.** Read MYK9-289's full description first — `get_issue`
by id, and `includeArchived: true` on any search — then decide:

- If MYK9-289 was always this harness defect, closed on a fix that addressed one role's symptom →
  **reopen it** and attach the root cause.
- If MYK9-289 was a genuine product never-settle that was correctly fixed → **file separately**.
  Filing a harness defect under it mislabels both.

Do not decide from the issue summary alone. The reason this is still open is precisely that the
description could not be read.

Root cause text to attach: the "Evidence" and "Notes" fields of NCR-2026-09-04-04 in
[`findings.md`](findings.md).

---

## Why these are queued rather than dropped

Four separate times across the 2026-09-04 sessions, reasoning from source reached a confident
conclusion that measurement then overturned — the paused-query premise (MYK9-347), "reconnect
recovers nothing" (MYK9-365), the typing cost on the 252-dog test (#2013), and the chip claim in
items 1 and 2 above. Three were caught before shipping. The fourth would have become a filed issue
that the next reader treats as authority — which is exactly how a wrong `UserManagementPage` comment
misled an earlier session that same day.

An unverified claim left standing in the tracker is the failure mode these corrections exist to
prevent. Discarding them because the connector happened to be unavailable would have preserved it.
