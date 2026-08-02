# Club administrator UX walk — 2026-08-02

## Executive assessment

**Not yet proven launch-ready for a single-role club officer.** The existing club-admin workflow is coherent and generally calm once a club is selected: the active club stays visible, member search works, payment setup explains consequences before Stripe, and show oversight links into the existing show-management surface. However, the canonical account exposed `Site Admin` alongside club-scoped grants. That contamination blocks any claim that club-admin authorization, privilege-escalation prevention, or cross-club isolation works. MYK9-137 already owns the missing fixture.

One browser-confirmed Medium defect remains: Heartland's management roster has three active members while the same club profile reports zero. The previously open High payment-checklist finding passed headed pointer replay and is closed.

## Run contract

- **Baseline:** `d950bed0287eef44dde1a0ba5cb851ddb2482ef0` on current `main`
- **Run time:** 2026-08-02T00:30:51-05:00
- **Environment:** local myK9Show at `http://localhost:5173`; run-started server stopped after the walk
- **Browser method:** headed in-app browser with normal pointer activation; code inspection used only to explain browser evidence
- **Viewports:** 1440×900, 768×1024, 390×844
- **Role persona:** older volunteer club officer seeking calm governance and financial oversight
- **Prior memory:** none; this was the automation's first run
- **Secrets:** loaded from the documented environment file and omitted from evidence

## Role and scope validity

The account menu explicitly reported four grants, including site-wide administration and club administration. The UI also presented four selectable clubs. This is useful evidence for PR #1555's site-admin recovery path, but it is not valid evidence for club-admin-only authorization.

Blocked permission coverage:

- granting or revoking a club-scoped role;
- preventing a club administrator from assigning site-wide authority;
- denying access to an unrelated club;
- proving show-access grant/revoke enforcement as a club administrator;
- proving a removed member loses club access;
- attributing club-governance audit events to a club-only actor.

Required proof fixture: the existing MYK9-137 contract — a dedicated account with only `club_admin` for one club, a second unrelated club, seeded `club_members`, and explicit browser/database assertions for allowed same-club actions and rejected cross-club actions. The discoverable club-admin-labelled E2E person did not hold a club-admin grant in User Management, so it could not substitute safely.

## Coverage and evidence

| Workflow | Browser result | Evidence and boundary |
| --- | --- | --- |
| Sign-in, reload recovery, sign-out | Passed | Two-step sign-in succeeded; protected-route reload restored the authenticated UI; sign-out returned to the public surface; revisiting `/club-admin/members` redirected to sign-in with the intended return route. |
| Club selection and active context | Passed for UI; authorization blocked | Club choice listed four clubs. Selecting Heartland showed the club in the breadcrumb, heading, switcher, and sidebar. Selecting E2E Club A on Payments and using SPA navigation preserved that selection. |
| Members and officers | Passed read-only | Heartland showed three active members, zero officers; search reduced the roster to the expected row; empty-officer guidance and assignment dialog were explicit. Add Member and Assign Officer dialogs were opened and cancelled. |
| Member row actions | Passed reachability; mutation blocked | The last-row action menu was pointer-operable and fully inside desktop and mobile viewports. Change Type, Change Status, Show Access, and Remove were discoverable but not invoked. |
| Club profile/contact | Passed read-only | About, Members, and Branding tabs activated; Edit exposed Basic Info and Contact with Save disabled until a change; no value was changed. Existing contact behavior remained usable. |
| Membership consistency | **Failed** | `/club-admin/members` reported three active Heartland members while the profile reported `Active Members 0`, `Members 0`, and `No Members Yet` at every viewport. See CUX-2026-08-02-01. |
| Staff invitations | Partially verified; delivery blocked | Club Add Member supports existing people. Site-admin User Management has Create & Invite plus Send Invitation for an existing no-account person. No email was sent. Invitation delivery, expiry, resend history, and club-admin authority require an interception fixture or approval. |
| Club-scoped roles | UI present; authorization blocked | Manage Roles reveals club selection when Club Admin is checked, but the unsaved dialog was cancelled. Assignments are read from the permissions ledger and grants are consolidated in User Management. No role was saved. |
| Payment-account setup | Passed safe boundary | On no-account E2E Club A, `Connect payment account` opened the preflight checklist and `Not now` closed it by pointer at desktop and mobile. `Continue to Stripe` was not activated. A Stripe-verification failure showed calm explanatory copy and `Try again`. |
| Reconciliation and payouts | Passed available read-only states | Heartland showed payouts enabled and an empty per-show reconciliation state. No connected payment account, payout, transfer, or Stripe record was changed. Amount-level reconciliation could not be verified because the seeded view was empty. |
| Club show oversight | Passed navigation | `Our Shows` deep-linked to the existing Shows page with the club filter visibly applied. Opening the Heartland show led to the existing Show Desk, Entry Management, Reports, Results, and Check-In surfaces; secretary operations were not repeated. |
| Audit/history | Partial, site-admin only | Roles & Permissions exposed a read-only assignments ledger and grant/revoke audit tab. The audit used raw IDs and no club-officer-specific history surface was discoverable. This is a governance enhancement, not a new-page recommendation. |
| Loading/empty/error/retry/stale/confirmation | Covered | Protected-route loading, empty members/officers/reconciliation, payment no-account, Stripe verification error/retry, dialog cancellation, and the stale membership contradiction were observed. Saved confirmations and interrupted persisted mutations were intentionally not exercised. |
| Responsive usability | Passed except shared defect | No page-level horizontal overflow at 768×1024 or 390×844. The member table removes secondary columns on mobile; row actions remain reachable. The membership contradiction persists at all viewports. |

