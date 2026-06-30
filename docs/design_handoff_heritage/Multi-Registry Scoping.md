# Multi-Registry Support — Scoping Document

> **Status:** Active

**LAUNCH SCOPE (decided 2026-06-29):** the **scent sport** is being advertised for **AKC, UKC, and ASCA on day one** — this is a launch commitment, not post-MVP. The day-one bar is narrow but firm: those three registries' *scent work / nosework / scent detection* class structures and legal language must render correctly across the publishing surfaces. Other sports (obedience, conformation) and other registries remain post-MVP. **Day-one status:** all three registries are now populated from their actual rulebooks — AKC Scent Work (§7.5), UKC Nosework (§8), ASCA Scent Detection (§9) — ✅ on paper. The cross-registry schema synthesis (§10) is the spec the build must target. **Remaining day-one engineering:** the AKC-extraction refactor (§6 steps 1–2) built against §10 — ⬜ not started.

This document describes how the trial-publishing system (Premium PDF, Landing Page, Entry Blank, Confirmation Email, and Wizard) would be extended to support sanctioning bodies beyond AKC — UKC, ASCA, CKC, etc.

---

## 1 · The landscape

Sanctioning bodies likely to appear in our user base:

| Registry | Notes |
|---|---|
| **AKC** — American Kennel Club | Largest US registry. Currently the only one supported. Formal/traditional register. |
| **UKC** — United Kennel Club | Second-largest US registry. Total-dog/working emphasis, owner-handled focus, more relaxed atmosphere. |
| **ASCA** — Australian Shepherd Club of America | Breed-specific registry, runs all-breed events. Strong stockdog/herding tradition. |
| **CKC** — Canadian Kennel Club | Canada's AKC equivalent. |
| **NADAC, USDAA, CPE** | Agility-specific. |
| **AHBA, USBCHA** | Herding-specific. |
| **NACSW** | Independent scent work — the original, pre-AKC. |

---

## 2 · What varies between registries

### Tier 1 — Identity & legal language (always varies)

Hardcoded today; must be parameterized.

- Registry name and short name (e.g. "American Kennel Club" / "A.K.C.")
- Licensing header language (e.g. "An A.K.C. Licensed Trial")
- "Member club" footer language
- The full **exhibitor agreement** text (the ~300-word block in §V of the entry blank)
- Registration-number field label and validation pattern

### Tier 2 — Class & competition structure (varies by registry AND by sport)

The biggest source of variation.

- AKC scent work: Novice / Advanced / Excellent / Master, with elements Containers / Interiors / Exteriors / Buried plus Handler Discrimination & Detective
- UKC scent work: Started / Advanced / Superior, different element labels
- ASCA: different titling system entirely

This drives the class grid in §II of the entry blank, panel labels on judge cards, the trial table on the landing page, and the wizard's class-selection step.

### Tier 3 — Required fields & form schemas (varies subtly)

- AKC entry blank requires registered name, breed, sire, dam, breeder, AKC reg #
- UKC requires similar but worded differently, plus a "permanent identification" field
- ASCA requires owner membership numbers

---

## 3 · What stays registry-neutral

- All **visual styling** — the 8 styles, micro-animations, typography
- The **packet structure** — Premium → Landing → Entry Blank → Confirmation → Wizard
- **Venue/club/judges/dates/fees** data
- **Copy register and tone** — some registries *prefer* less formal, but that's a style choice (use a different design from the 8), not a registry-imposed requirement

---

## 4 · Proposed schema

A new `registries.js` (or a top-level key in `data.js`):

```js
export const registries = {
  AKC: {
    id: "AKC",
    name: "American Kennel Club",
    shortName: "A.K.C.",
    licenseLanguage: "An A.K.C. Licensed Trial",
    memberClubLanguage: "A member club of the American Kennel Club",
    exhibitorAgreement: "...300-word legal text...",
    registrationField: {
      label: "A.K.C. registration number",
      pattern: null,
    },
    sports: {
      "scent-work": {
        levels: ["Novice", "Advanced", "Excellent", "Master"],
        elements: ["Containers", "Interiors", "Exteriors", "Buried"],
        special: ["Handler Discrimination", "Detective"],
      },
    },
    dogFields: {
      required: ["registeredName", "callName", "breed", "sex", "dob", "registrationNumber"],
      optional: ["sire", "dam", "breeder", "variety"],
    },
  },
  // UKC, ASCA, etc. follow same shape
};
```

