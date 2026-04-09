# AKC XML Results Export — Design Spec

**Date:** 2026-04-09
**Status:** Draft
**Route:** `/secretary/results-submission` (existing page)

## Overview

Trial secretaries need to submit electronic results to AKC after every scent work trial. Today they use a Microsoft Access application (mySWT) to generate an `electres.xml` file and email it manually. This feature replicates that workflow natively in myK9Show — one click sends the XML to AKC with the secretary CC'd, and the submission is recorded automatically.

The infrastructure already exists: `ResultsSubmissionPage` handles the UI, and `@myk9/secretary` has an `AKCScentWorkFormatter` stub. The work is to implement the formatter with real logic, build a data-fetch hook, wire the page to real data, and add email sending via a new Edge Function.

## Architecture

```
ResultsSubmissionPage
  └── useAKCSubmissionData(showId)        ← new hook, direct Supabase
        → AKCSubmissionData
  └── AKCScentWorkFormatter.formatXml()   ← replaces stub, pure function
        → XML string
  └── supabase.functions.invoke('send-results')  ← new edge function
        → sends via Resend, CC's secretary, records submission
```

## Decisions

| Decision                   | Choice                                                 | Rationale                                                                                        |
| -------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| UI location                | Existing `ResultsSubmissionPage`                       | Page already has the right flow: show selector, XML preview, download, submission history        |
| Multi-trial                | All trials in one XML file                             | AKC's `electres.xsd` wraps all trials as `<event>` nodes under one `<sender>`                    |
| Entry type extension       | `AKCSubmissionEntry extends SubmissionEntry`           | Keeps base type lean; AKC-specific fields (owner address, gender) don't pollute other formatters |
| Submission email config    | `submissionEmail: string \| null` on `ResultFormatter` | Each formatter owns its destination; adding UKC/NACSW later requires no config changes           |
| Email sending              | Supabase Edge Function + Resend                        | Secretary gets a CC receipt; submission auto-recorded on send                                    |
| Secretary CC               | `cc` field in Resend call                              | Secretary receives exact copy of what was sent to AKC — serves as receipt                        |
| Destination email security | Looked up server-side by `organization:sportType`      | Client cannot redirect submissions to arbitrary addresses                                        |
| Pre-flight warning         | Banner for missing AKC reg numbers                     | Missing numbers cause AKC rejection; warn before sending, don't block                            |
| Manual fallback            | Download + "Mark as Submitted"                         | Secretary can always download and email manually if send fails                                   |

## Section 1 — Type Changes (`packages/secretary/src/results/types.ts`)

### Changes to existing types

**`SubmissionTrial`** — add:

```ts
eventNumber: string | null; // maps to trials.event_number (AKC event ID)
```

**`SubmissionShow`** — add:

```ts
secretaryName: string | null; // from logged-in user's people record
secretaryEmail: string | null; // drives sender responseEmail + CC
```

**`SubmissionData`** — change:

```ts
// Before:
trial: SubmissionTrial

// After:
trials: SubmissionTrial[]
```

**`SubmissionEntry`** — add:

```ts
trialId: string; // groups entries by trial for multi-event XML
classId: string; // groups entries by class within a trial
```

**`ResultFormatter`** — add:

```ts
submissionEmail: string | null; // destination for send-results edge function; null = send disabled
```

### New types

**`AKCSubmissionEntry extends SubmissionEntry`**:

```ts
dogRegisteredName: string | null       // from dog_registrations.registered_name
dogGender: 'D' | 'B' | null           // dogs.sex: Male → D, Female → B
ownerName: string | null               // people.first_name + last_name
ownerAddress: {
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null               // used to detect Canadian vs US address
} | null
timeLimitSeconds: number | null        // classes.time_limit_seconds
entryStatus: string | null             // entries.entry_status
checkInStatus: string | null           // entries.check_in_status
resultStatus: string | null            // entries.result_status
```

**`AKCSubmissionData`**:

```ts
interface AKCSubmissionData {
  show: SubmissionShow; // with secretaryName + secretaryEmail
  trials: SubmissionTrial[]; // each with eventNumber
  entries: AKCSubmissionEntry[];
}
```

## Section 2 — Data Fetch Hook (`useAKCSubmissionData`)

**File:** `apps/myk9show/src/hooks/queries/useAKCSubmissionData.ts`

**Input:** `showId: string`
**Output:** `{ data: AKCSubmissionData | null, isLoading, isError }`

**Query sequence:**

Round 1 (parallel):

