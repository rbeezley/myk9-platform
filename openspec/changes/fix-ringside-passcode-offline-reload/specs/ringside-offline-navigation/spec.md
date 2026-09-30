# Spec Delta

## Purpose

Keeps a prepared ringside scoring device usable after a full reload at a show venue without network access.

## ADDED Requirements

### Requirement: Prepared ringside deep links boot offline

The app SHALL fetch the current document for a same-origin `/at-show` navigation while online. If the navigation stalls beyond a bounded wait, fails, or returns a non-app document, it SHALL serve its saved shell, including for a show, class list, or scoresheet deep link, after the service worker has activated and cached the shell. It SHALL preserve the requested URL so the existing ringside route and replicated data can restore the view. The shell fallback MUST NOT intercept API, asset, or unrelated navigation requests.

#### Scenario: Online show deep-link reload after deployment

- **WHEN** a judge reloads `/at-show/<show-id>` with a network connection after a new app deployment
- **THEN** the service worker requests the current document from the server instead of returning its older precached shell

#### Scenario: Offline show deep-link reload

- **WHEN** a judge has prepared the show on a service-worker-controlled device and reloads `/at-show/<show-id>` without a network
- **THEN** the app shell loads and the existing ringside route reads its cached show rather than showing a browser network error

#### Scenario: Offline scoresheet reload

- **WHEN** a judge reloads a prepared ringside scoresheet deep link without a network
- **THEN** the app boots at the same URL and can read cached scoring data and pending mutations

#### Scenario: Venue wifi has no usable uplink

- **WHEN** a controlled ringside deep link reloads while the navigation request or its response body stalls
- **THEN** the precached shell loads within the navigation deadline

#### Scenario: Origin or captive portal returns the wrong document

- **WHEN** a controlled ringside deep link reloads and the server returns an HTTP error or a non-myk9 HTML page
- **THEN** the precached shell loads instead of that response

#### Scenario: Unrelated request

- **WHEN** the service worker receives an API, asset, or non-ringside navigation request
- **THEN** the ringside app-shell fallback does not handle it
