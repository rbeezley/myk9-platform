## ADDED Requirements

### Requirement: Deployed-ahead Stripe price source has reviewed recovery evidence
When an Edge Function drift audit finds `stripe-upgrade-subscription` deployed ahead of repository source, the system SHALL retain the recovered helper fingerprint, the selected source-of-truth semantics, and focused regression-test evidence before the function is eligible for deployment. The accepted semantics SHALL preserve all fallback live premium price IDs when configured price IDs are present; configured IDs SHALL extend rather than replace the fallback set.

#### Scenario: Sandbox-only configuration is evaluated
- **WHEN** `PREMIUM_PRICE_IDS` supplies sandbox IDs while known live premium IDs remain in the
  fallback list
- **THEN** the recognized premium ID set contains both the fallback live IDs and configured sandbox
  IDs

#### Scenario: Recovery evidence exists but deployment is not approved
- **WHEN** repository source and regression evidence have been reviewed but no explicit deployment
  approval or post-deploy bundle comparison exists
- **THEN** the runbook keeps `stripe-upgrade-subscription` deployment and the broader helper
  catch-up batch open as separate operator gates
