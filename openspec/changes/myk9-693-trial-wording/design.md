## Design

Preserve the secretary intent of calm, accurate guidance. Reuse the existing show/trial state and wizard; do not create a competing creation surface.

Persist only an explicit `nameOverride` on a wizard trial. The suggested weekday/ordinal label is derived data, never mutable draft state. One pure effective-name helper accepts the draft, its position among current draft trials, and the current same-show persisted trial snapshot. It returns the override when present; otherwise it derives the local calendar day and ordinal from persisted trials on that day plus earlier same-day drafts. Date moves, add/remove, and reorder therefore update generated names from current state without rewriting user-entered names.

Use that helper for the visible name field, duplicate-name validation, preview/transformation output, and both atomic and store-backed save paths. Clearing an override restores the suggested name. Interpret date-only trial values as local calendar dates; interpret timestamps with an explicit offset as instants converted to the local calendar day, so UTC boundaries cannot silently move a local wall-clock trial to another ordinal.

Version the Zustand wizard persistence and migrate legacy `name` values once: exact legacy `Weekday Trial N` labels become generated defaults (no override); all other non-empty names become explicit overrides. This conversion is safe under the pre-launch policy. No database schema, replication, or offline mutation change is expected.

### Wizard-level view context

The wizard page creates one required `WizardTrialView` from the current draft trials and the current persisted snapshot for the selected show. It contains the effective name for every draft trial keyed by its stable id, the persisted trial count, and whether the show has any trials (persisted or draft). Pass this context through validation, step content, and save actions; consumers must not accept optional trial-name snapshots or rebuild labels from array positions. The trial field, its card heading, validation banner, class/review labels, and saved names therefore describe the same draft and persisted state.

First/another add-trial copy is show-scoped: any persisted trial on any show day means “Add Another Trial”; only a show with no persisted trials and no drafts may say “Add First Trial.” Generated weekday/ordinal names remain local-day scoped. This separates the show-level question “is this the first trial in the show?” from the day-level question “what is this trial’s name?” without giving either question a second data source.

## Risks

- Cross-day trials or timezone conversion could inflate numbering; test local-day boundaries and same-day session ordering.
- Save and display names could drift; route all consumers through the effective-name helper.
- Validation, card headings, and buttons could drift from the field; require the same wizard-level view context at each consumer and test the visible surfaces together.
- Legacy custom names must survive persistence migration; only the exact prior generated label form is eligible for conversion.
