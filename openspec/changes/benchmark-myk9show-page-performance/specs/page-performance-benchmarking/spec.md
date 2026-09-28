## ADDED Requirements

### Requirement: Repeatable production-build route benchmark

The repository SHALL provide one documented command that measures representative myK9Show routes against a production build and records the build reference, browser, viewport, throttle profile, run date, and route role with the results.

#### Scenario: Run the complete route matrix

- **WHEN** the command runs with the required local role sessions and show data available
- **THEN** it measures landing, show discovery, show detail, exhibitor dashboard, registration wizard, cart, My Shows, secretary workbench, Entries Management, reports, `/at-show` scoring and run order, `/admin/users`, and `/admin/health`

#### Scenario: A route cannot be exercised

- **WHEN** a route lacks its required session, data, or primary-content readiness condition
- **THEN** the report marks that route blocked or failed with the reason and does not count it as a successful measurement

#### Scenario: Browser crashes during one route

- **WHEN** a browser worker exits before completing its cold/warm pair
- **THEN** that pair is recorded as blocked and the remaining route/profile/repeat pairs are still attempted

#### Scenario: A saved sample does not belong to this run

- **WHEN** a result has a different build, seed show, route, profile, repeat, or run identifier, or duplicates an expected pair
- **THEN** report generation rejects it rather than combining incomparable samples

### Requirement: Controlled cold and primed warm measurements

The benchmark SHALL measure a fresh browser context with empty HTTP cache and IndexedDB, then prime a separate context with the same route's primary data and service-worker precache before measuring a worker-controlled warm navigation. It SHALL apply the requested mobile and secretary desktop profiles to measured navigations and identify priming as untimed.

#### Scenario: Cold mobile measurement

- **WHEN** a mobile route is measured cold
- **THEN** the browser context starts with only the role's auth state, blocks service workers, and applies 4x CPU slowdown with Fast 4G or Slow 4G network throttling

#### Scenario: Primed warm mobile measurement

- **WHEN** a mobile route is measured for a second time
- **THEN** its priming context has an activated service-worker precache and retains the route's available local data, the measured page is worker-controlled with scripts served by that worker, and the result is labeled service-worker warm with the throttle profile recorded

#### Scenario: Warm state cannot be verified

- **WHEN** priming fails, the measured page is not worker-controlled, or no scripts are served by the worker
- **THEN** the warm attempt is blocked with a reason rather than counted as a successful warm measurement

#### Scenario: A loading shell exposes a heading

- **WHEN** a route renders a heading while its primary data is still loading or an error is shown
- **THEN** the benchmark continues waiting or marks the attempt blocked instead of recording that heading as usable

#### Scenario: Secretary desktop measurement

- **WHEN** a secretary workbench, Entries Management, or reports route is benchmarked on desktop
- **THEN** the result records an unthrottled desktop profile separately from the mobile results

### Requirement: Metrics and evidence are clearly labeled

The benchmark SHALL record time-to-usable, LCP, INP when available or TBT as a labeled lab proxy, CLS, TTFB, JavaScript transferred, request count, slowest Supabase/PostgREST calls, and route chunk sizes. It SHALL preserve per-run observations and summarize repeated runs with medians.

#### Scenario: A browser metric is unavailable

- **WHEN** a metric cannot be measured reliably, including cross-origin transfer size or INP in a lab run
- **THEN** the output labels it unavailable or identifies the TBT proxy and never substitutes zero as a measured value

#### Scenario: Results identify likely bottlenecks

- **WHEN** the route matrix completes
- **THEN** the dated baseline ranks the slowest usable routes, describes evidence-supported likely causes, and identifies the routes for MYK9-844

### Requirement: Benchmarking remains diagnostic and read-only

The benchmark SHALL use the existing browser-session wrapper and shall not create or modify shared users, shows, entries, scores, or credentials.

#### Scenario: Run with existing role sessions

- **WHEN** the benchmark runs using local role session state
- **THEN** it performs route reads and measurements without provisioning accounts, changing passwords, submitting entries, or recording scores; telemetry writes are acknowledged locally and Realtime WebSocket connections are blocked without reaching staging

#### Scenario: Field data preflight

- **WHEN** Vercel Speed Insights/Analytics or Sentry traces are checked
- **THEN** the baseline records the source and time window when available, or clearly states that access/data was unavailable, without adding new telemetry services
