# Design: Premium Bridge

**Date:** 2026-05-03
**Status:** Approved — ready for implementation planning
**App:** `apps/myk9show`

---

## 1. Overview

A dog show "premium" is the official event document a club submits to its governing organization (AKC, UKC, etc.) for approval. Once approved, the org posts the PDF on its website; exhibitors download it to learn about the show and fill out entry forms.

The Premium Bridge connects myK9Show's structured show data to this document in both directions:

- **Phase 1 — Export (v1):** Secretary creates a show in myK9Show and generates a ready-to-submit premium PDF from that data. myK9Show becomes the source of truth from the start of the process.
- **Phase 2 — Import (planned, may never be built):** Secretary uploads an approved premium PDF and the system extracts its data to pre-fill the Show Creation Wizard.

Export ships first because it is technically simpler (structured data → formatted document, no probabilistic extraction) and creates better workflow value (the platform becomes step one, not an afterthought). Export also produces training data that improves import quality if import is ever built.

---

## 2. Goals

- Eliminate the duplicate data-entry loop: club info entered once in myK9Show, never re-typed into a Word document
- Generate org-compliant premium PDFs for AKC and UKC shows
- Allow per-club templates for supplemental fields (vet info, accommodations, hospitality) that don't change between shows
- Support multiple templates per club, keyed by sport/trial type, with automatic selection and a default fallback
- Capture correction data from day one to enable prompt improvement over time

---

## 3. Out of Scope (v1)

- Self-serve template sharing between clubs
- Automatic submission to AKC/UKC portals
- Premium versioning / change tracking after org submission
- Phase 2 import (designed for, not built)
- Org formats beyond AKC and UKC

---

## 4. Architecture

```
Phase 1 — Export

  Show data (DB)  ──┐
                    ├──► Edge fn: generate-premium ──► Claude (narrative sections)
  Club template  ──┘         │
                             ▼
                      GeneratedPremium JSON
                             │
                             ▼
                   Client: @react-pdf/renderer
                   (org-specific template component)
                             │
                             ▼
                      Downloaded PDF
                      + correction log entry

Phase 2 — Import (future)

  Upload PDF/DOCX
       │
       ▼ (pdf.js / mammoth.js — client-side)
  Extracted text
       │
       ▼
  Edge fn: extract-premium + Claude
  (few-shot examples from Phase 1 correction log)
       │
       ▼
  ExtractedPremium JSON (per-field confidence)
       │
       ▼
  Pre-filled Show Creation Wizard
  (green / amber / red fields)
       │
       ▼
  Correction log entry
```

---

## 5. Data Model

### `club_premium_templates`

A club can have multiple templates. Each is associated with an optional trial type for auto-selection; a `default` flag marks the fallback.

```sql
create table club_premium_templates (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references clubs(id) on delete cascade,
  name            text not null,                     -- "Scent Work", "Outdoor Shows", etc.
  trial_type      text,                              -- nullable; matches show trial_type for auto-select
  is_default      boolean not null default false,
  style           text not null default 'classic' check (style in ('classic', 'modern', 'minimal')),
  vet_clinic_name     text,
  vet_clinic_address  text,
  vet_clinic_phone    text,
  accommodations      jsonb,  -- [{name, address, phone}]
  hospitality_notes   text,
  awards_description  text,
  additional_notes    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Only one default per club
create unique index club_premium_templates_default_unique
  on club_premium_templates(club_id)
  where is_default = true;

-- Auto-select index
create index club_premium_templates_club_type
  on club_premium_templates(club_id, trial_type);
```

### `premium_generations`

Correction log. One row per generated premium. `field_overrides` captures any per-show deviation from the template or Claude-generated narrative.

```sql
create table premium_generations (
  id              uuid primary key default gen_random_uuid(),
  show_id         uuid not null references shows(id) on delete cascade,
  club_id         uuid not null references clubs(id),
  template_id     uuid references club_premium_templates(id),
  org             text not null,           -- 'AKC', 'UKC'
  generated_at    timestamptz not null default now(),
  field_overrides jsonb not null default '{}',
  -- {field_name: {template_value, final_value}} for template overrides
  -- {field_name: {generated_value, final_value}} for narrative edits
  narrative_edits jsonb not null default '{}'
);
```

