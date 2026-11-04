# MYK9-1508 Ringside acceptance repair

> **Status:** Active

[Acceptance issue and production evidence](https://linear.app/myk9-platform/issue/MYK9-1508#comment-de245bce-a33f-4a70-ae34-e50f92cc34dd).

- Keep each list's filters through its existing Ringside return link, including when Settings is opened offline. Keep entry search text out of URLs.
- Keep the existing menu and AskQ usable at phone and tablet widths. Repair entry-list semantics and contrast from the production axe report.
- Route people to existing Stats and contact surfaces. Use only show contact details already intended for publication.

## Testing

1. Reproduce filter loss with an integration test and exercise the return from each list host. Run focused Ringside, AskQ, Results, and show-info tests.
2. Verify the phone and tablet layouts and axe locally, then run the repository gates and wait for green CI.
3. Deploy the verified merge and repeat the online and offline four-role matrix. Record the served SHA, fixture limits, and acceptance disposition in Linear.