## Safe mutation ledger

No persistent record was created, edited, removed, granted, revoked, invited, paid, or transferred.

- **Read:** Heartland Scent Work Club; disposable no-account E2E Club A; their member/payment/show projections; site-admin user and permission ledgers.
- **Local-only interaction:** opened and cancelled Add Member, Assign Officer, Edit Club, Create User, Manage Roles, and payment-preflight dialogs.
- **Skipped:** all Save/Create/Invite/Remove/Grant/Revoke actions, `Continue to Stripe`, payout/reconciliation mutations, payment retry, and shared ownership changes.
- **Records touched:** none persistently.

## Finding counts

| Dimension | Count |
| --- | ---: |
| New | 1 |
| Resolved | 1 |
| Blocked | 1 coverage contract |
| Unchanged confirmed defects | 0 |
| Confirmed defect | 2 total outcomes: 1 new, 1 resolved |
| Authorization/scope | 1 blocked, not confirmed by this account |
| Financial | 1 resolved interaction finding; empty-data reconciliation gap remains |
| Accessibility | 0 new |
| Test/environment | 0 confirmed |

## Findings by severity

### CUX-2026-08-02-01 — Club profile contradicts the membership roster

- **Status:** new
- **Classification:** Confirmed defect
- **Severity:** Medium (canonical P2)
- **First seen / last seen:** 2026-08-02 / 2026-08-02
- **Consecutive runs:** 1
- **Route and viewport matrix:**
  - 1440×900: roster 3; profile 0 — failed
  - 768×1024: roster 3; profile 0 — failed
  - 390×844: roster 3; profile 0 — failed
- **Action:** select Heartland on `/club-admin/members`, note the roster total and rows, then open the same club profile and inspect Active Members and the Members tab.
- **Observed:** three active roster rows versus zero profile members and a `No Members Yet` empty state.
- **Expected:** both existing surfaces use one canonical active-membership projection and agree.
- **Impact:** a club officer may believe members were lost, fail to find governance records, or repeat an add operation.
- **Confidence:** high; reproduced by pointer at all three viewports with the same club.
- **Likely cause:** supported by source inspection. The profile uses `selectedClub.memberIds` in `ClubDetails/useClubDetailsState.ts` and `MembersTab.tsx`; the management roster reads `club_members` through `services/database/club-memberships/members.ts`.
- **Proof for closure:** focused projection coverage plus a browser replay of both routes for the same club at desktop and 390px, showing equal active totals and rows.
- **Duplication check:** no matching QA or Linear item found. Repair the shared projection; do not create another roster UI.

### QA-CLUB-PAYMENTS-041 — Payment checklist ignored pointer activation

- **Status:** resolved
- **Classification:** Confirmed defect
- **Severity:** High
- **First seen / last seen:** 2026-07-18 / 2026-08-02
- **Consecutive automation runs:** 1
- **Closure evidence:** normal pointer clicks opened and cancelled the no-account preflight at 1440×900 and 390×844; Stripe was not launched. This satisfies the registry's manual closure gate.

### MYK9-137 — Dedicated club-admin authorization proof is unavailable

- **Status:** blocked coverage, unchanged
- **Classification:** Authorization/scope
- **Severity:** High test gap
- **Active scope:** contaminated by site-admin authority
- **Proof gate:** dedicated single-role fixture, unrelated second club, same-club success, cross-club rejection, and database/audit assertions.
- **Consecutive automation runs:** 1

No finding reached two consecutive automation runs, so nothing was promoted as recurring.

## Duplication and consolidation observations