A trial then declares `registry: "AKC"` (and maybe `sport: "scent-work"`) at the top of its config, and every piece reads from `registries[trial.registry]`.

---

## 5 · Where each field is consumed

| Piece | Reads from registry config |
|---|---|
| **Premium PDF** | License language, agreement text, class structure, fee-table headers, registry name in copy |
| **Landing page** | Header subline, panel labels on judges, class grid in §III, agreement reference, footer member-club line |
| **Entry blank** | §I dog-particulars field set, §II class grid, §V agreement text, header license language |
| **Confirmation email** | Header license language, footer member-club language |
| **Wizard** | Field validation rules, class options, agreement-checkbox text, registry-specific required fields |

---

## 6 · Implementation plan

Don't design the schema speculatively. Build it by *forcing one piece to read from config*, see what's painful, fix the schema, repeat.

1. **Populate AKC fully** as the only registry. Refactoring exercise — extract every hardcoded "AKC" / "Novice / Advanced / Excellent / Master" / agreement paragraph from the four Style 8 pieces and the wizard.
2. **Wire all Style 8 pieces to read from `registries.AKC.*`.** Validates the schema against real usage; visually nothing should change.
3. **Add UKC as the second registry**, populated from real UKC reference materials (premium list, entry form, rulebook excerpt). UKC is most different from AKC, so it stresses the schema hardest.
4. **ASCA, CKC, etc.** become quick fills once the schema has survived AKC + UKC.

### Effort estimate (rough, in dev-units)

| Task | Cost |
|---|---|
| Registry config schema + AKC populated | 1 |
| Wire 4 Style 8 pieces + wizard to read from config | 1–2 |
| Add UKC (with real reference docs) | 1 |
| Each additional registry beyond UKC | ~0.5 |

---

## 7 · Open questions — RESOLVED 2026-06-29

Resolved with the product owner; UKC Nosework reference materials (2020 rulebook + 2021 trial manual) supplied to populate §8.

1. **Does a single trial ever span two registries?** → **No.** A show or trial is never both AKC and UKC. The dual-registry data model (`registries: [...]`) is **rejected** — keep `registry: "AKC"` as a single value. (It already lives at the trial level as `trials.registry_id`.) The legitimate "multiple things under one umbrella" case is a **show with several trials of different *sports*** (e.g. Nosework + Obedience + Conformation) — more common in UKC because of the cross-sport **Total Dog** award. That is modeled as multiple trials sharing the show's registry, not as a multi-registry trial.
2. **Is *sport* top-level or nested under registry?** → **Nested under registry in the config; a *trial* selects a (registry, sport) pair.** Registry is the anchor (already `trials.registry_id`); sport is the modifier. Class structure is defined *by the registry for that sport* — the same label can't be assumed shared across registries (UKC's levels are Novice/Advanced/**Superior**/Master/**Elite**; AKC's are Novice/Advanced/**Excellent**/Master). So a trial carries both `registry` and `sport`; the schema keeps `registries[reg].sports[sport]`. **Total Dog is neither a registry nor a sport** — it is a UKC cross-sport *award* (conformation win + a performance leg) that reads results across a dog's trials. Park it as a post-MVP award, out of scope for this config layer.
3. **Should registry choice pre-select a visual style?** → *Unresolved / deferred* — leave the doc's lean ("probably no, let users pick freely"). Not a blocker for the AKC-extraction + UKC-populate work.
4. **Failure mode for an unsupported registry?** → **Hard error.** No generic fallback template. If `registries[trial.registry]` is missing, fail loudly at config-resolution time rather than rendering a packet with wrong/placeholder legal language. (A wrong exhibitor agreement or license header is worse than a blocked publish.)

---

## 7.5 · AKC Scent Work — populated reference (from RSW001 + Judges' Guidelines)

Registry #1 and the day-one extraction base. Source of record: *AKC Scent Work Regulations* (RSW001) + *AKC Scent Work Judges' Guidelines*. Verified 2026-06-29 against the rulebook — supersedes the AKC column previously inferred in §10.

### 7.5.1 · Identity & legal (Tier 1)

| Field | Value |
|---|---|
| `name` | American Kennel Club |
| `shortName` | AKC |
| Sport label | "Scent Work" |
| Registration field | AKC registration number (or PAL/ILP, or an AKC number for the listed-breed paths) |

