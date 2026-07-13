## Context

The registry closeout verification change identified UKC S7.2 as partially covered: `ukc-nosework-trial-report` is already registered, filled, and tested. The remaining UKC packet work should reuse existing organization-form and Reports-page patterns rather than adding a separate closeout UI.

UKC Entry and Change Entry PDFs are fillable AcroForms already stored in `docs/UKC-forms/`. The official judges books and trial score sheet are static PDFs, so this slice will register them as official templates and expose them as packet downloads, while only filling the forms that have fields.

## Goals / Non-Goals

**Goals:**

- Keep all UKC packet actions on `/shows/:showId/reports`.
- Fill known UKC Entry and Change Entry fields from existing entry-form/report data.
- Leave owner signature, move-to, correction, and other user-written fields editable.
- Add static official UKC judges book and score sheet templates to the template inventory.
- Ensure UKC forms prefer UKC dog registration numbers when available.
- Add tests for template inventory, value mapping, real PDF fill, and Reports-page action visibility.

**Non-Goals:**

- Do not add a new registry closeout page.
- Do not implement UKC electronic submission automation.
- Do not infer exhibitor-requested move-up target classes.
- Do not mark UKC launch-ready until print/PDF checks and submission guidance are separately verified.

## Design

### Reports Surface

Add UKC report IDs to the existing report registry:

- `ukc-nosework-entry-form`
- `ukc-nosework-change-entry-form`
- `ukc-nosework-judges-book-element`
- `ukc-nosework-judges-book-handler-discrimination`
- `ukc-nosework-trial-score-sheet`

The first two support dog filtering. Change Entry also uses the selected class when available so the current class can be prefilled as "Move from". Static templates can be selected and downloaded from Reports without new data transforms.

### PDF Fills

Create UKC-specific field modules and builders:

- Entry form: armband, UKC registration number, registered name, call name, breed, sex, owner name/address/city/state/postal/email/phone.
- Change Entry form: host club, date, breed, variety, sex, armband, UKC registration number, dog name, move-from class, owner name.

Packet downloads for all dogs should flatten each filled page before appending to a packet, matching the AKC entry packet pattern. Single-form downloads remain editable.

### Registration Preference

Extend `useEntryFormData` with an optional preferred registration organization. AKC form calls continue to prefer AKC by default. UKC form calls pass `UKC` so the official UKC number is used when a dog has multiple registrations.

### Static Templates

Static judges book and trial score sheet templates have no AcroForm fields. Register them with empty `requiredFields` and download their bytes directly from the organization form URL.

## Risks / Trade-offs

- Static score sheet/judges books are not filled in this slice. This is acceptable for the first packet implementation because the official PDFs have no fields and the current Reports page already has printable class-level alternatives.
- UKC form field names include generic names such as `undefined_2`; tests must assert the official field names we rely on.
- Registration preference changes touch shared entry form data. Keep the option explicit and default AKC behavior unchanged.
