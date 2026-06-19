# Judge and Steward Ringside Quickstart Outline

**Status:** `qa-draft` — outline phase; final quickstart gated on `unified_ringside_enabled` being out of DEV-only flag status.

**Audience:** Judges and gate stewards. Role intent: "Invisible technology." Minimal words. Written for people whose eyes are on the dog, not the screen.

**Canonical route:** `/at-show/:showId` (the unified ringside surface)

**Guide target:** `docs/user-guides/judge-steward-quickstart.md` — short enough to print on a single page and hand to ringside volunteers.

**Important:** The canonical ringside surface is myK9Show `/at-show/:showId`. The deleted `apps/myk9q` app has been absorbed into this route — do not reference myK9Q in the customer-facing quickstart. The at-show experience is a unified single-app path.

---

## Readiness Gate

| Gate | Status |
|---|---|
| `unified_ringside_enabled` flag is DEV-only | **BLOCKS final publication** |
| At-show route and scoresheet are stable | Yes (golden path § Part 6 confirms) |
| Passcode access path works | Yes (golden path § 6.10) |
| Combined A/B section view works | Yes (golden path § 6.9) |
| Results persist to secretary view | Yes (golden path § 6.7) |

**Do not publish the final quickstart until the feature flag is removed and the at-show flow is open to all shows.**

---

## Intended Format

The final `judge-steward-quickstart.md` should be:
- **One printed page** or less — landscape A5/half-letter
- Numbered steps only — no prose paragraphs
- Bold all UI elements
- No technical terms (no "passcode grant", no "replication", no "RLS")
- Specific answer to "what do I do if I lose signal?"

---

## Section 1 — Getting Access

**Two paths to ringside:**

**Path A — Staff account (for secretaries and assigned judges):**
1. Sign in with your myK9Show account.
2. Navigate to **At the Show** for this show.
3. You are admitted immediately — no passcode needed.

**Path B — Show passcode (for ringside volunteers, guest judges, stewards):**
1. Get the show passcode or QR code from the trial secretary before the show starts.
2. Open myK9Show in your browser.
3. Enter the show passcode when prompted.
4. You are in — no account needed.

**How the secretary gets the passcode:**
Show Desk → Tools panel → **Show Access Codes** → share the QR code or the plaintext passcode.

**Screenshots:** SmartSignInPage showing passcode entry; QR code card in Show Desk tools.

**Stability note:** Passcode path is stable (golden path § 6.10). The show access codes card requires the flag to be enabled.

---

## Section 2 — Class List

**User outcome:** Judge or steward sees all trials and classes for today's show.

**Rough steps:**
1. After access, you see the **Class List** — all trials and their classes.
2. Each class row shows: class name, level, judge, entry count.
3. Tap a class to open its entry list.

**Screenshots:** Class list with trial groups and class rows.

---

## Section 3 — Entry List for a Class

**User outcome:** Judge or steward sees the run order for a class.

**Canonical route:** `/at-show/:showId/class/:classId`

**Rough steps:**
1. Tap a class name → the **Entry List** opens.
2. Entries are shown in run order: dog call name, armband number, handler name.
3. Tap the star (favorite) icon on an entry to pin it — stays pinned across reloads.
4. Tap an entry card to open the scoresheet.

**Screenshots:** Entry list with run order; favorited entry.

**Combined A/B section note:** Classes that run Novice A and Novice B together appear as a unified list at `/at-show/:showId/class/:classIdA/:classIdB`. Both sections' dogs appear interleaved.

---

## Section 4 — Scoring an Entry

**User outcome:** Judge records a result immediately after the dog completes its run.

**Canonical route:** `/at-show/:showId/class/:classId/score/:entryId`

**Rough steps:**
1. Tap the entry card → the **Scoresheet** opens.
2. Tap **Start Timer** when the dog begins.
3. Tap **Stop** when the dog finishes or the time limit is reached.
4. Select the result: **Q** (Qualified), **NQ** (Not Qualified), or **Absent**.
5. Tap **Save**.
6. The entry list updates to show the result.

**Screenshots:** Scoresheet with timer active; result buttons; entry list showing saved result.

**Stability notes:**
- Scoresheet is stable (golden path § 6.5–6.6).
- Results saved here persist to the secretary's Results Control page immediately — the secretary does not need to re-enter them.

---

## Section 5 — Offline Expectations

**What happens when signal is lost at the venue:**
- The app continues to work — scoring, favoriting, and viewing the run order all work offline.
- Changes are saved locally and sync to the server automatically when signal returns.
- An **Offline** banner appears at the top — this is expected at most show venues.
- Do not refresh the page while offline — the local data is safe as long as you stay in the app.

**What if data does not appear after signal returns:**
- Tap the sync indicator or reload the page once you have a solid connection.
- If entries are still missing after reconnecting, contact the trial secretary.

---

## Section 6 — When Things Go Wrong

| Symptom | What to do |
|---|---|
| "I can't find my class" | Check with the secretary — the class may not have been published yet |
| "The passcode doesn't work" | Ask the secretary for the current code (they regenerate from Show Access Codes) |
| "My scores aren't showing up for the secretary" | Check the offline banner — scores sync when connection restores |
| "The timer reset itself" | Restart timing; scores are saved manually (tap Save), not auto-saved |
| "The app is completely unresponsive" | Close and reopen the browser tab; if you used the QR code, scan it again |

---

## Cross-References

- Role intent: `docs/INTENT.md` § Judge, Steward
- At-show route shape: `project_atshow_route_shape.md` in memory
- Secretary golden path § Part 6 — full at-show walkthrough
- Secretary-side: Show Access Codes card in Show Desk tools

## QA-Draft Friction Findings

| Finding | Section | Backlog action |
|---|---|---|
| `unified_ringside_enabled` is DEV-only | All | Gates entire quickstart; track flag removal |
| No nav link to `/at-show/:showId` — entry is only via ShowTodayBanner or direct link | § 1 | Describe passcode/QR path as the primary access for non-staff |
| Timer reset behavior is unclear — scores are only saved on explicit Save, not on timer stop | § 4 | Confirm save behavior during live walk; add to quickstart explicitly |
| Combined A/B section URL shape (`/:classIdA/:classIdB`) needs confirmation | § 3 | Verify routing during live walk before publishing |
