# The premium list: complete and correct before anything else

> **Status:** Active

Linear: MYK9-1952. Agreed with the owner in a design conversation on 2026-11-13. No code has been written.

## Why

The owner's idea: the app already knows most of what a premium list says, because the secretary entered it when she set up the show. The rest (the emergency vet, nearby hotels, club officers) rarely changes and can be saved with the club. So a club should get its premium with no retyping.

That idea is built. A code search on 2026-11-13 found:

- **Eight styles** (Monogram, Banner, Headline, Magazine, Poster, Gazette, Field Guide, Heritage), each with a PDF cover and a public page, with tests that render every style for AKC and UKC.
- **A club template** that saves the vet clinic, hospitality notes, awards, additional notes, a cover image and a default style (`components/panels/edit/ClubEditPanel/PremiumTemplatesTab.tsx`).
- **One button**, "Generate & publish premium", on the show's About page, which writes the "Show Hours" and "Trial Information" text, builds the PDF and publishes the public page.

What is weak is the content. The premium leaves out much of what the registries require, so a club cannot use it as its official premium. Until it can, the eight styles are decoration on an incomplete document.

Most findings come from the search and were not re-read line by line. Three were re-read and are marked. Phase 0 confirms the rest in the running app.

## The owner's rule for this plan

**Content first, styles as they are.** Every style has its own page and its own PDF layout, so each new fact has to be added eight times over. No new style, and no style-specific work beyond making each one print the same facts.

## What AKC requires

AKC Scent Work Regulations, Chapter 3, Section 15 (re-read, `docs/rulebooks/akc-scent-work-regulations.txt:635-671`): "A premium list must be published for all approved trials, and must include the following information".

| AKC requires                                                             | Today                                                                    | Where it should come from                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------ |
| Name of club                                                             | Printed                                                                  | Club                                       |
| Exact location: facility, address, city, state, zip                      | Venue printed; may be one line                                           | Show                                       |
| Date of the event                                                        | Printed                                                                  | Show                                       |
| Trial Chair: name, address, email, phone                                 | Name, email, phone. **No address field.**                                | Person, or the show's officials            |
| Event Committee, minimum five including the Chair                        | **No field**                                                             | Club, editable per show                    |
| Event number                                                             | Printed (not in Gazette or Field Guide)                                  | Trial                                      |
| Trial hours                                                              | Printed, as written text                                                 | Show                                       |
| Entry fees                                                               | Pre-entry and day-of printed. **Junior fee not printed.**                | Show; class fees once MYK9-1931 ships      |
| "AKC recording fee shall be stated"                                      | **No field**                                                             | Registry rule, with the year's amount      |
| Classes offered                                                          | Printed                                                                  | Classes                                    |
| Judges: names, cities of residence, assignments                          | Names printed. **City and assignments blank.**                           | Person (city); judge assignments           |
| Trial Secretary: name, address, email, phone                             | Name, email, phone. **Address always blank.**                            | Person, or the show's officials            |
| Date and time entries open and close                                     | Printed; prints "[REQUIRED…]" when empty                                 | Show                                       |
| "Entry limits or a statement that entry is unlimited"                    | **Not printed.** The show has Max Total Entries and Max Entries Per Dog. | Show; judge's daily limit; any class limit |
| Club officers, with the Secretary's address                              | **No field**                                                             | Club                                       |
| An official AKC entry form                                               | **Not included**                                                         | The existing AKC entry form report         |
| The "not appropriate to scout the trial location" statement              | **Not printed**                                                          | Registry rule (fixed text)                 |
| "An exact amount and description of the procedure for refunds"           | **Not printed.** The show has a withdrawal policy that is not used.      | Show                                       |
| The in-season withdrawal policy, and the documentation the club requires | **Not printed**                                                          | Show, with the club's default              |
| Breed-specific regulations for the area (recommended)                    | No field                                                                 | Club or show, optional                     |

Elsewhere in Chapter 3 the premium must also carry: waitlist details (§18), class transfers and move-ups (§21), where to mail entries, and the date and place of a draw when entries are drawn.

**UKC:** no list of required premium content was found in the rulebook file. It does say the total entry limit is "stated in the premium list".

