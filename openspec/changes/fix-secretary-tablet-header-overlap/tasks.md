## 1. Responsive Header Repair

- [x] 1.1 Change the existing `DetailHero` breakpoint so header actions flow at tablet widths and only use absolute desktop positioning when sufficient space exists.
- [x] 1.2 Preserve title, badge, status, and action semantics; do not add a new header surface or alter show data behavior.

## 2. Regression Coverage

- [x] 2.1 Add an assertion-first focused test that guards the tablet/desktop responsive action classes in `DetailHero`.
- [x] 2.2 Run the focused DetailHero test file and the relevant app typecheck.

## 3. Visual Verification and Delivery

- [x] 3.1 Re-walk Setup and Show Desk at desktop, 768px tablet, and 390px mobile widths; confirm no header overlap and that controls remain reachable.
- [x] 3.2 Update the Go Live 0.7 evidence/tracking notes with the re-walk result.
- [ ] 3.3 Open a PR, wait for CI/review, merge, and archive only after the repository gate is green.