### 7.5.2 · Class & competition structure (Tier 2)

AKC groups classes into **Divisions** (a grouping tier above element, used for titling & awards like *High Combined Division*). For the publishing config we **flatten divisions into a single element list**, but the divisions matter for the future titles surface:

| Division | Elements | Levels |
|---|---|---|
| **Odor Search** | Container, Interior, Exterior, **Buried** | Novice, Advanced, Excellent, Master (4) |
| **Handler Discrimination** | HD *(treated as just another element)* | Novice, Advanced, Excellent, Master (4) |
| **Detective** | Detective *(its own element)* | **1 level only — referred to simply as "Detective"; no A/B sections** |

So the flattened AKC element list is **Container, Interior, Exterior, Buried, HD, Detective** (6). Confirmed details:
- **Sections A/B: Novice only.** "Novice A and Novice B are different sections of the same class. The hide location does not move between Novice A and Novice B. Teams are judged under the exact same criteria." Ownership-style split; every other level (and Detective) has no sections.
- **Detective** is a single large **combined interior + exterior search** across multiple areas/hides — its own element with exactly **one level and no sections**. Open to dogs holding any Master title; 10 qualifying scores earn the Scent Work Detective (SWD) title.
- **Buried** is AKC-only (target odor in a small container buried under sand or water) — UKC/ASCA have no Buried element.

**Target odors, cumulative by level** (Odor Search Division): Novice = **Birch** only · Advanced = Birch and/or **Anise** · Excellent = +**Clove** · Master = +**Cypress**. (Birch *Betula lenta*, Anise *Pimpinella anisum*, Clove *Eugenia caryophyllata*, Cypress *Cupressus sempervirens*.)

### 7.5.3 · Scoring & titles

- **Pass/fail** with faults and search time (time used for placements / High in Trial / High Combined).
- **Title tiers:** each division has **Basic** element + level titles, then **Elite** titles (earned by continuing to qualify at Master). Plus the standalone **SWD** (Detective). Titles are out of day-one scope (titles/awards surface) but noted so they aren't re-derived.

---

## 8 · UKC Nosework — populated reference (from 2020 rulebook + 2021 trial manual)

The second registry to populate (per §6 step 3). UKC Nosework is the most structurally different sport from AKC scent work, so it stress-tests the schema hardest. Source of record: *Official UKC Nosework Rulebook* (eff. 2020) + *UKC Nosework Trial Manual* (eff. Nov 1 2021).

### 8.1 · Identity & legal (Tier 1)

| Field | Value |
|---|---|
| `name` | United Kennel Club |
| `shortName` | UKC |
| `licenseLanguage` | "A UKC Licensed Nosework Trial" |
| Registration field | UKC Permanent Registration number — **or** a Performance Listing (PL), Limited Privilege (LP), or Temporary Listing (TL) number. Eligibility also requires the dog be ≥6 months old. |

> Trademark note from the rulebook: "The use of the initials UKC in association with any other registry would be in violation of the registered trademark." Keep UKC branding off any non-UKC surface.

**Exhibitor agreement + footer language** — sourced from the *Official UKC Performance Entry Form* (FO135FBL, rev. 12-25); verbatim text in **§11.1**. Note UKC uses **"host club"** framing, not AKC's "member club" — there is no `memberClubLanguage` equivalent; the footer phrase is "Held under the Official Rules and Regulations of the United Kennel Club." The Performance form's waiver lists rule-sets parenthetically (Agility, Obedience, …) but **omits Nosework** — when populating `ukcRegistry`, substitute "(Nosework)" or source the Nosework-specific form.

### 8.2 · Class & competition structure (Tier 2 — the hard part)

**Levels (5, successive):** Novice → Advanced → Superior → Master → Elite. *(The 3rd level is **Superior** for most elements but **Excellent** for HD — see below.)*

