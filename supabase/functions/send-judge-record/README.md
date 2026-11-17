# send-judge-record

Emails a judge their record for one trial day (MYK9-1924 phase 2b), or reports who would receive it.

- `action: 'preview'` returns the judge's name and the address on file (or why there is none).
- `action: 'send'` takes the record PDF (base64, 8 MB at most), stores it privately in `trial-packets`, mints a link that lasts until 30 days after the show (never under 7 days or over 60), and emails that link. No attachment.

The recipient is never in the request. It is the person in `judge_assignments` (confirmed, class level, that day), at `people.email`. A request with `to`, `cc`, `recipients`, `recipientEmails` or `replyTo` is refused. A judge with no email gets 422 `judge_has_no_email`, and the secretary saves the PDF instead. The caller must hold a secretary, trial secretary or club admin role for the show (or be a site or platform admin).

One send per show, judge and day. Before sending, one `email_log` query (`show_id`, `email_type = 'judge_record'`, and a `related_id` derived from show, judge and day) finds the newest row whose status is not `failed`, `bounced`, `complained` or `suppressed`; any other status (`sent`, `delivered`, and later states) counts as sent. When one exists the function sends nothing and returns `alreadySent: true` with `sentAt`. `preview` returns the same time as `lastSentAt`. There is no counter and no cap: `sendAgain` with an `attemptId` is a second deliberate send, with the same checks and a fresh link. The email text is kept for the delivery history (MYK9-2115).

No migration. Deploy:

```bash
supabase functions deploy send-judge-record --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
```