**ASCA:** §1.5 lists 30 required items, including sanctioning status, the scents used, move-ups, vets and the refund policy. The search reports an ASCA show cannot generate a premium at all: it is refused with an error.

## What the owner asked for

Add to the premium (owner, 2026-11-13):

1. **The refund and withdrawal policy.**
2. **The move-up policy.**
3. **Entry limits.**
4. **The junior handler fee.**

All four are in the AKC list or the same chapter. This plan covers them and the rest of the list, because a premium that prints four more facts but still omits the committee, the officers and the scouting statement still cannot be the club's official premium.

## Other gaps found

- **Hotels cannot be entered.** The template stores a list of accommodations and the public page shows it, but the club's template screen has no box for them (re-read: `PremiumTemplatesTab.tsx` has inputs for the vet clinic, hospitality notes, awards and additional notes only).
- **Exhibitors cannot get the PDF.** The only "Download PDF" button is on the secretary's About page. No public page links to it.
- **"We publish our own premium list"** only silences reminders. There is nowhere to upload or link the club's own premium, and a club that also wants the public page is nudged to generate a myK9 premium anyway.
- **The "Public landing page" switch** only shows or hides a card. The public page appears whether it is on or off.
- **There is no unpublish.**
- **The PDF may not use the style chosen on the show.** The generator's query does not fetch the show's style, so it falls back to the club template's style or Monogram.
- **Edits reach the published PDF only if "Generate exhibitor documents on save" is ticked** before saving.
- **Per-show edits to the vet and notes are not saved back** to the club's template.
- Fields she fills in that are never printed: Junior Handler Fee, Max Entries Per Dog, Max Total Entries, "Allow waitlist", the withdrawal policy.
- On the public page, several facts are always empty: the trial chair's name, the venue's name and city, a judge's city and elements. The club's name may be showing the registry's name.

## Design

### One list of facts, printed by every style

Today each style's PDF body and public page decides what to print, and they differ (Gazette omits the vet and event number; Field Guide omits the event number and payment methods). Replace that with one list of the premium's facts, each with where it comes from and whether the registry requires it. Every style prints from that list. A style may arrange the facts; it may not drop a required one.

### Where each fact is entered

Nothing is typed twice, and nothing new is asked at show setup that the app could know.

- **On the show** (already there, now printed): entry limits, junior fee, waitlist, withdrawal and refund policy.
- **On the club, reused for every show:** officers, the event committee, the secretary's mailing address, the emergency vet, **hotels**, the in-season policy, hospitality, awards. The committee and the in-season policy can be changed for one show.
- **From the registry's rules, not typed at all:** the scouting statement, the recording fee line, the fixed wording a registry mandates. Read through the `@/features/registries` helpers.
- **From decisions made elsewhere:** the move-up policy prints from the class change switches (MYK9-1929): whether class changes are accepted after closing, whether same-day move-ups are, and the 30-minute rule. Class fees print from MYK9-1931 when it ships.

### What is missing is said before publishing

Before "Generate & publish premium", the secretary sees what the registry requires that is still empty, each with a link to where it is entered: "AKC requires the club's officers. Add them on the club." Same pattern as the other checklists. It warns; it does not block, because a club may publish early and fill in the judge's city later. A required item left empty prints nothing, never "[REQUIRED…]".

### The PDF is reachable

The public page gets "Download premium (PDF)". For AKC the PDF ends with the official entry form.

### A club with its own premium

"We publish our own premium list" gains one field: upload the PDF or paste a link. The public page then shows "Download premium" pointing at the club's own document, and the app stops asking the club to generate one.

### Small repairs that ride along

- The PDF uses the style chosen on the show.
- Edits to the premium's content reach the published PDF without a tick box, or the screen says plainly that it is out of date and offers "Republish".
- The public page's always-empty facts are filled or removed.
- The dead `VITE_PREMIUM_NEW_STYLES_ENABLED` line leaves `.env`.

## Decisions (owner, 2026-11-13)

