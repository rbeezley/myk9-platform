# Spec Delta

## Purpose

Keeps a prepared ringside scoring device usable after a full reload at a show venue without network access.

## ADDED Requirements

### Requirement: Prepared ringside deep links boot offline

The app SHALL serve its saved shell for a same-origin `/at-show` navigation while offline, including a show, class list, or scoresheet deep link, after the service worker has activated and cached the shell. It SHALL preserve the requested URL so the existing ringside route and replicated data can restore the view. The shell fallback MUST NOT intercept API, asset, or unrelated navigation requests.

#### Scenario: Offline show deep-link reload

- **WHEN** a judge has prepared the show on a service-worker-controlled device and reloads `/at-show/<show-id>` without a network
- **THEN** the app shell loads and the existing ringside route reads its cached show rather than showing a browser network error

#### Scenario: Offline scoresheet reload

- **WHEN** a judge reloads a prepared ringside scoresheet deep link without a network
- **THEN** the app boots at the same URL and can read cached scoring data and pending mutations

#### Scenario: Unrelated request

- **WHEN** the service worker receives an API, asset, or non-ringside navigation request
- **THEN** the ringside app-shell fallback does not handle it
