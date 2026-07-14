## Context

The S7 secretary responsibility rows cover registry closeout reports, forms, official PDFs, electronic submission, and preservation of club artifacts. The AKC Scent Work work recently wired official PDF fills and documented remaining launch evidence. UKC and ASCA needed a fresh source and code inventory before any remediation work.

Current repo evidence shows that UKC is not a pure gap: a UKC Nosework Trial Report official PDF is stored, registered, filled, and tested. ASCA has source PDFs in the repo, but no organization-form registry support or Report page official PDF wiring.

## Goals / Non-Goals

**Goals:**

- Verify S7.1, S7.2, S7.3, and S7.5 against official registry sources and current code.
- Identify which artifacts are already local source PDFs, which are wired into Reports, and which are missing.
- Produce a remediation plan that keeps future work on the existing Reports and Submit Results surfaces.
- Update the secretary responsibility tracking docs with evidence-backed statuses.

**Non-Goals:**

- Do not implement UKC judges books, UKC score sheets, UKC entry/change-entry PDFs, ASCA official PDF fills, or ASCA upload automation in this slice.
- Do not create a new registry closeout page. Reports and Submit Results remain the canonical surfaces unless a later implementation plan proves they cannot carry the work.
- Do not perform real external registry submissions.
- Do not treat official source links as permanently current; launch verification must re-check them before go-live.

## Decisions

- Separate official source inventory from app wiring.
  - Rationale: the repo already contains some official forms that are not surfaced in the app, and some app reports that are generic rather than official PDFs.
  - Alternative considered: update statuses only from route existence. That would hide UKC and ASCA gaps.

- Keep S7 remediation on existing surfaces first.
  - Rationale: the product phase is consolidation-first, and secretaries already expect closeout artifacts in Reports or Submit Results.
  - Alternative considered: create a new closeout packet page. That would duplicate Reports without proven need.

- Track AKC as implementation-complete but launch-evidence-open.
  - Rationale: official PDFs are wired, but final print alignment, current-form comparison, and recipient verification remain launch gates.
  - Alternative considered: mark AKC fully covered. That would overstate readiness.

## Risks / Trade-offs

- Official registry sources change before launch -> Re-check AKC, UKC, and ASCA sources during the print/submission evidence pass.
- Generic reports look close enough but miss registry-required fields -> Use official PDFs and rulebook/form source inventory as the contract for remediation.
- UKC/ASCA submission paths are portal/manual rather than XML -> Preserve artifacts and operator steps instead of inventing unsupported electronic submission formats.
- Broad registry work becomes too large -> Split implementation into focused PRs: UKC closeout packet, ASCA closeout packet, and submission/portal guidance.
