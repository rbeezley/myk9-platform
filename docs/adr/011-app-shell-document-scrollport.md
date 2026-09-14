# ADR-011: The Document Is the App Shell's Scrollport

## Status

Accepted

## Date

2026-09-14

## Context

`SidebarLayout` is the single app-shell layout: `UnifiedAppLayout` renders every
signed-in route through it. Its `main` was

```tsx
<main data-layout="app-shell-main" className="flex-1 overflow-auto pt-[...] md:ml-[...]">
```

inside a `flex min-h-screen` row. `overflow-auto` makes that `main` the nearest
scroll container for everything rendered in it. But `main` has no bounded
height — the row is `min-h-screen`, a floor, not a height — so `main` grows to
fit its content and **never actually scrolls**. The document scrolls instead.

`position: sticky` resolves against the nearest scrolling _ancestor box_, not
against whatever happens to be moving. So every sticky element under the shell
was pinned inside a box that never moved, and travelled off-screen with the
page: inert. Confirmed in a browser on the registration wizard during MYK9-483
(PR #2210, round 8), and again on `ShowCreationWizard/WizardHeader`.

The registration wizard worked around it locally (#2210) by owning its own
scrollport: `RegistrationWizardShell`'s root is
`h-[calc(100dvh-var(--app-top-inset,3rem))] min-h-0 overflow-y-auto`. That
fixed the wizard and nothing else.

MYK9-510 asks which of two shell-level fixes to take.

## Decision

**Drop `overflow` from the shell's `main` entirely and let the document be the
scrollport.** `main` becomes `flex-1 min-w-0 pt-[...]`.

The rejected alternative was to make `main` a _real_ scrollport
(`h-dvh min-h-0 overflow-y-auto` on the row so the document stops scrolling).

### Why the document, not `main`

The blast radius is not symmetric. Making `main` the scrollport silently
invalidates every piece of code that already assumes the document scrolls, and
the failure mode in each case is a no-op, not an error:

| Assumption already in the codebase                                                                                           | Under "document scrolls" (chosen) | Under "`main` scrolls"                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `window.scrollTo({top: 0})` on route-entry focus (`components/dogs/DogDetailsMain/useRouteEntryFocus.ts`)                    | works                             | silent no-op — the page stays where it was                                                     |
| `window.pageYOffset` parallax / scroll-progress math (`hooks/animations/useScrollAnimation.ts`, 4 call sites)                | works                             | frozen at 0                                                                                    |
| `scrollIntoView` on validation errors, chat tails, cockpit rows, month scrubber (10+ call sites)                             | works                             | works, but lands under the fixed header unless every scroller re-declares `scroll-padding-top` |
| `IntersectionObserver` with `root: null` — reveal-on-scroll, lazy loading, `useTrackSectionView` analytics (12 constructors) | works                             | works by luck (viewport intersection), but thresholds fire against a clipped box               |
| `:root { scroll-padding-top: calc(banner + 3rem) }` in `index.css` for hash anchors                                          | applies                           | never applies — every scroller needs its own copy                                              |
| Mobile: browser URL-bar collapse on document scroll, and iOS keyboard resizing the visual viewport                           | native behaviour                  | `100dvh` boxes fight the URL bar; the keyboard overlays a fixed-height pane                    |
| The landing-page sticky navs (gazette, heritage, magazine, banner, monogram, fieldGuide) already offset by `--app-top-inset` | one convention everywhere         | two conventions: signed-out pages offset by the chrome, shell pages by 0                       |

The last row is the deciding one. The app already has a convention for "sticky
under the fixed chrome" — `top: var(--app-top-inset, 3rem)` — written for the
signed-out marketing pages, which have always scrolled the document because
they render outside `SidebarLayout`. Choosing the document makes the shell obey
the convention the rest of the app already writes against, instead of creating a
second one.

The chosen change is also one class on one element, against roughly a dozen
files of scroll math for the alternative.

### `min-w-0` is not incidental

`overflow-auto` was doing one useful thing: a flex item's automatic minimum size
is its content, and any non-`visible` overflow collapses that to zero. Removing
it without `min-w-0` would let an over-wide child (a table, a long unbroken
string) stretch the column. `min-w-0` keeps the column at its allotted width;
over-wide content now scrolls the _document_ sideways rather than a private
scrollbar inside `main`. That is a visible symptom of a page bug rather than a
hidden one, which we consider an improvement, not a regression.

### The registration wizard keeps its own scrollport

It is kept, not removed. It is not a workaround for this bug — it is a
deliberate full-page layout: the wizard bounds itself to the viewport so the
running-entries panel can be a sticky column beside a scrolling step card and a
fixed bottom action bar below `lg`. That is a nested scroll container, which
works the same before and after this change. `wizardVisualQA.spec.ts`'s
scrollport tests (which assert `window.scrollY === 0` while the shell's own
`scrollTop` moves) therefore stay green and stay where they are.

## Consequences

### Positive

- Every `position: sticky` under the app shell resolves for the first time.
- One sticky convention across signed-out and signed-in surfaces:
  `top: var(--app-top-inset, 3rem)`, which already accounts for the PWA banner.
- `:root`'s `scroll-padding-top` now governs hash anchors on shell pages too, so
  the per-scroller override on `[data-layout='app-shell-main']` was deleted as
  dead code.
- Native mobile behaviour (URL-bar collapse, keyboard-driven visual-viewport
  resize) is left alone.

### Negative

- Sticky offsets that were written while sticky was inert are now load-bearing
  and had to be corrected in the same change: `ShowCreationWizard/WizardHeader`
  (`top-0` → `--app-top-inset`), the show-creation step indicator (`top-16` →
  chrome + measured header height), `EntryManagementCockpit` and
  `SecretaryCockpitFocusedClass` (`top-4` → chrome + `1rem`), `CartPage`
  (`top-24` → chrome + `1.5rem`). Any _new_ sticky element under the shell must
  offset by `--app-top-inset`; `top-0` now means "behind the app bar".
- A page whose content is genuinely too wide now scrolls the document
  horizontally instead of `main`.

### Neutral

- Nested scroll containers (the registration wizard, `DataTable`'s own
  `overflow-auto` wrapper and its `stickyLeft` columns, ringside panes) are
  unaffected; sticky inside them resolves against them as before.
- Routes mounted outside `SidebarLayout` (`/at-show`, scoring, `/onboarding`,
  the marketing landing) already scrolled the document and are unchanged.