- Show + club name: `shows` joined to `clubs` via `club_id` → `clubName`
- Logged-in user's `people` record → `secretaryName`, `secretaryEmail`
- All trials for the show: `trials.event_number`, `date`, `trial_number`, `name`

Round 2 (after trials load, parallel):

- All classes for those trials: `classId`, `element`, `level`, `section`, `time_limit_seconds`, `trial_id`
- All entries for the show: filtered to `deleted_at IS NULL` only — includes withdrawn entries since they appear in the XML with `actionCode="WHLD"` and count toward `numWithdrawals`. Fields: `id`, `dog_id`, `class_id`, `trial_id`, `armband`, `search_time_seconds`, `final_placement`, `result_status`, `entry_status`, `check_in_status`, `run_order`

Round 3 (after entries load, parallel):

- Dogs: `id`, `akc_number`, `sex`, `owner_id`, `name`
- Dog registrations: `dog_id`, `registered_name`
- Owner `people` records: `id`, `first_name`, `last_name`, `street_address`, `city`, `state`, `zip_code`, `country`, `email`

Uses direct Supabase (not replication) — owner address and dog registrations are not in the replication store. React Query with `staleTime: 5 * 60 * 1000`.

## Section 3 — AKC XML Formatter

**File:** `packages/secretary/src/results/formatters/AKCScentWorkFormatter.ts`

**Interface:** Implements `ResultFormatter` with `submissionEmail: 'results@akc.org'` (placeholder — to be confirmed with AKC; also hardcoded server-side in the Edge Function).

**`formatXml(data: AKCSubmissionData): string`**

XML structure:

```xml
<?xml version="1.0"?>
<sender xmlns="http://www.akc.org"
        schemaVersion="1.0"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.akc.org electres.xsd"
        name="{secretaryName}"
        responseEmail="{secretaryEmail}">
  <event akceventid="{trial.eventNumber}"
         clubName="{show.clubName}"
         eventDate="{trial.date}">
    <class compGroup="SCWK"
           primaryClass="{mapped}"
           secondaryClass="{mapped}"
           breedCode="ALLB"
           gender="C"
           courseTime="{timeLimitSeconds}.0"
           numEntries="{n}"
           numStarters="{n}"
           numQualifying="{n}"
           numWithdrawals="{n}">
      <results akcDogRegnum="{akc_number}"
               gender="{D|B}"
               dogName="{registeredName}"
               breedCode="ALLB"
               catalogNumber="{armband}"
               courseTime="{searchTimeSeconds}"
               actionCode="{mapped}">
        <resultCode>{mapped}</resultCode>
        <ownerName>{name}</ownerName>
        <ownerAddress>
          <addressLine>{street}</addressLine>
          <city>{city}</city>
          <USState|ForeignState>{state}</USState|ForeignState>
          <USPostalCode|ForeignPostalCode>{zip}</USPostalCode|ForeignPostalCode>
        </ownerAddress>
      </results>
    </class>
  </event>
</sender>
```

**`primaryClass` mapping** (from `level + ' ' + section`):

| Input                   | Output |
| ----------------------- | ------ |
| Novice A                | SWNOVA |
| Novice B                | SWNOVB |
| Advanced (any section)  | SWADV  |
| Excellent (any section) | SWEXC  |
| Master (any section)    | SWMAST |
| Detective               | SWDC   |

**`secondaryClass` mapping** (from `element`; omitted for Detective):

| Input                  | Output   |
| ---------------------- | -------- |
| Container              | CONTAINR |
| Interior               | INTERIOR |
| Exterior               | EXTERIOR |
| Buried                 | BURIED   |
| Handler Discrimination | HANDDISC |

**`actionCode` / `resultCode` mapping:**

| Condition                          | actionCode | resultCode |
| ---------------------------------- | ---------- | ---------- |
| `entryStatus = 'withdrawn'`        | WHLD       | EXO        |
| `checkInStatus = 'absent'`         | ABSN       | A          |
| `resultStatus = 'disqualified'`    | DISQ       | A          |
| `resultStatus = 'excused'`         | EXCU       | EXO        |
| `finalPlacement` 1–4               | PLAC       | 1–4        |
| `resultStatus = 'Q'`, no placement | CNT        | Q          |
| anything else (NQ with time)       | CNT        | Q          |

**Class-level aggregates** (computed by grouping entries on `classId`):

- `numEntries` = entries where `entryStatus != 'withdrawn'`
- `numWithdrawals` = entries where `entryStatus = 'withdrawn'`
- `numStarters` = `numEntries` minus entries where `checkInStatus = 'absent'`
- `numQualifying` = entries where `resultStatus = 'Q'` or `finalPlacement >= 1`