### No new columns on `shows`

Premium generation is triggered on demand and the result is ephemeral (downloaded PDF). No premium state is stored on the show record.

---

## 6. Phase 1 — Export Detail

### 6a. Entry Points

**Show detail page / Pipeline dashboard:** A "Generate Premium" button appears when the show has sufficient data (org, dates, venue, at least one trial). Button is hidden for shows with no org set.

**Readiness check before generating:** If the club has no matching template and no default template, surface a banner: "Your club doesn't have a premium template yet — add vet info, accommodations, and hospitality to speed up premium generation." Generating without a template is still allowed; those sections render as clearly marked blanks in the PDF.

### 6b. Template Auto-Selection

```
1. Find templates for club where trial_type matches show.trial_type → use first match
2. If none, find template where is_default = true → use it
3. If none, proceed with empty supplemental fields
```

### 6c. Edge Function: `generate-premium`

**Input:** `{ show_id: string }`
**Auth:** Requires SECRETARY, CLUB_ADMIN, or SITE_ADMIN. SECRETARY is scoped to clubs they are assigned to; CLUB_ADMIN to their own club; SITE_ADMIN unrestricted. EXHIBITOR and JUDGE cannot generate premiums.

**Steps:**
1. Fetch show + trials + classes + judges from DB
2. Resolve club premium template (auto-selection above)
3. Call Claude with a structured prompt asking it to generate:
   - Show hours paragraph (derived from trial start times)
   - Trial information section (level requirements, move-up rules — org-specific boilerplate + show-specific details)
   - Any other narrative sections required by the org format
4. Return `GeneratedPremium` — a typed object containing all fields (show data + template data + Claude-generated narratives)

Claude's role is limited to narrative generation, not data extraction. All factual fields (dates, fees, judges, venue) come directly from the DB — Claude never makes up factual content.

**`GeneratedPremium` shape:**
```typescript
interface GeneratedPremium {
  org: 'AKC' | 'UKC'
  style: 'classic' | 'modern' | 'minimal'  // from template; overridable per-show in GeneratePremiumPanel
  show: { name, startDate, endDate, venue, entryOpenDate, entryCloseDate,
          preEntryFee, dayOfFee, acceptChecks, acceptCash }
  club: { name, logo_url }
  secretary: { name, email, phone, mailingAddress }
  officials: { chairman, steward }
  trials: Array<{
    name, date, startTime, eventNumber, type,
    judges: Array<{ name, elements: string[] }>
    classes: Array<{ element, level, section }>
  }>
  supplemental: {
    vetClinic: { name, address, phone } | null
    accommodations: Array<{ name, address, phone }>
    hospitalityNotes: string | null
    awardsDescription: string | null
    additionalNotes: string | null
  }
  narratives: {
    showHours: string       // Claude-generated
    trialInformation: string // Claude-generated
  }
}
```

### 6d. PDF Rendering

Client-side using `@react-pdf/renderer` (new dependency — add to `apps/myk9show/package.json`). Two template components:

- `AKCPremiumTemplate` — follows AKC premium layout conventions
- `UKCPremiumTemplate` — follows UKC premium layout conventions

> **Implementation note:** Before building the template components, study 2–3 real AKC premiums and 2–3 real UKC premiums to confirm required sections, ordering, and any org-mandated formatting rules. AKC and UKC each publish premium guidelines; the implementer should read these before writing the template layout. The real premiums in `docs/plans/examples/` (if saved there) are a starting point.

Both accept `GeneratedPremium` as props and render a download-ready PDF. Club logo (from `club.logo_url`) is embedded in the header. Org boilerplate (waiver text, rules references) is static strings embedded in each template component.

**Missing supplemental fields** render as `[REQUIRED — add before submitting]` placeholder text in the PDF so the secretary knows exactly where to fill gaps before submitting to the org.

### 6e. Per-Show Overrides

