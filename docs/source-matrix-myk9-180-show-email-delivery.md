# MYK9-180 sender coverage matrix

This matrix records the production Resend writers reviewed for the show email
delivery history. A sender is show-owned only when the Edge Function resolves a
show-owned resource before sending and writes that resolved `show_id` onto the
`email_log` row.

| Sender                                 | Email type                            | Scope          | Durable source                        | Failure row                          | Webhook status                   |
| -------------------------------------- | ------------------------------------- | -------------- | ------------------------------------- | ------------------------------------ | -------------------------------- |
| `send-registration-email`              | `registration_confirmation`           | Show-owned     | `enrollments.show_id`                 | Yes                                  | Yes, through `resend_message_id` |
| `stripe-webhook` (legacy payment path) | `registration_confirmation`           | Show-owned     | Server-loaded cart `show_id`          | Yes                                  | Yes, through `resend_message_id` |
| `send-confirmation-email`              | `heritage_confirmation`               | Show-owned     | `entries.show_id`                     | Yes                                  | Yes, through `resend_message_id` |
| `send-lifecycle-email`                 | `show_lifecycle_email`                | Show-owned     | `show_lifecycle_email_jobs.show_id`   | Yes, including pre-provider failures | Yes, through `email_log`         |
| `send-email` (`entry_decision`)        | `entry_decision`                      | Show-owned     | Authorized enrollment → show          | Yes                                  | Yes, through `resend_message_id` |
| `push-trigger-waitlist`                | `waitlist_notification`               | Show-owned     | Waitlist entry → class → trial → show | Yes                                  | Yes, through `resend_message_id` |
| `send-results`                         | `registry_results_submission`         | Show-owned     | Authorized `showId`                   | Yes                                  | Yes, through `resend_message_id` |
| `send-auth-email`                      | `auth_confirmation`, `password_reset` | Platform-owned | Auth action                           | Existing log only; excluded          | Existing webhook handling        |
| `push-trigger-support-message`         | `support_notification`                | Platform-owned | Support ticket                        | Existing behavior; excluded          | Existing webhook handling        |
| `send-waitlist-invite`                 | Platform waitlist invite              | Platform-owned | `platform_waitlist`                   | Existing behavior; excluded          | Existing webhook handling        |
| `admin-invite-user`                    | Admin invitation                      | Platform-owned | Account invitation                    | Existing behavior; excluded          | Existing webhook handling        |

The legacy `send-email` `waitlist_offer` and generic entry/payment/welcome
template variants remain outside the active authorized show-owned sender set.
They do not provide a server-verified show resource in the current production
call path and are therefore excluded rather than guessed into a show.

The source-contract test at
`apps/myk9show/src/test/database/showEmailDelivery.source.test.ts` fails if a
show-owned writer loses its canonical `show_id` write or if an excluded writer
is accidentally classified as one of the V1 show-owned types.