**Canadian province detection** for address formatting: if `state` is one of ON, AB, QC, NS, NB, MB, BC, PE, SK, NL → use `<ForeignState>` / `<ForeignPostalCode>`. All others use `<USState>` / `<USPostalCode>`.

**Entries in XML:** All entries (including withdrawn) appear in the XML — AKC needs the full class roster including withdrawals. Withdrawn entries get `actionCode="WHLD"`. Absent entries get `actionCode="ABSN"`. Only truly soft-deleted entries (`deleted_at IS NOT NULL`) are excluded.

## Section 4 — Edge Function (`send-results`)

**File:** `supabase/functions/send-results/index.ts`
**Deploy:** `--no-verify-jwt` (handles auth internally)

**Request payload:**

```ts
{
  xml: string;
  filename: string; // e.g. "Norwegian_Elkhound_Assoc-Results_20260409.xml"
  organization: string; // e.g. "AKC"
  sportType: string; // e.g. "scent_work"
  secretaryEmail: string; // for CC
}
```

**Function logic:**

1. Verify the caller is authenticated (check Authorization header against Supabase JWT)
2. Look up `toEmail` from server-side map keyed on `organization:sportType`. Return 400 if not found.
3. Send via Resend:
   - `from`: platform sender (e.g. `results@myk9show.com`)
   - `to`: destination from map
   - `cc`: secretary's email
   - `reply_to`: secretary's email
   - `subject`: `"Electronic Results — {filename}"`
   - `attachments`: `[{ filename, content: Buffer.from(xml) }]`
4. Return `{ success: true }` on success, error details on failure.

**Submission email map** (server-side, not client-controlled):

```ts
const SUBMISSION_EMAILS: Record<string, string> = {
  'AKC:scent_work': 'results@akc.org', // confirm actual address before launch
};
```

## Section 5 — `ResultsSubmissionPage` Changes

**When AKC scent work formatter is selected:**

- Call `useAKCSubmissionData(selectedShowId)` instead of `buildStubData`
- Show loading skeleton in preview textarea while fetching
- Replace stub XML with `AKCScentWorkFormatter.formatXml(akcData)` once data is ready

**Pre-flight warning:**

- After data loads, count entries where `akcDogRegnum` is null or empty
- If any: show dismissible yellow banner above preview: `"{n} entries are missing AKC registration numbers and will export with a blank akcDogRegnum. Verify dog registrations before submitting."`
- Does not block download or send

**Action buttons:**

- **Send to AKC** (primary): calls `send-results` edge function. On success: auto-records submission as `status: 'sent'`, shows success toast. On failure: shows error with "Download and send manually" fallback.
- **Download XML** (outline): triggers browser download of the XML string as a file. Filename format: `{ClubName}-Results_{YYYYMMDDHHMMSS}.xml`
- **Mark as Submitted** (outline): kept for the manual path — secretary downloaded and emailed themselves

**`buildStubData` removal:** The helper is removed once real data is wired. Non-AKC formatter slots continue using stub data until their own data hooks are built.

## Testing

**`AKCScentWorkFormatter` unit tests** (`packages/secretary/src/results/__tests__/AKCScentWorkFormatter.test.ts`):

- Produces correct `<sender>` attributes from show/secretary data
- Multi-trial show produces multiple `<event>` nodes
- `primaryClass` mapping covers all 6 cases
- `secondaryClass` mapping covers all 5 elements + Detective omission
- `actionCode`/`resultCode` mapping covers all 7 conditions
- Class aggregates (numEntries, numStarters, numQualifying, numWithdrawals) computed correctly
- Canadian address uses `<ForeignState>` / `<ForeignPostalCode>`
- US address uses `<USState>` / `<USPostalCode>`
- Missing AKC reg number exports as empty string (not null/undefined)

**`useAKCSubmissionData` unit tests:**

- Returns `null` when `showId` is empty
- Maps `dogs.sex = 'Male'` → `dogGender: 'D'`, `Female` → `'B'`
- Uses `dog_registrations.registered_name` for `dogRegisteredName`

**`ResultsSubmissionPage` tests** (update existing):

- Pre-flight warning appears when entries have missing AKC numbers
- Pre-flight warning absent when all entries have AKC numbers
- "Send to AKC" button calls `supabase.functions.invoke` with correct payload
- On send success: submission recorded, success toast shown
- On send failure: error message shown
