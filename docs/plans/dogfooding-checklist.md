# myK9Show Dogfooding Checklist

Run locally with `pnpm dev:show` (localhost:5173). Keep browser devtools open (Console + Network tabs).

---

## Flow 1: Create a Show End-to-End

- [ ] Create a club — verify it appears in the list and survives page reload
- [ ] Create a show via the wizard — verify it appears in Browse Shows
- [ ] Add trials to the show — verify trial dates save in correct format
- [ ] Add classes to each trial — verify class details (judge, type) persist
- [ ] Reload the page — verify all show/trial/class data is still there

**Known gap:** The ClassCreationPage wizard only writes to Zustand, not Supabase. Classes created via the show creation wizard _should_ work (that path was fixed). Report if they don't.

---

## Flow 2: People & Dogs

- [ ] Create a person — verify address saves correctly (was silently dropped before fix)
- [ ] Edit a person's address — verify it updates, not wiped to empty
- [ ] Create a dog with call name — verify call name persists
- [ ] Add registrations to the dog — verify they appear after reload
- [ ] Edit dog details (breed, gender, etc.) — verify changes save

**Known gap:** Photo uploads store base64 in local state — may not persist to DB.

---

## Flow 3: Registration & Entries

- [ ] Register a dog in a class — does the full workflow complete?
- [ ] View My Entries page — verify classes display for each entry
- [ ] Edit an entry — verify form data actually saves (was discarded before fix)
- [ ] Check in an entry — verify check-in status persists after reload
- [ ] Delete an entry — verify it stays deleted after reload

**Known gap:** Registration workflow is local-only (simulates delay, never calls API). This will likely be the first major gap you hit.

---

## Flow 4: Secretary Operations

- [ ] Open a show as secretary — verify class dashboard loads entries
- [ ] Change an entry's result/status — verify it persists
- [ ] Change a class status (e.g., to "Completed") — verify it persists
- [ ] Delete an entry from a class — verify persistence

**Known gap:** Secretary RBAC is route-level only — no per-show validation.

---

## Flow 5: Show Details & Navigation

- [ ] View show details — verify trial count, class count, entry count are real (not hardcoded)
- [ ] Click into a trial from a show — verify breadcrumbs and URL include show context
- [ ] View trial details — verify judge count and qualified rate are real
- [ ] Edit a trial — verify Save actually persists changes
- [ ] Delete a trial — verify it stays deleted after reload
- [ ] Delete a show — verify it stays deleted after reload

---

## Flow 6: Club Management

- [ ] View club details — verify member list loads
- [ ] Add a member to a club — verify they appear in the list
- [ ] Click "View Details" on a member — verify navigation to user page
- [ ] Remove a member — verify confirmation dialog appears and removal persists

**Known gap:** Member IDs are client-only (lost on cache clear). Club admin features use mock data.

---

## General Checks

- [ ] Console errors — note any red errors during normal use
- [ ] Network failures — note any failed Supabase requests (4xx/5xx in Network tab)
- [ ] Toast notifications — do success/error toasts appear for CRUD operations?
- [ ] Loading states — do spinners/skeletons show during data fetches?
- [ ] Empty states — do pages handle "no data" gracefully?

---

## How to Report Issues

For each issue found, note:

1. **What you did** (steps to reproduce)
2. **What you expected**
3. **What actually happened**
4. **Console errors** (if any)