- `Our Shows` correctly links into the existing filtered Shows page and then the existing secretary surfaces. No club-specific show workbench should be added.
- Role grants are intentionally consolidated in User Management; Roles & Permissions acts as the ledger/revoke/history surface. Preserve this boundary while fixing MYK9-152's destructive bulk semantics.
- Club-member administration owns the roster, while the club profile summarizes it. Their shared membership projection should be consolidated rather than duplicating member controls on the profile.
- Club Add Member accepts existing people, while account invitation lives in site-admin User Management. If club officers must invite new staff, connect these existing surfaces with an explicit handoff and scoped authority; do not clone Create User inside the club page.
- Audit history exists only in the site-admin permissions surface and presents raw IDs. Prefer a filtered, human-readable view or deep link in an existing governance surface before proposing a new page.

## Recent merged PR verification (previous 48 hours)

| PR | Status | Browser evidence |
| --- | --- | --- |
| #1564 row-action portals | **Verified** | Last member-row menu opened by pointer and stayed within 1440×900 and 390×844. |
| #1562 role-assignment consolidation | **Blocked** | Browser confirmed grants originate in User Management and the permissions ledger is read-oriented; role save/bulk replacement was unsafe, and MYK9-152 remains open. |
| #1559 user search | **Verified** | User Management search found the intended existing people before invitation/role inspection. |
| #1555 site-admin club recovery | **Verified** for its stated site-admin path | Site admin reached club pages, received an explicit four-club choice, and retained the selected club during SPA navigation. It cannot prove club-admin-only scope. |
| #1553 User Management truth/a11y | **Verified** in bounded read-only use | The person surface distinguished an identity with no sign-in account and exposed labelled actions. Full accessibility conformance was not re-audited. |
| #1551 existing-person invitations | **Blocked** | `Send Invitation` was visible for a no-account person, but sending email was an external/shared mutation. |
| #1550 Create & Invite | **Blocked** | Dialog and default invitation switch were browser-visible; submission and delivery were not authorized. |
| #1547 club readiness stability | **Verified** | Club choices reached terminal states, and the no-account payment checklist passed the previously blocked pointer replay. |
| #1541 cross-tenant SQL test | **Not applicable** | Database test hardening is not browser evidence for a club-admin role, and the contaminated account cannot verify it. |
| #1538 cross-tenant show creation | **Blocked** | The security boundary needs a single-role fixture and safe rejected mutation; secretary show creation was outside this walk. |
| #1561 security remediation batch | **Not applicable** | No directly affected club-governance browser acceptance criterion was identified beyond the separately tracked RBAC work above. |

## Existing references

- MYK9-137 — single-role club-admin fixture and cross-club proof
- MYK9-120 — club-admin show-access RPCs; browser authority replay remains fixture-blocked
- MYK9-138 — site-admin access and multi-club selection, browser-verified here
- MYK9-152 — destructive bulk role replacement/removal semantics
- MYK9-54 — role-aware finance and Stripe reconciliation ownership
- MYK9-58 — canonical club-scoped role assignment ownership
- MYK9-62 — club surface integrity; this run supplies QA-CLUB-PAYMENTS-041's missing browser closure proof

## Linear drafts and changes

No new Pilot blocker or High confirmed defect was found, so no batch Linear approval was needed and no Linear issue was created or modified. CUX-2026-08-02-01 remains in the QA registry as a new Medium finding. If it reproduces next week, promote it for weekly triage rather than treating it as new.

## Top five improvements

1. Unify club profile member counts and rows with the canonical `club_members` projection.
2. Deliver MYK9-137's dedicated single-role fixture and replay same-club/cross-club permissions end to end.
3. Close MYK9-152 so bulk role operations cannot silently erase show-scoped or expiring grants.
4. Add seeded reconciliation/payout rows that permit read-only amount, status, and recovery verification without touching Stripe.
5. Make existing audit entries human-readable and club-filtered through an existing governance surface or deep link.

## Confidence, gaps, and next proof

**Confidence:** high for visible read-only club context, member/search/profile behavior, responsive layout, payment preflight, and show deep-linking; low for club-only authorization and mutation recovery because the fixture is contaminated.

**Gaps:** no safe network-level capture, no saved mutation/confirmation replay, no real invitation lifecycle, no Stripe departure/return, no non-empty payout reconciliation, and no club-only audit attribution. Console diagnostics contained no product error for the confirmed membership mismatch; development-only performance warnings reported several high LCP samples and should be measured in a controlled performance run before becoming a finding.

**Next proof:** first provision the MYK9-137 fixture. Then replay role grant/revoke, member removal, cross-club denial, interrupted save/retry, and audit attribution with disposable/intercepted mutations. Recheck CUX-2026-08-02-01 on the same Heartland routes and promote only if it is still present on the second consecutive run.
