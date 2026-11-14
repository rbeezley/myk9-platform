# send-judge-record

Emails a judge their record for one trial day (MYK9-1924 phase 2b), or reports who would receive it.

- `action: 'preview'` returns the judge's name and the address on file (or why there is none).
- `action: 'send'` takes the record PDF (base64, 8 MB at most), stores it privately in `trial-packets`, mints a link that lasts until 30 days after the show (never under 7 days or over 60), and emails that link. No attachment.

The recipient is never in the request. It is the person in `judge_assignments` (confirmed, class level, that day), at `people.email`. A request with `to`, `cc`, `recipients`, `recipientEmails` or `replyTo` is refused. A judge with no email gets 422 `judge_has_no_email`, and the secretary saves the PDF instead. The caller must hold a secretary, trial secretary or club admin role for the show (or be a site or platform admin).

One send per judge per day per record: the Resend idempotency key and a `email_log` check (`email_type = 'judge_record'`) stop a repeat press. `sendAgain` with an `attemptId` sends again on purpose, with a fresh link.

No migration. Deploy:

```bash
supabase functions deploy send-judge-record --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
```
