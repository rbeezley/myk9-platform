# MYK9-518 Dog Details hierarchy evidence

Signed-in `exhibitor2@myk9t.com` one-dog, no-registration/no-history account on the local myK9Show build, 2026-09-13. Dog: `MYK9-478 Sparse Audit Dog`. The screenshots show the default Overview after the implementation.

| Viewport                             | Evidence                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [390×844 phone](phone-390.png)       | Activity heading starts at y=755 within the first viewport; one registration empty state; photo-edit button measures 44×44px; no horizontal overflow. |
| [1280×800 desktop](desktop-1280.png) | Rail and Activity sit side by side; photo-edit button measures 44×44px; no horizontal overflow.                                                       |

The rail's Add registration action and a fresh `?addRegistration=true` deep link each opened the existing add panel. Focused shuffled component/navigation tests covered registered-dog management and the populated-photo variant without writing to the shared database.

Premium Overview now gives title counts for orientation. Career → Titles remains the full progress view; free Overview has no Premium teaser. “Enter a show” uses client-side navigation to `/shows`. Carrying dog context through browse and the wizard requires a separate contract and is tracked by [MYK9-519](https://linear.app/myk9-platform/issue/MYK9-519/carry-the-current-dog-from-dog-details-into-show-entry).
