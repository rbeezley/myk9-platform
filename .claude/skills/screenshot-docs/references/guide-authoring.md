# User Guide Authoring Reference

## Status lifecycle

```
planned → source-mapped → qa-draft → walkthrough-needed → draft-ready → drafted → verified → published
```

New guides start at `planned`. Write them as `qa-draft` — a testing instrument against the live app. The guide must never gate on the doc; the doc adjusts to the app. Do not publish (`verified`) until Phase 0 gate passes (see below).

**Phase 0 gate:** all routes used by the guide must be stable in `pageDirectory.ts`, with no open launch-blocker issues and no active duplicate surface. See `docs/user-guides/documentation-qa-checklist.md` for full verification protocol.

---

## Guide anatomy

Every guide follows this structure:

```markdown
# [Role] Guide                        ← H1 title

**Status:** `qa-draft`                ← always start here
**Audience:** [who reads this]
**Last verified:** YYYY-MM-DD
**Verified by:** [walkthrough method]

> **Note:** This is a QA-draft guide...  ← boilerplate note (copy from existing guide)

---

## What this guide covers             ← 2-3 sentence overview of the guide's scope

[platform context paragraph]          ← how the platform works for this role; what's different
                                        from other tools they may have used

---

## Section 1 — [Task name]            ← imperative task title (not feature name)

[1-2 sentence context]

1. Step one.
2. Step two.
3. Step three.

![alt text](../screenshots/<ID>.png)  ← or blocked placeholder (see below)

[1-2 sentence follow-on or note]

---

## Section N — ...

---

## Still need help?

- [Link to related guide]
- Support: [placeholder]

---

## Screenshot Checklist

| Shot ID | Section | Description | Status |
|---|---|---|---|
| X-01 | § 1 | Description | ready / blocked: reason |
```

---

## Writing rules (from writing-style.md)

**Role tone:**

| Role | Target feeling | What this means |
|---|---|---|
| Secretary | "That was easy" | No jargon. Confident guidance. Each step completable in one motion. |
| Exhibitor | "This respects my time" | Short steps, no re-explanation of what they know. |
| Judge / Steward | "Invisible technology" | Minimal words. Action-oriented. Eyes on the dog, not the screen. |
| Club Admin / Treasurer | "The platform is healthy" | Factual, reassuring. Numbers and status at a glance. |

**Section titles are user actions, not feature names:**
- "Grant show access" not "Secretary Assignment"
- "Approve an entry" not "Entry Management"
- "Connect your bank account" not "Stripe Express Onboarding"

**Never say:** "simply", "just", "easily", "Note that…", "Please be aware…", "as mentioned above"

**Never reference:** internal route names (`/secretary/dashboard`), component names (`ShowWorkbenchSetupPage`), or software concepts (`modal`, `sync`, `IndexedDB`, `webhook`)

**Dog-show terminology:**
- Entry (not "registration" in the software sense)
- Pulled (platform standard; "scratch" also understood)
- Armband number (not "entry number")
- Send to AKC (not "submit" or "export")

---

## Blocked screenshot placeholder format

When a screenshot can't be captured yet, use this exact format inline:

```markdown
> *[Screenshot C-04: Payments page — "Connect bank account" button and pre-flight checklist visible — blocked: stripe]*
```

Pattern: `> *[Screenshot <ID>: <description of expected state> — blocked: <reason>]*`

Add the shot to the guide's checklist table with `blocked: <reason>` status. Do not leave a blank space in the guide — the placeholder is intentional.

---

## Where to register a new guide

When creating a new guide:

1. **`docs/user-guides/README.md`** — add a row to the Planned Guides table:
   ```markdown
   | [Guide Title](filename.md) | Audience | `qa-draft` | priority | Notes |
   ```

2. **`docs/training/screenshot-shot-list.md`** — add a new Part section at the bottom:
   ```markdown
   ## Part N — [Role] Guide Screenshots

   | Shot ID | Description | Route | Account | Viewport | Expected state | Guide section | Status |
   |---|---|---|---|---|---|---|---|
   | X-01 | ... | `/route` | `account@myk9t.com` | Desktop | ... | § 1 | `ready` |
   ```

3. **The guide's own checklist table** at the bottom of the guide markdown.

Do NOT add individual guides to `docs/README.md` (the main index) — that tracks plans and reference docs, not user guides.

---

## Existing guides and outlines

| Guide | Outline source | Status | Notes |
|---|---|---|---|
| `docs/user-guides/secretary-guide.md` | `secretary-guide-outline.md` | `qa-draft` | Phase 0 gate met; screenshots pending |
| `docs/user-guides/exhibitor-guide.md` | `exhibitor-guide-outline.md` | `qa-draft` | Phase 0 gate met; § 10 stub |
| `docs/user-guides/club-admin-guide.md` | `club-admin-guide-outline.md` | `qa-draft` | C-04/C-05 blocked: stripe |
| `docs/user-guides/judge-steward-quickstart.md` | `judge-steward-quickstart-outline.md` | `planned` | No longer flag-blocked; screenshots capturable after staging redeploy (Updated 2026-06-23: `unified_ringside_enabled` flag removed — see [`../../../../docs/plan-remove-unified-ringside-flag.md`](../../../../docs/plan-remove-unified-ringside-flag.md)) |

---

## Judge / Steward quickstart — specific notes

The outline is at `docs/user-guides/judge-steward-quickstart-outline.md`. Key constraints:

- **Target format:** printable on one A5/half-letter page — numbered steps only, no prose paragraphs
- **Canonical route:** `/at-show/:showId` (the unified ringside surface — never reference old myK9Q app)
- **J-01–J-06 screenshots are no longer flag-blocked** — capturable against staging once the removal PR redeploys (Updated 2026-06-23: `unified_ringside_enabled` flag removed — see [`../../../../docs/plan-remove-unified-ringside-flag.md`](../../../../docs/plan-remove-unified-ringside-flag.md); at-show surface renders for every show, gated only by `AtShowAccessGate`)
- **Write the prose skeleton now** — you can author the full guide with placeholders; screenshots drop in once captured against staging
- **Offline section is required** — judges lose signal at most venues; the guide must describe offline behavior explicitly
- **Two access paths to document:** staff account (sign in normally) and show passcode/QR code (no account needed)

---

## QA-draft mode

A `qa-draft` is intentionally disposable. If writing the guide reveals friction ("this step takes four clicks but the guide says two"), the **app** changes and the guide is rewritten. Never soften the doc to paper over a UX problem. File the friction finding in `qa/findings.md` and fix the app.
