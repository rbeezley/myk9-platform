# Organization Entry Agreement in Registration Workflow

**Date:** 2026-04-07
**Status:** Design approved

## Summary

Exhibitors must read and agree to their show's sanctioning organization's entry agreement before completing registration. This replicates the paper entry form pattern where organizations like AKC, UKC, and NACSW require exhibitors to sign an agreement covering liability, rule compliance, and arbitration terms.

The agreement text is stored per organization in a new `organization_agreements` table. The PaymentStep in the registration wizard displays the agreement in a collapsible section with a required checkbox that gates the submit button.

## Database

**Migration 122** — Create `organization_agreements` table and seed AKC agreement.

```sql
CREATE TABLE organization_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization TEXT NOT NULL UNIQUE,
  agreement_text TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

- `organization` matches the TEXT values used in `shows.organization` (e.g. "AKC", "UKC", "NACSW").
- `UNIQUE` constraint on `organization` — one agreement per org.
- No foreign key (organization is a free-text field across the schema, not a lookup table).

**RLS policies:**

- `SELECT` for authenticated users — exhibitors need to read the agreement during registration.
- `INSERT`, `UPDATE`, `DELETE` for site_admin only (via `is_platform_admin()` helper).

**Seed data:** AKC Scent Work entry agreement text (the full paragraph from the standard AKC entry form covering certification of ownership, rule compliance, liability, indemnification, and arbitration).

## UI — PaymentStep Agreement Section

**File:** `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/`

New `EntryAgreementSection` component rendered at the bottom of PaymentStep, below PaymentSummaryCard and above the submit button area.

### Layout

1. **Collapsible section** — shadcn `Collapsible` component. Collapsed by default.
   - Header: "{Organization} Entry Agreement" (e.g. "AKC Entry Agreement").
   - Trigger button with chevron icon indicating expand/collapse state.
2. **Agreement text body** — inside the collapsible content. Rendered as a scrollable block (`max-h-[300px] overflow-y-auto`) with the full agreement text. Styled with readable typography.
3. **Required checkbox** — always visible, outside the collapsible. Not hidden when collapsed — the exhibitor can see they need to check it regardless of whether they've expanded the text.
   - Label: `I have read and agree to the {organization} entry agreement above.`
4. **Loading/error states** — skeleton while fetching, error message with retry if the query fails.

### Submit gate

The checkbox state is lifted to PaymentStep (or the parent RegistrationWizardPage) and combined with existing validation. The submit/register button is disabled unless:

- Payment method is selected (existing check)
- Agreement checkbox is checked (new check)
- All other existing validations pass

### All workflow modes

The agreement section appears for all workflow modes (exhibitor, secretary_existing, secretary_new, club_admin, site_admin). Even when a secretary registers on behalf of an exhibitor, the agreement acknowledgment is required.

## Data Flow

1. `useOrganizationAgreement(organization)` — React Query hook that fetches the agreement text for the show's organization from `organization_agreements`.
2. PaymentStep receives `show.organization` (already available in the registration context).
3. `EntryAgreementSection` renders the fetched text and manages the checkbox state.
4. Checkbox state (`agreedToEntryAgreement`) is lifted via an `onAgree(boolean)` callback prop. The parent component combines it with existing validation to control the submit button's `disabled` state.

## Testing

### Hook tests (`useOrganizationAgreement`)

- Returns agreement text for a valid organization.
- Returns loading state while fetching.
- Handles error state (org not found, network failure).

### Component tests (`EntryAgreementSection`)

- Renders collapsible with org name in header.
- Agreement text visible when expanded.
- Checkbox always visible regardless of collapsed state.
- Checkbox unchecked by default.
- Calls `onAgree` callback when checkbox toggled.

### Integration tests (PaymentStep)

- Submit button disabled when agreement checkbox unchecked.
- Submit button enabled when agreement checkbox checked and payment method selected.
- Submit button still disabled if payment method missing, even with checkbox checked.
- Agreement section renders in all workflow modes (exhibitor, secretary, club_admin, site_admin).

## Out of Scope

- Per-show custom agreement addendums (clubs adding their own text on top of org agreement).
- `agreed_to_entry_agreement_at` audit timestamp on entries table (UI gate is sufficient).
- Agreement versioning or re-consent tracking.
- Agreements for organizations other than AKC (will be seeded as those orgs are needed).
