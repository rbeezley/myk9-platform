# Browser walks: class judge picker, Select classes bulk edit, offline judge writes

Evidence gates for **MYK9-1323** (class panel judge picker), **MYK9-1324** (Select classes on the schedule, bulk Assign judge) and **MYK9-1327** (judge written onto the local class row, survives an offline reload). All three merged and are live from `e26b5b230` (Deploy myK9Show run 39878806982). Each issue stays open (In Review once merged) until its walk is recorded on it.

## Before you start

- **Where:** https://myk9show.com, signed in as `secretary@myk9t.com`.
- **Show:** _Heartland Scent Work Classic_ (`dededede-0000-0000-0000-000000000010`), the seeded secretary show the e2e suite uses. Open it at `/shows/dededede-0000-0000-0000-000000000010`.
- **Viewports:** run every walk twice, at **1440 × 900** and at **375 × 812** (DevTools device toolbar, or `playwright-cli` with a matching viewport). At 375 the schedule is stacked: the class panel opens under its row instead of in a right-hand column.
- **This writes to the shared database.** It assigns, swaps and clears judges, changes class status, and deletes a class and then undoes it. Before you start, note every class's judge and status on the show, and put them back when you finish (Step 9 of Walk B). Use only classes that have **not started** for writes, except where a step deliberately uses a started class.
- **Evidence to record per step:** pass/fail, the viewport, and a screenshot whenever a step says _capture_. Paste the results into the issue named in each walk's heading.

---

## Walk A: judge picker in the class panel (MYK9-1323)

1. Open the show home. Find a class whose schedule row reads **"Judge not set"**, and click the row.
   - Expect: the class panel opens (on the right at 1440, under the row at 375) with a **Judge** control, a combobox labelled **"Judge for &lt;class name&gt;"**.
   - Expect: the panel's facts line does **not** repeat the judge.
2. Open the picker and choose a judge.
   - Expect: the schedule row changes from "Judge not set" to that judge's name **immediately**, with no reload and no "Judge assigned" placeholder. _Capture._
3. Choose a **different** judge on the same class.
   - Expect: the row and the panel show the new name at once; the old name does not flash back.
4. Choose **Unassigned**.
   - Expect: the row reads "Judge not set" again.
5. Repeat steps 2–4 on **three classes in a row** without reloading.
   - Expect: every row keeps its own judge; no row shows another class's judge.
6. **Lock:** open a class that is **in progress** or **complete**.
   - Expect: no picker. The judge's name is plain text, with the hint **"Locked once the class starts. Use Edit class to change it."** _Capture._
7. **No judges** (only if a show without eligible judges exists): open a not-started class on it.
   - Expect: the notice "No judges are available to assign to this class yet." appears instead of an empty picker.
8. **Read-only viewers:** sign in as an exhibitor (or open the show logged out) and open the show.
   - Expect: no judge picker anywhere, and the judge appears as plain text.

## Walk B: Select classes on the schedule, bulk edit (MYK9-1324)

1. Open the header **Actions** menu and choose **Select classes**.
   - Expect: the schedule heading changes to **"Select classes"** with a **Done** button.
   - Expect: each class row shows a checkbox (**"Select &lt;class&gt;"**), and each **open** trial heading shows a select-all checkbox (**"Select every class in &lt;trial&gt;"**).
   - Expect: at 375 the class panel does not appear inside the list. _Capture._
2. Click a row (not the checkbox).
   - Expect: the row's checkbox ticks; the focused class does **not** change. Click the row again to untick it.
3. Tick two **not-started** classes and one **started** class in the same trial.
   - Expect: a floating bulk bar with **Assign judge (2 of 3)**, **Change status**, **Delete** and **Export**. _Capture._
4. **Assign judge (2 of 3)** → pick a judge.
   - Expect: the two not-started rows show the judge at once.
   - Expect: the started class keeps its judge, and an info toast says **"1 started class kept its judge."**
5. With the same classes ticked, **Assign judge** → **Unassigned**.
   - Expect: the two not-started rows read "Judge not set".
6. **One trial at a time:** expand a second trial and tick one of its classes.
   - Expect: the first trial's ticks clear, and a line says the selection in &lt;first trial&gt; was cleared.
7. **Selections clear when you'd lose sight of them.** Tick a class, then do each of these in turn, re-ticking each time:
   - change the **day chip** → the ticks clear;
   - **collapse** the trial → the ticks clear;
   - switch the filter to one that hides the ticked row, then back to **All** → the tick stays gone.
8. **Change status** → move one not-started class to another status.
   - Expect: the row's status updates.
9. **Export:** tick two classes → **Export**.
   - Expect: a CSV downloads with exactly those two classes.
10. **Delete and undo:** tick one not-started class with no entries → **Delete**.
    - Expect: the delete dialog shows the counts and any blockers. Confirm, then use **Undo**.
    - Expect: the class comes back with its judge and status. _Capture the dialog._
11. **Done.**
    - Expect: the checkboxes disappear and the schedule returns to where you were (same day, filter and focused class).
12. **Old links still work.** Open `/shows/dededede-0000-0000-0000-000000000010/classes/<trialId>?status=in_progress` with a real trial id.
    - Expect: Select classes mode, with that trial open and the **In progress** filter applied.
13. **Restore:** put every judge and status you changed back to the values you noted before starting.

## Walk C: offline judge writes (MYK9-1327, plus MYK9-1324's offline criterion)

Use Chrome DevTools → Network → **Offline** (or `playwright-cli`'s offline toggle). Run it at both viewports.

1. Load the show home online, and let it finish syncing.
2. Go **Offline**.
3. In the class panel, assign a judge to a not-started class.
   - Expect: the row shows the judge at once.
4. **Reload the page while still offline.**
   - Expect: the app boots from its offline data, and the row **still shows that judge**, neither "Judge not set" nor the previous judge. _Capture._
5. Still offline, open **Select classes**, tick two not-started classes, and **Assign judge** a different judge.
   - Expect: both rows show the judge, and a reload offline keeps it.
6. Go back **Online** and wait for sync. Reload.
   - Expect: all three classes keep the judges assigned offline. No conflict prompt appears for those fields, and no row half-updates (for example, a new first name with an old last name).
7. Optional cross-device check: sign in as the same secretary in a second browser profile.
   - Expect: it shows the same judges after sync.
8. **Restore** the judges you changed.

## Recording the result

On each issue, post a comment with:

- the date, the build (`e26b5b230`) and the viewport(s);
- each step's pass/fail, with screenshots attached for the _capture_ steps;
- any failure with its step number, exact text or behaviour, and a screenshot.

Then file anything that failed as its own issue. Move an issue to Done only when every step of its walk has passed at both viewports.

| Issue     | Walks needed                        |
| --------- | ----------------------------------- |
| MYK9-1323 | A, at 1440 and 375                  |
| MYK9-1324 | B at 1440 and 375, plus C steps 5–6 |
| MYK9-1327 | C steps 1–4 and 6, at 1440 and 375  |
