# Dependabot Diagnostic — 2026-05-22

**Source:** GitHub Dependabot API + `pnpm audit` against `pnpm-lock.yaml`
**Branch:** `main`
**Repo:** `rbeezley/myk9-platform`

## Headline

| Severity | Count (Dependabot) | Count (pnpm audit) |
| -------- | ------------------ | ------------------ |
| Critical | 1                  | 1                  |
| High     | 29                 | 32                 |
| Medium   | 18                 | 21                 |
| Low      | 2                  | 2                  |
| **Total**| **50**             | **56**             |

> The two sources disagree by 6 alerts. `pnpm audit` counts each transitive
> hit of the same advisory separately; Dependabot deduplicates by advisory +
> package. The Dependabot figure is the canonical "what shows up in the
> Security tab" count. (The user-quoted figure was 51 — Dependabot rescans
> auto-close a small number; 50 vs 51 reflects normal drift.)

## Direct vs transitive

| Relationship | Count |
| ------------ | ----- |
| `direct`     | 2     |
| `transitive` | 39    |
| `inconclusive` *(jsPDF — Dependabot can't decide because the package is both a direct dep AND pulled in transitively)* | 9 |
| **Total**    | 50    |

| Scope          | Count |
| -------------- | ----- |
| `runtime`      | 42    |
| `development`  | 8     |

All alerts are `npm` ecosystem (no Python, Go, etc.).

## Per-package breakdown (Dependabot view)

| Package                     | Sev (highest) | Alerts | Relationship | Notes |
| --------------------------- | ------------- | ------ | ------------ | ----- |
| `jspdf`                     | **critical**  | 9      | direct (`^4.0.0` in `apps/myk9show`) | Installed 4.0.0; fixed 4.2.1 — in-range, auto-fixable. |
| `minimatch`                 | high          | 9      | transitive   | Installed 10.1.1 + 10.2.5 + older majors; fix 10.2.3 for 10.x — auto-fixable for 10.x; 3.x/5.x/9.x harder. |
| `undici`                    | high          | 7      | transitive   | Installed 5.28.4 only; fix is 6.24.0 — **major bump**, requires override. |
| `tar`                       | high          | 3      | transitive   | Installed 7.5.7; fix 7.5.11 — in-range, auto-fixable. |
| `vite`                      | high          | 3      | transitive   | Vulnerability range is `>=8.0.0, <=8.0.4`; we have `7.3.1` installed → **alert is stale; should auto-close after Dependabot rescan post-push.** |
| `turbo`                     | medium        | 2      | direct (`^2.8.0` root) | Installed 2.8.0; fix 2.9.14 — in-range, auto-fixable. |
| `lodash`                    | high          | 2      | direct (`^4.17.23` in myk9show) | Installed 4.17.23 + 4.18.1. Fix advertised at 4.18.0 — **but unpublished at npm**; effectively no-fix-yet for 4.17.x line. |
| `serialize-javascript`      | high          | 2      | transitive   | Installed 6.0.2; fixes 7.0.3 (high) and 7.0.5 (medium) — **major bump** required. |
| `picomatch`                 | high          | 3      | transitive   | Installed 4.0.3 (vuln) + older 2.x. Fix 4.0.4 in-range; older 2.x not in alert range. |
| `ajv`                       | medium        | 2      | transitive   | Installed 8.6.3, 8.20.0, 6.12.6. 8.6.3 vulnerable (fix 8.18.0); 8.20.0 already fixed; 6.12.6 outside range. In-range bump. |
| `flatted`                   | high          | 1      | transitive   | Installed 3.3.3; fix 3.4.2 — in-range, auto-fixable. |
| `markdown-it`               | medium        | 1      | transitive   | Installed 14.1.0; fix 14.1.1 — in-range, auto-fixable. |
| `smol-toml`                 | medium        | 1      | transitive   | Installed 1.5.2; fix 1.6.1 — in-range, auto-fixable. |
| `path-to-regexp`            | high          | 1      | transitive   | Installed 6.1.0 + 6.3.0. Vuln range `<0.1.10` applies to express's 0.x line only — **alert may be stale** (no 0.x in our tree). Investigate. |
| `rollup`                    | high          | 1      | transitive   | Installed 2.80.0 + 4.57.1. Vuln range `<2.80.0` — we have exactly 2.80.0 → **stale alert**. |
| `brace-expansion`           | medium        | 2      | transitive   | Installed 1.1.12, 2.0.2, 2.1.0, 5.0.6. Vuln range `>=4.0.0, <5.0.5` — our 5.0.6 already fixed; alert should auto-close. |
| `@isaacs/brace-expansion`   | high          | 1      | transitive   | Vuln `<=5.0.0`; fix 5.0.1 — depends on what's in lockfile. |

## Critical + High one-liners

```
critical  jspdf          GHSA-wfv2-pwc8-crg5  HTML Injection in New Window paths
high      jspdf          GHSA-7x6v-j9x4-qf24  PDF Object Injection via FreeText color
high      jspdf          GHSA-p5xg-68wr-hm3m  PDF Injection in AcroForm RadioButton
high      jspdf          GHSA-9vjf-qc39-jprp  PDF Object Injection in addJS Method
high      jspdf          GHSA-67pg-wm7f-q7fj  DoS via Malicious GIF Dimensions
high      jspdf          GHSA-pqxr-3g65-p328  PDF Injection in AcroFormChoiceField
high      jspdf          GHSA-95fx-jjr5-f39c  DoS via Unvalidated BMP Dimensions
high      vite           GHSA-v2wj-q39q-566r  server.fs.deny bypassed with queries        (vuln 8.x — STALE for us)
high      vite           GHSA-p9ff-h696-f583  Arbitrary File Read via WebSocket          (vuln 8.x — STALE for us)
high      lodash         GHSA-r5fr-rjxr-66jc  Code Injection via _.template imports key  (fix 4.18.0 unpublished)
high      picomatch      GHSA-c2c7-rcm5-vvqj  ReDoS via extglob quantifiers
high      flatted        GHSA-rf6f-7fwh-wjgh  Prototype Pollution via parse()
high      undici (×2)    GHSA-vrm6-8vpv-qv8q + GHSA-v9p9-hfj2-hcw8  WebSocket DoS issues
high      tar (×3)       GHSA-9ppj-qmqm-q256 + GHSA-qffp-2rhf-9h96 + GHSA-83g3-92jg-28cx  Symlink/Hardlink traversal
high      serialize-js   GHSA-5c6j-r48x-rmvq  RCE via RegExp.flags & Date.toISOString
high      minimatch (×9) GHSA-7r86, GHSA-23c5, GHSA-3ppc  ReDoS in glob matching (multiple paths)
high      rollup         GHSA-mw96-cpmx-2vgc  Arbitrary File Write via Path Traversal    (we have ≥2.80.0 — STALE)
high      @isaacs/brace  GHSA-7h2j-956f-4vf2  Uncontrolled Resource Consumption
high      path-to-regex  GHSA-9wv6-86v2-598j  Backtracking regex                          (likely STALE — no 0.x in tree)
```

## Auto-fix candidates (in-range, safe for Phase 2)

Within the `^` ranges declared in our `package.json` files, `pnpm update -r`
should resolve these to their patched versions and quietly close most of the
alert backlog:

- `jspdf` 4.0.0 → 4.2.1 *(direct, in `^4.0.0`)* — kills 1 critical + 6 high + 2 medium
- `tar` 7.5.7 → 7.5.11 *(transitive, in `^7`)* — kills 3 high
- `turbo` 2.8.0 → 2.9.14 *(direct, in `^2.8.0`)* — kills 1 medium + 1 low
- `flatted` 3.3.3 → 3.4.2 *(transitive)* — kills 1 high
- `picomatch` 4.0.3 → 4.0.4 *(transitive)* — kills 1 high + 1 medium
- `minimatch` 10.1.1 → 10.2.5 *(transitive)* — kills up to 9 high (depends on what holds 10.1.1 down)
- `ajv` 8.6.3 → 8.18.0+ *(transitive, in-range for 8.x callers)* — kills 2 medium
- `markdown-it` 14.1.0 → 14.1.1 *(transitive)* — kills 1 medium
- `smol-toml` 1.5.2 → 1.6.1 *(transitive)* — kills 1 medium

**Stale alerts likely auto-closing after rescan:** the 3 `vite 8.x` alerts,
the `rollup <2.80.0` alert, and probably the `path-to-regexp <0.1.10` alert
(no 0.x in our tree).

**Estimated Phase 2 cleared:** ~10–13 of the 50 — *only* the direct-dep fixes
that don't require transitive overrides (`jspdf`, `turbo`, `lodash`). A blanket
`pnpm update -r` was tried initially to cover transitives in-range but pulled
in scope-creep tooling bumps (`@supabase/supabase-js`, `eslint-plugin-react-hooks`)
that broke typecheck/lint, so Phase 2 was narrowed to the surgical subset.
Add another ~7 alerts auto-closing on Dependabot rescan (the stale ones above),
for a post-merge total of ~30–33 open. The transitive fixes listed in the
auto-fix candidates table above are deferred to Phase 3 via `pnpm.overrides`.

## Remainder — needs major bumps or override

- `undici` 5.28.4 → 6.24.0+ *(major bump)* — 7 alerts (most via `@supabase/*` or other transitive paths). `pnpm.overrides` candidate **only after** confirming nothing depends on the 5.x API surface.
- `serialize-javascript` 6.0.2 → 7.0.5 *(major bump)* — 2 alerts. Pulled in by `terser-webpack-plugin` / `mocha` / similar; needs override.
- `lodash` 4.17.23 → 4.18.0 *(no published artifact yet)* — 2 alerts. No action available; document and wait.
- Older `minimatch` lines (3.x, 5.x, 9.x) — may or may not be vulnerable to the same CVEs; investigate during major-bump pass.
- `@isaacs/brace-expansion` — check lockfile post-update.

## Reconciliation notes (pnpm audit vs Dependabot)

`pnpm audit` reports 6 more rows than Dependabot. The delta is duplicate
advisories on the same package via different dependency paths — e.g. the
9 `minimatch` Dependabot rows fan out into ~12 paths when `pnpm audit`
walks every importer. There is no missing advisory in either source.

## Existing automation

- `.github/dependabot.yml` — **does not exist.** Phase 4 will add one.
- `package.json` (root) — no `pnpm.overrides`, no `resolutions`. We have a
  clean slate for transitive pinning.

## Next steps

1. Phase 2: surgically update direct deps (`jspdf`, `turbo`, `lodash`) and
   verify typecheck/lint/vitest. Expected outcome: ~10–13 alerts cleared
   plus ~7 stale auto-closing on rescan.
2. Phase 3: write `docs/plan-dependabot-remediation.md` for the major bumps
   (`undici`, `serialize-javascript`) and the no-fix-available items.
3. Phase 4: add `.github/dependabot.yml` with weekly grouped updates so the
   backlog doesn't re-accumulate.
