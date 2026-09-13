# Anonymous access boundary

This is the deliberate signed-out boundary for myK9Show. The route policy is
also pinned by `src/routes/anonymousAccessBoundary.test.ts`; adding a new
anonymous data route requires an explicit reason here and in that policy.

| Route | Reason it stays public |
| --- | --- |
| `/shows` | Show discovery for prospective exhibitors |
| `/shows/:id` | Show premium and offered-classes preview |
| `/shows/:showId/trials/:trialId/classes/:classId/results` | Released public results share link |
| `/clubs`, `/clubs/:id` | Club discovery; no personal entry data |
| `/tv/:showId` | Venue TV run-order display |
| `/sign-in`, `/sign-up` | Authentication entry points |
| `/terms`, `/privacy` | Public legal disclosures |
| `/sms` | Public SMS opt-in disclosure |
| `/fees` | Shareable service-fee explanation |
| `/help/credentials` | Public sign-in recovery help |

Trial details, trial entries, and operational class details require
authentication. Released results remain public and are served through the
release-gated results path. Anonymous visitors never receive direct entry
rows from the `entries` table or its public-results view for those surfaces.
