# Multi-Registry Support — Scoping Document

> **Status:** Active

**LAUNCH SCOPE (decided 2026-06-29):** the **scent sport** is being advertised for **AKC, UKC, and ASCA on day one** — this is a launch commitment, not post-MVP. The day-one bar is narrow but firm: those three registries' *scent work / nosework* class structures and legal language must render correctly across the publishing surfaces. Other sports (obedience, conformation) and other registries remain post-MVP. **Still needed for day one:** (1) the AKC-extraction refactor (§6 steps 1–2), (2) UKC populated (§8 — done on paper), (3) **ASCA scent-work reference materials** (rulebook/premium/entry form) — not yet supplied.

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

*End of scoping document. No longer deferred — see the launch-scope banner at top: scent work for AKC + UKC + ASCA is a day-one commitment. §8 (UKC Nosework) is build-ready; AKC extraction (§6 steps 1–2) and ASCA reference capture are the remaining day-one work.*
