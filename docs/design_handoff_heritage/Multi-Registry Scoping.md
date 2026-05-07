# Multi-Registry Support — Scoping Document

*Status: scoping draft · not yet implemented*

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

## 7 · Open questions to resolve before building

1. Does a single trial ever span two registries? (e.g. AKC + UKC dual-licensed). If yes, the data model is `registries: ["AKC", "UKC"]` not `registry: "AKC"`.
2. Is *sport* a top-level concept or nested under registry? Most registries support multiple sports with different class structures — sport feels top-level with registry as a modifier.
3. Should registry choice influence which of the 8 visual styles is offered as a default? (E.g. UKC trials default to a less formal style.) Probably no — let users pick freely.
4. For registries we don't yet support, what's the failure mode? Hard error, or generic fallback template with a "verify legal language" warning?

---

*End of scoping document. Implementation deferred until a concrete user need surfaces.*