**Elements (5):** Container · Interior · Exterior · Vehicle · **Handler Discrimination (HD)**. *(No "Buried" — that's AKC-only.)* **HD is just another element** — there is no separate HD "trial format." A trial offers any set of elements at any set of levels; a trial may be HD-only, or HD plus Container/Interior/etc.

**Trial structure = a set of (element, level) classes.** The club picks which elements and which levels to host (offering all levels below the highest offered, per element). **Do not build a "Class/Level trial" format** (all four elements at one level) — confirmed 2026-06-29 as **no longer offered**; only the element-by-element structure exists.

**Per-element level sets are not uniform** — this is the key wrinkle:
| Element | Levels |
|---|---|
| Container, Interior, Exterior, Vehicle | Novice, Advanced, **Superior**, Master, Elite (5) |
| Handler Discrimination (HD) | Novice, Advanced, **Excellent**, Master (4 — no Superior label, no Elite) |

So the level list must be modeled **per element**, not once per sport: HD swaps "Excellent" for "Superior" at rank 3 and has no Elite. Element-level labels are **not** shared across elements within the same registry.

**A/B section split** *(a dimension AKC scent work largely lacks):* dogs not owned by the exhibitor or immediate family must run in the **"B"** section; B sections also carry the championship legs.
- **UKC: every level has an A and B section** (all 5 levels).
- **AKC: only the Novice level has A/B.**
- So `section: "A" | "B"` is configured **per (registry, level)**, not as a flat per-registry flag.

**Essential oil by level** (drives equipment/odor, useful for the entry blank & judge cards): Novice = Birch · Advanced = Anise · Superior = Clove · Master = Myrrh · Elite = Vetiver.

**Max element times** (placement/tiebreak context): announced at the handlers' meeting per class; HD Novice/Advanced/Excellent = 1 min per entry, HD Master = 2 min per entry.

### 8.3 · Scoring model

- **Pass/fail (qualifying)** per search — *not* a points or cumulative-fault total like some sports.
- **≤ 1 fault still passes.** A second fault, or any item on the **non-qualifying faults** list (incorrect call, dog eliminates in area, aggressive alert, etc.), = NQ.
- **Search time** is recorded for **placement and tiebreak**, not for pass/fail.
- Judge calls faults *after* the search, never during.

### 8.4 · Title ladder (for a future titles/awards surface — not the publishing config, but captured so it isn't re-derived)

The "4 elements" in the Nosework-title rules below means **Container/Interior/Exterior/Vehicle**. HD is entered like an element but has its **own separate title track** (rulebook Ch. 11) — it does *not* feed the NN/AN ladder.

- **Element titles** — 2 passes at 2 *different* licensed trials. Abbrevs by element × level:
  - Container: NC AC SC MC EC · Interior: NI AI SI MI EI · Exterior: NE AE SE ME EE · Vehicle: NV AV SV MV EV
- **Nosework (level) titles** — all 4 elements at a level: **NN AN SN MN EN** (successive; must title an element before entering the next level in it).
- **Class Champion** — `NN…EN` earned first, then **3 qualifying legs in the B section** for each element: **NNCH ACH SCH MCH ECH**. All five → **NWCH** (Nosework Champion).
- **Class Grand Champion** — Champion earned first, then **5 B-section legs** per element: **NGC AGC SNGC MGC EGC** *(note the inconsistent `SNGC` abbrev in the source)*. All five → **NWGC** (Nosework Grand Champion).
- **HD titles** — separate track (Ch. 11), levels Novice/Advanced/Excellent/Master. *(Capture exact abbrevs from Ch. 11 when the titles surface is actually built.)*

### 8.5 · Schema additions surfaced by UKC (vs. the §4 AKC-only shape)

Populating UKC forces these schema changes the AKC-only draft didn't anticipate:
1. **`levels` is per element, not per sport.** UKC's main elements have 5 levels (Novice/Advanced/Superior/Master/Elite); HD has 4 (Novice/Advanced/**Excellent**/Master). Model `element.levels`, not a single shared `sport.levels`. No hardcoded 4-level (AKC) assumption anywhere.
2. **HD is an element, not a format.** Elements = `[container, interior, exterior, vehicle, hd]`; a trial selects any subset at any levels. **No `trialFormat` selector** and **no "Class/Level trial"** — trial structure is purely a set of (element, level) classes.
3. **`section: "A" | "B"` is configured per (registry, level).** UKC = all 5 levels have A/B; AKC = Novice level only. Not a flat per-registry flag, and not always-absent for AKC.
4. **Unsupported-registry = hard error** (per Q4) — the resolver throws; no fallback template.

---

## 9 · ASCA Scent Detection — populated reference (from June 2026 rules)

Source of record: *ASCA Scent Detection Program Rules*, June 2026 (incl. the new Chapter 9 Champion Detection Level, motion SC.26.01) + the 2025-06-27 change summary. ASCA's sport is called **Scent Detection** (not "scent work" / "nosework").

### 9.1 · Identity & legal (Tier 1)

| Field | Value |
|---|---|
| `name` | The Australian Shepherd Club of America |
| `shortName` | ASCA |
| Sport label | "Scent Detection" |
| Registration field | **ASCA Registration #** — accepts three id types: **LEP / QT / REGULAR** (QT = QTracker, needed for titles to be tracked). Label per the entry form: "ASCA Registration # (LEP/QT/REGULAR)". |

> Trademark: "ASCA® is a registered trademark for The Australian Shepherd Club of America." Despite the breed-club name, ASCA Scent Detection is an **all-breed** program.

**Exhibitor agreement + footer language** — sourced from the *ASCA Scent Detection Entry Form* (rev. 2020-10-08); verbatim text in **§11.2**. It is a 20-clause release (Texas law, Brazos County venue) plus a definitional footer ("AS USED HERE, ASCA® MEANS…"). The form's class grid (NOV/OPEN/ADV/EXC + NOV C/OPEN C/ADV C/EXC C × Containers/Interiors/Exteriors/Vehicles, with FEO = For Exhibition Only) confirms §9.2's Level-C model. *(The 2020 form predates the June 2026 Champion level, so Champion isn't on it — the agreement text is unaffected.)*

### 9.2 · Class & competition structure (Tier 2)

**Levels (5, successive):** Novice → Open → Advanced → Excellent → **Champion** (Champion Detection Level). Note the vocabulary is **disjoint** from both AKC and UKC — "Open" and "Champion" are ASCA-only level names; the 3rd level is "Advanced," not Superior/Excellent.

**Elements (4):** Containers · Interiors · Exteriors · Vehicles. *(No HD, no Buried.)* Hides cannot be buried (rule 4.3.5).

**"Level C" (Continue) variant — ASCA's distinctive dimension.** Each of the four base levels (Novice/Open/Advanced/Excellent — *not* Champion) has a base class **and** a parallel **"Level C"** class:
- Base class: **3 qualifying scores** per element → element title (e.g. `SCNc`).
- Level C: **7 additional (10 total)** qualifying scores → Level C element title (e.g. `SCNc-C`).
- Level C = "**Continue**" — for teams who want to keep earning titles at a level rather than move up, or who aren't ready to move up. A team may sit in Level C indefinitely, and may return to it after moving up.
- **Critically, Level C is NOT an ownership division** like AKC/UKC's A/B — it is a *progression/continuation* track. A dog can't run both `Novice Level C` and `Open Level` of the same element in one trial.

**Scent by level** — club picks one scent per level from the Scent Chart (Ch. 2), by regional "Line":
| Line | Novice | Open | Advanced | Excellent |
|---|---|---|---|---|
| Line 1 (US) | Birch | Anise | Clove | *no new scent* |
| Line 2 (Canada) | Wintergreen | Pine | Thyme | *no new scent* |
| Line 3 (Europe) | Lavender | Eucalyptus | Bay | *no new scent* |

(Excellent adds no new odor — it reuses the lower-level scents. A trial that offers higher levels stacks the lower scents too.)

**Per-level element charts** specify area / max time / # hides / max faults / # QS. E.g. Novice Containers = 12 identical boxes, 2.5 min, 1 hide, ≤2 faults, 3 QS for title. Hide counts grow with level (Novice 1 → Open 1–2 → higher).

### 9.3 · Scoring model — *varies by level within the registry*

- **Novice → Excellent: pass/fail.** Placements = fewest faults, then fastest time, then **coin flip** on a tie. ≤2 faults to qualify; an incorrect call ends the search.
- **Champion: points-based** (a different model entirely). 100 points possible per trial, divided across total correct calls (hides + "finish" calls); −2 per incorrect call / false alert / missed finish / fault. Trial score floored at 0, and **must stay ≥60** to bank points. Champion *titles* accumulate points: **SCTCH-1** = 500, **SCTCH-2** = 1000, **SCTCH-3** = 1500, **SCTCH-4** = 2000, then +500 each.
- **Champion searches are not broken out by element** — 3–5 mixed search areas (interior+vehicle+container combined), 10–18 total hides, possibly combination odors. Structurally unlike the lower levels' single-element searches.
- Handler calls **"Alert"** at Novice, **"Finish"** at Open/Advanced/Excellent.

### 9.4 · Title scheme

`SC` + level letter + element letter: Novice `SCN{c,i,e,v}` · Open `SCO…` · Advanced `SCA…` · Excellent `SCE…`. All four elements at a level → `SCN4 / SCO4 / SCA4 / SCE4`. Level C adds a `-C` suffix (`SCNc-C`, `SCN4-C`). Champion → `SCTCH-1…4` (then +500 pts each).

---

## 10 · Cross-registry schema synthesis — what AKC + UKC + ASCA *together* require

With all three registries known, the schema can be designed against real divergence. The headline: **almost nothing about class structure is shared across registries.** Concretely, the schema must NOT hardcode any of these:

| Dimension | AKC Scent Work | UKC Nosework | ASCA Scent Detection |
|---|---|---|---|
| Sport label | "Scent Work" | "Nosework" | "Scent Detection" |
| # levels | 4 (Detective: 1) | 5 | 5 |
| Level names | Novice, Advanced, Excellent, Master | Novice, Advanced, Superior, Master, Elite | Novice, Open, Advanced, Excellent, Champion |
| Elements | Container, Interior, Exterior, **Buried**, **HD**, **Detective** | Container, Interior, Exterior, Vehicle, **HD** | Containers, Interiors, Exteriors, Vehicles |
| Element grouping | **Divisions** (Odor Search / HD / Detective) | flat | flat |
| Per-element level differences | **Detective = 1 level, no sections** | HD uses "Excellent", no Elite | — |
| Class sub-division | **A/B at Novice only** (ownership) | **A/B at every level** (ownership) | **Level C at 4 base levels** (continuation, *not* ownership) |
| Scoring model | pass/fail, faults/time | pass/fail, ≤1 fault | pass/fail **except Champion = points** |
| Registration field | AKC reg # (or PAL/ILP) | UKC reg # / PL / LP / TL | QTracker # |
| Title scheme | Basic + Elite per division; SWD | NC…/NN…/NWCH/NWGC | SC…/SCN4/SCTCH-n |

**Schema requirements this forces:**
1. **Levels are data, per (registry, sport)** — variable count, disjoint label sets. No shared `levels` enum, no 4- or 5-level assumption.
2. **Elements are per (registry, sport)**, and *level sets can be per-element* — UKC HD (4 levels, "Excellent") and **AKC Detective (exactly 1 level, no sections)** both prove this. Model `element.levels`, not one list per sport. An element may declare a single level with no variants.
3. **"Class sub-division" is a generalized concept, not an A/B boolean.** Each (registry, level) declares a list of **class variants**, each with its own semantic + titling rule:
   - ownership-based (AKC/UKC "A"/"B"), or
   - continuation-based (ASCA base / "C").
   Don't model this as `section: "A" | "B"`. Model `variants: [{ key, label, kind: "ownership" | "continuation", titlingRule }]` per level, possibly empty.
4. **Scoring model can vary *by level*, not just by registry** (ASCA pass/fail vs. Champion points). The scoring strategy is a property of `(registry, sport, level)`.
5. **Registration-field identity varies** — label *and* the set of acceptable id types (UKC accepts 4 kinds; ASCA's QTracker is optional-but-needed-for-titles).
6. **Elements may carry an optional `division` grouping** (AKC's Odor Search / HD / Detective). Not needed to render the publishing config, but the field should exist so the future titles/awards surface (High Combined Division, division-scoped titles) isn't blocked.
7. **Unsupported registry = hard error** (per §7 Q4) — no fallback template.

**Build implication:** the AKC-extraction refactor (§6 steps 1–2) should target *this* §10 shape, not the narrower §4/§8.5 AKC-or-UKC-only drafts. Doing the extraction against the three-registry spec avoids a second refactor when UKC/ASCA land. Title schemes (UKC §8.4, ASCA §9.4) are **out of day-one scope** — they belong to a future titles/awards surface, not the trial-publishing config — but are captured so they aren't re-derived.

### 10.1 · Odor model — noted, but OUT of day-one scope

The registries differ in *how odor relates to level*. This is a **course-design / scoring-enforcement** rule, not a class-structure or legal-language fact — the day-one publishing surfaces only ever *display* a level's odor(s), they never enforce selection. So model this only if/when a judge course-setup tool or scoring engine is built. Captured here so it isn't re-derived:

| Registry | Odor model | Rule |
|---|---|---|
| **UKC** | **required-per-level** (1:1) | Each of the 5 levels has exactly one designated odor (Novice Birch · Advanced Anise · Superior Clove · Master Myrrh · Elite Vetiver). At least one hide at that level **must** carry the level's odor — the odor *is* the level marker. |
| **AKC** | **permitted-ceiling** (grows by level) | Four odors, each with a *minimum* level: Birch≥Novice, Anise≥Advanced, Clove≥Excellent, Cypress≥Master. A level permits any odor at/below its tier; **nothing is required** (every level may run on Birch alone). Cypress is illegal below Master. |
| **ASCA** | **chosen-per-level from a regional line** | Club picks one scent per level from a Line column (Ch. 2): e.g. Line 1 US = Birch/Anise/Clove; Excellent adds no new scent. Higher-level trials stack the lower-level scents. |

If ever modeled: a per-registry `odorModel: "required-per-level" | "permitted-ceiling" | "chosen-per-level"` plus a per-odor `minLevel` (AKC) or per-level `odor` (UKC) / `odorColumn` (ASCA). **Do not build for launch** — `name`-of-odor display is all the premium/entry-blank needs, and that's already covered by the per-level odor data in §7.5/§8/§9.

---

## 11 · Exhibitor agreement legal text (verbatim — for `ukc.ts` / `asca.ts`)

Copy these into the `exhibitorAgreement` field of each registry config (the AKC equivalent lives in `apps/myk9show/src/features/registries/akc.ts:10–20`). Verbatim from the official entry forms; obvious OCR artifacts normalized, wording preserved. **Confirm against the current official form before customer launch** (forms revise).

### 11.1 · UKC — from the Official UKC Performance Entry Form (FO135FBL, rev. 12-25)

> All events are held under the Official Rules and Regulations of the United Kennel Club. Absolutely no alcoholic beverages, illegal drugs or firearms will be allowed on the grounds or in the buildings on the day of a UKC Licensed event. UKC, its agents and employees, and the host club assume no responsibility for any loss, damage, or injury sustained by spectators or by exhibitors and handlers, or to any of their dogs or property, and further assume no responsibility for injury to children not under the control of their parents or guardians. UKC and the host club are not responsible for loss, accidents or theft.
>
> By signing this form, I hereby agree to waive any claim, action, or lawsuit and further agree to indemnify and hold UKC, the host club and any approved UKC Judge harmless from any claims, actions or lawsuits resulting from my participation in this event, and any action, decision or judgment made by any UKC or host club representative or approved Judge under the official UKC Rules and Regulations governing this event. I acknowledge that the current Official UKC Rules and Regulations (**Nosework**) have been made available to me, and that I am familiar with their contents. My signature indicates that I understand and agree to the above and to abide by all of the current Official UKC Rules and Regulations.
>
> I have read and agree to the waiver on this form.

*(The bracketed/bold "(Nosework)" replaces the generic Performance form's rule-set list, which omits Nosework. Registration eligibility line, for the registration-field help text: "Dog must not be entered without a permanent UKC registration number, a UKC Temporary Listing number or a UKC Performance Listing/Limited Privilege number.")*

### 11.2 · ASCA — from the ASCA Scent Detection Entry Form (rev. 2020-10-08)

> IMPORTANT LEGAL AGREEMENT — Please read the following carefully as it, among other things, may prevent you from suing ASCA® and persons/entities affiliated with it. This agreement could even require you to defend them from demands and suits by third parties that include an assertion of wrongdoing by you. (1) The person signing this Agreement represents being authorized to enter into it on behalf of him/herself, as well as (if different) the owner(s)/exhibitor(s)/handler(s) of the dog(s) for which an entry form is being submitted (all these parties collectively referred to herein as "Applicant"). (2) "Releasees" here collectively refers to the Australian Shepherd Club of America® (ASCA®); its affiliate clubs; and the officers and board of directors, staff, contractors, insurers, attorneys, and agents of ASCA® and of those clubs. (3) This Agreement voluntarily is entered into by Applicant in exchange for the acceptance of the associated entry form and permission to participate in related activities. (4) Applicant agrees to abide by the rules and regulations of ASCA® and any other rules and regulations applicable to this event. (5) Applicant certifies that the entered dog will not pose a hazard to people, property, stock animals, or other dogs, and further that the dog is current with rabies shots along with any other vaccinations required by its state of residence. (6) Applicant acknowledges and assumes the risks to Applicant and Applicant's dog associated with participation in the event, among which could be ones associated with poor condition of the facilities and surrounding areas; security measures or lack of them; electrical appliances; fittings; show rings; the presence of unfamiliar persons; and the presence/involvement of other animals — whether stock, dogs, or otherwise. (7) Applicant further agrees to comply with all recommended and required health and safety precautions, among which may be those related to social distancing; quarantining; wearing of face coverings; and non-participation of persons exhibiting symptoms or for whom there otherwise has been a likelihood of recent exposure to COVID-19 or other contagious diseases. (8) Applicant additionally acknowledges and agrees to assume the risks associated with taking part in the event though others might neglect compliance with health and safety precautions/requirements or pose an undue risk of spreading disease. For example, as is true as to any public event, there is some risk that Applicant and/or those affiliated with Applicant may catch COVID-19 or another contagious disease at the event. (9) To the maximum extent permissible, this release is to be interpreted under Texas law, without application of its choice of law rules. (10) To the extent that Applicant — or another party suing on behalf of Applicant, or suing to recover based on injuries/death/damage to Applicant/Applicant's dog/Applicant's property — sues ASCA® (or a board member or staff member or agent of ASCA®) as a defendant, the sole appropriate forum (to the maximum extent permitted by law) for the suit shall be the state or federal courts serving Brazos County, Texas (where ASCA® has its headquarters). (11) Applicant hereby releases and waives any claims Applicant otherwise might assert against the Releasees as to any injury or damage claim connected in any way to any alleged act or omission arising out of, or occurring concurrent with, the event and related activities, interactions, communications, and even adjacent premises. (12) This release is made not only as to Applicant but also for anyone who might assert a claim on behalf of Applicant or based on purported injury or damage to Applicant/Applicant's dog/Applicant's property, as well as any heir, beneficiary, assignee, executor, trustee, agent, or survivor of Applicant. (13) Applicant further agrees to assume sole responsibility for and indemnify and hold Releasees harmless from related claims, demands, judgments, and settlement payments. (14) These waiver, release, and indemnification provisions extend even to claims or demands asserting that the acts or omissions resulted in bodily injury or death or from intentional wrongdoing, as well as to attorney fees and other costs of defense. (15) The duties of indemnification further extend to any claims or demands asserted against Releasees that are alleged to have arisen out of the acts or omissions of Applicant, Applicant's dog, or others affiliated with Applicant. Among other things, this means that Applicant would pay the legal defense of Releasees if someone sued them based on a claim Applicant carelessly exposed the claimant to COVID-19. (16) Applicant's promises in this agreement apply without regard to the type of claim or cause of action asserted against Releasees. (17) To the extent any provision of this agreement is unenforceable, the remainder of it nonetheless is to be enforced. (18) This agreement is to be interpreted to provide Releasees with the maximum permissible legal protection from — among other things — claims and suits pursued by Applicant (and/or those acting on behalf of Applicant or over injury/damage to Applicant), as well as from ones based on the purported wrongful acts or omissions of Applicant. (19) Nothing in this Agreement requires you to indemnify Releasees from claims by third parties that involve no allegations of improper acts or omissions by you, those affiliated with you, nor your dog(s). (20) Applicant acknowledges having read, understood, and had the opportunity for independent legal review of this document prior to signing it.
>
> AS USED HERE, "ASCA®" MEANS THE OWNER AND THE OPERATOR OF THE EVENT PREMISES, THE AUSTRALIAN SHEPHERD CLUB OF AMERICA, ITS AFFILIATE CLUBS, AND EACH OF THEIR MEMBERS, OFFICERS, DIRECTORS, EMPLOYEES, SHOW CHAIRMEN, SHOW COMMITTEES AND AGENTS.
>
> PERSON SIGNING THIS FORM IS RESPONSIBLE FOR ALL ERRORS AND RULE VIOLATIONS.

> **COVID caveat:** the ASCA agreement is heavily COVID-19-era (clauses 7–8, 15). It's the current official form text, so use it verbatim for fidelity — but flag for the attorney review gate (the TOS/legal review already tracked in [[project_legal_content]]) whether the pandemic clauses should stay.

---

*End of scoping document. No longer deferred — scent work for AKC + UKC + ASCA is a day-one commitment (banner at top). UKC (§8) and ASCA (§9) are populated on paper; §10 is the cross-registry schema spec. The remaining day-one engineering is the AKC-extraction refactor (§6 steps 1–2) built against §10.*