1. **ASCA is supported in this plan.** An ASCA show gets the same button and checklist as an AKC one, with ASCA's own required items. It is built after the single list of facts, which is what stops a second registry doubling the work. First task of that phase: read all 30 items in ASCA §1.5 and sort them into what the app already knows, what the club enters once, and what is new for ASCA. A club can still link its own premium.
2. **UKC gets both.** The same facts as AKC without the AKC-only lines (recording fee, scouting statement, AKC entry form), plus the total entry limit; and whatever UKC's own requirements add. The rulebook file in the repo has no premium content list, so finding where UKC writes it down is a task in Phase 0.
3. **All eight styles stay.** No style gets work of its own: the four PDF body layouts become arrangements of the one list of facts, and a style that cannot show a required fact is fixed to show it and nothing more. Phase 0 counts which styles clubs have actually chosen.
4. **Every style is free.** The paid gate on seven styles is removed, and every style carries the complete content. This matches the landing page's "Free for clubs".
   - The database rule that refuses a style other than Monogram without paid access goes (`supabase/migrations/20260920130937_myk9_691_update_show_style.sql`). That is a migration.
   - The preview stops hiding seven styles, and the wizard's style list can no longer offer something that is refused later.
   - Any upgrade prompt or "Premium" label beside the style picker goes.
   - Not mapped: what else that paid tier unlocks. List it before building, so removing the style gate removes nothing else.
5. **"Unpublish" is added.** It takes down the PDF link and the public announcement. Entries already made are untouched, and the confirmation says so: "3 entries have been made. They are not affected." She can publish again any time.
6. **The "Public landing page" switch is removed.** A show's public face has two states, published or not, and Unpublish is how it is taken down. Reminders about publishing follow the "We publish our own premium list" switch. The `uses_landing_page` column and its readers go.
7. **No AI in the premium.** "Show Hours" and "Trial Information" are built from the show's facts: the same show always produces the same words, nothing can be invented, and it costs nothing. She can still edit the result. The AI call, its fallback text and its rate limit are removed. No AI-written welcome paragraph either.

## Phases

**Phase 0: confirm.** Generate a premium on a throwaway AKC show and a UKC show and read the PDF and public page against the table above. Try an ASCA show. Confirm each "Other gaps" item. Check with the regulations whether an emailed or linked premium satisfies "published". List what the database holds: how many clubs have a template, how many shows have a published premium.

**Phase 1: the single list of facts**, with every style printing from it. No new content yet; the test is that all eight styles print the same facts as before.

**Phase 2: the owner's four**, since the show already holds them: refund and withdrawal policy, move-up policy, entry limits, junior handler fee.

**Phase 3: the club's facts**: officers, committee, secretary's address, hotels, in-season policy; and the registry's fixed lines.

**Phase 4: the checklist before publishing**, the PDF link on the public page, and the AKC entry form at the end of the PDF.

**Phase 5: a club's own premium** (upload or link), "Unpublish", and removing the "Public landing page" switch.

**Phase 5b: every style free, and no AI.** Remove the paid gate on styles (a migration, its own branch). Build "Show Hours" and "Trial Information" from the show's facts and remove the AI call, its fallback and its rate limit.

**Phase 5c: ASCA.** Its list of required facts, the places to enter the ASCA-only ones, and the generator no longer refusing an ASCA show. Then UKC's own requirements, once found.

**Phase 6: testing.**

- One test per registry asserting every required fact appears in the PDF text and on the public page, run across all eight styles.
- A show with every optional fact empty prints no placeholder text.
- A fact changed on the club appears in the next show's premium and does not change one already published.
- The checklist lists exactly the required facts that are empty, and each link lands on the field.
- A club with its own premium is never nudged to generate one, and its link appears on the public page.
- A club with no paid access can save and publish each of the eight styles.
- The same show generates the same "Show Hours" and "Trial Information" text every time, with no network call to an AI.
- Unpublish removes the PDF link and the announcement and changes no entry.
- An ASCA show generates a premium containing every item in §1.5.
- Print one premium per style on paper and read it; record the result on the issue.

## Connections

- MYK9-1929 (class change requests): its two show switches are the move-up policy this premium prints.
- MYK9-1931 (class fees): once a class can have its own fee, the fees section lists the exceptions.
- MYK9-1949 (entry lists): the waitlist settings are the waitlist rules the premium prints.
- MYK9-1924 (print packets): the premium is a before-the-show document and belongs in that library.

## Non-goals

- A new style, or restyling an existing one.
- Building the premium in the entry wizard.
- Submitting the premium to the registry from the app.
