## Design

Preserve the secretary intent of an easy, reversible choice. Inspect `ShowEditPremiumTab` and the existing Preview surface first; extract or reuse a shared selector/editor if needed. Preview state may be local until Save, Cancel restores the persisted style, and Save uses the established mutation flow. Available choices must come from the canonical entitlement source. No new page is justified.

## Risks

- Local preview state could leak into persisted data on Cancel; test it.
- A duplicated options list could drift from entitlements; reuse the canonical source.
- Save errors could leave ambiguous state; keep the persisted style and show plain recovery copy.
