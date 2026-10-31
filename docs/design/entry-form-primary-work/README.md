# Entry form: primary work checklist (design)

Owner-approved target design for the secretary's entry form panel on the Entry Forms tab, 2026-10-31. Implementation is tracked in [MYK9-1600](https://linear.app/myk9-platform/issue/MYK9-1600), with related pieces in MYK9-1592 (entry order, form sub-headings), MYK9-1594 (toolbar, Add entry for an exhibitor) and MYK9-1601 (private secretary notes).

These are static mockups, not app code. The `.html` files are self-contained (open them in a browser); the `.png` files are renders of them at 480px wide.

| State | Render | Source |
| -- | -- | -- |
| Several things to do | [1-several-to-do.png](1-several-to-do.png) | [1-several-to-do.html](1-several-to-do.html) |
| Payment due only, header ⋯ menu open | [2-payment-due-menu-open.png](2-payment-due-menu-open.png) | [2-payment-due-menu-open.html](2-payment-due-menu-open.html) |
| All set | [3-all-set.png](3-all-set.png) | [3-all-set.html](3-all-set.html) |

## What the design decides

- **Primary work is a checklist**, "To finish this form · N to do", built from the form's state. One card per open item, each with its own buttons: entries needing review (Accept, Reject), money due (Cash…, Check…, More payment options), a dog without an armband (Assign), a missing registration number (Add number). When nothing is open it collapses to one line: "All set" with what was done.
- **One form-level ⋯ menu** beside the exhibitor's name: Add entry for the exhibitor, Email exhibitor, Add private note, and Accept all / Reject all. It replaces the Entries section's Actions ⋯ button.
- **Per-entry changes stay on each entry**: its status chip and row menu.
- **Entries are listed per dog in trial order** (date, then trial number), and the money total sits in the footer.
- **Notes are private to show officials** (MYK9-1601).

Every button is a door to an existing dialog or handler, not a second implementation.

## Not decided

"Print confirmation" and "View history" in the ⋯ menu, and the suggested armband number ("Next free number: 202"), are ideas only. They are not in scope for MYK9-1600.

## Regenerating the renders

From the repository root, with Chrome installed:

```bash
pnpm --dir apps/myk9show exec playwright screenshot --channel=chrome --full-page --viewport-size=480,600 "file:///$PWD/docs/design/entry-form-primary-work/1-several-to-do.html" docs/design/entry-form-primary-work/1-several-to-do.png
```

Repeat for the other two files.