Before downloading, the secretary sees a preview panel listing all supplemental fields and a style picker. Any field — including the visual style — can be overridden for this show without modifying the club template. The style picker shows three options (Classic / Modern / Minimal) defaulting to whatever the club template specifies. Overrides are ephemeral in the UI — they only persist if the secretary downloads (at which point they're logged to `premium_generations.field_overrides`).

### 6f. Correction Logging

On download, write one row to `premium_generations`:
- `field_overrides`: any template fields changed for this show
- `narrative_edits`: any Claude-generated narrative sections the secretary edited before downloading

If the same template field has been overridden in 3+ consecutive generations for the same club, surface a non-blocking prompt on the Club settings page: "You've changed [field] for your last 3 shows — update your template?"

---

## 7. Phase 2 — Import Detail (planned, may not be built)

Documented here so the data model and edge function naming don't collide if built later. No implementation planned.

### Why it may never be needed

As Phase 1 generates premiums, secretaries enter data into myK9Show first rather than in Word. The import use case — "I already have a premium, create the show from it" — becomes less common as adoption grows.

### If built: approach

- **Text extraction:** `pdf.js` (PDF) or `mammoth.js` (DOCX), client-side. AKC and UKC premiums are always digitally authored, not scanned, so pdf.js text extraction is reliable.
- **Edge function:** `extract-premium` — sends extracted text to Claude with a structured extraction prompt. Returns `ExtractedPremium` with per-field confidence scores (`'high' | 'low'`).
- **Few-shot examples:** `premium_generations.narrative_edits` from Phase 1 provides real premium text → correct field value pairs. Add the most useful examples to the Claude prompt to improve extraction accuracy.
- **Wizard integration:** `ExtractedPremium` maps to `WizardStore` state. High-confidence fields pre-fill normally; low-confidence fields render with amber highlight and a "verify this" tooltip; missing fields render red.
- **Confidence calibration:** If a field is marked `'high'` but corrected by the secretary, that's a calibration signal logged to `premium_generations` for prompt tuning.

### Fields never in any premium (always manual in import)

- UKC/AKC event numbers (assigned by org post-approval)
- Max entries per class
- Scoring config (timer mode, hides_known, distraction_count, time_limit_seconds)

---

## 8. Error Handling

| Scenario | Behavior |
|---|---|
| Claude API error during generation | Toast: "Couldn't generate narrative sections — your other show data is ready. Download a partial premium or try again." Partial PDF still downloadable with placeholder narratives. |
| Club has no template | Warning banner before generating; placeholder text in PDF for supplemental fields. |
| Show missing required fields (no org, no dates) | "Generate Premium" button disabled with tooltip listing missing fields. |
| PDF.js fails to extract text (import) | Toast: "Couldn't read this PDF — try uploading as DOCX, or fill in manually." Wizard opens empty. |
| Low overall extraction confidence (import) | Toast: "We couldn't extract much from this premium — most fields will need to be filled in." Wizard opens with mostly red fields. |

---

## 9. Testing

### Phase 1

- Unit tests for template auto-selection logic (match by trial_type → default → empty)
- Unit tests for `GeneratedPremium` assembly (show data + template merge)
- Unit tests for field override logging shape
- Unit tests for "3 consecutive overrides" detection
- Component tests for `AKCPremiumTemplate` and `UKCPremiumTemplate` — render with complete data, render with missing supplemental fields (verify placeholder text appears)
- Integration test: generate-premium edge function returns valid `GeneratedPremium` for a seeded show

### Phase 2 (if built)

- Unit tests for `ExtractedPremium → WizardStore` mapping
- Unit tests for confidence-to-highlight-color mapping
- Integration test: extract-premium edge function on real premium text returns correct fields
- "Fields never in any premium" test: verify event number, max entries, scoring config are always returned as `null` / missing

---

## 10. Implementation Order

1. DB migration — `club_premium_templates` + `premium_generations` tables
2. Club settings UI — template CRUD (name, trial_type, vet info, accommodations, hospitality, awards)
3. Edge function — `generate-premium` (Claude narratives + data assembly)
4. PDF template components — `AKCPremiumTemplate`, `UKCPremiumTemplate`
5. "Generate Premium" button + preview panel + per-show overrides + download
6. Correction logging on download
7. "Update your template?" nudge on Club settings
8. QA walk — create a show, set up club template, generate AKC premium and UKC premium end-to-end
