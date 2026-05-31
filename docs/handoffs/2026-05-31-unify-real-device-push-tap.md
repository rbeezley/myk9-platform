# Session Handoff — 2026-05-31

Platform unification next step: Phase 3 real-device push-tap verification.

## Current state

PR #470 merged Phase 3 pilot verification into `main`.

- Phase 3a/3b implementation is deployed to Supabase project `sojmvhhwsjxmfistvzbe`.
- `send-targeted-message` is deployed with `verify_jwt=false`.
- Supabase migrations are synced locally and remotely through:
  - `20260531142844_restrict_prune_ringside_sessions_execute.sql`
  - `20260531144257_guard_notify_chat_message_missing_config.sql`
- Synthetic transport pilot passed against the `Headline` show / `Container Novice A`.
- Synthetic account + passcode push fanout, fresh `/at-show` suppression, stale subscription cleanup, and inbox persistence were verified.
- `PUSH_FANOUT_ENABLED` was restored to `false` after the pilot.

## Why this handoff exists

Phase 4 must not start yet.

The synthetic pilot could not prove the final user-facing acceptance criterion: a real browser/device receives a Web Push notification, the user taps it, and myK9Show opens the correct inbox thread.

This is tracked in `OPEN-TODOS.md` as:

> Phase 3 acceptance: real-device push tap verification

It is also called out in `docs/plans/2026-05-17-unify-myk9show-myk9q.md` under Phase 3b and Rollout.

## Next step

Run a real-device pilot on staging.

Use a real browser/device that can register a Web Push subscription for the staging myK9Show origin. Prefer Chrome on Android or desktop Chrome first; iOS can follow once the basic path is proven.

Acceptance criteria:

1. A real push subscription is created and visible in `push_subscriptions`.
2. Visiting `/at-show` creates or refreshes a `ringside_sessions` row through `upsert_ringside_session`.
3. A secretary sends a targeted class or all-show message through the existing messages UI.
4. With `PUSH_FANOUT_ENABLED=true`, the device receives a real notification.
5. Tapping the notification opens myK9Show to the correct inbox thread.
6. The message body is resolved client-side from the inbox/thread query, not embedded in the push payload.
7. Fresh `/at-show` presence still suppresses push while preserving inbox persistence.
8. `PUSH_FANOUT_ENABLED` is restored to `false` after testing unless the user explicitly approves leaving it enabled.

## Suggested procedure

1. Start from synced `main` in the primary repo:

   ```bash
   cd "/Users/richardbeezley/AI Projects/myk9-platform"
   git status --short --branch
   git pull --ff-only
   ```

2. Confirm deployment state:

   ```bash
   supabase migration list --linked
   supabase functions list --project-ref sojmvhhwsjxmfistvzbe
   ```

3. Use staging myK9Show and a real device/browser to opt into notifications.

4. Confirm the new subscription and ringside session exist with read-only SQL before sending:

   - `push_subscriptions`: endpoint, `p256dh`, `auth`, `user_id` as applicable.
   - `ringside_sessions`: matching `subscription_id`, `show_id`, `role`, `favorited_armbands`, `last_seen_route`.

5. Ask the user for confirmation before shared-system writes:

   - changing `PUSH_FANOUT_ENABLED`
   - deploying Supabase functions
   - pushing DB migrations

6. Temporarily set `PUSH_FANOUT_ENABLED=true`, send the message, tap the device notification, record the result, then restore the flag to `false`.

## Files likely involved if the tap path fails

- `apps/myk9show/src/features/at-show/RingsideSessionHeartbeat.tsx`
- `apps/myk9show/src/features/messages/`
- `apps/myk9show/src/store/messageStore.ts`
- `supabase/functions/send-targeted-message/index.ts`
- `supabase/functions/send-targeted-message/targeting.ts`
- `packages/ringside/`

Likely failure buckets:

- Service worker push/click handler does not route to the inbox thread.
- Push payload lacks enough safe routing metadata.
- Client cannot resolve `message_id` to the correct thread after launch.
- Staging notification permission/subscription is not being persisted.
- Suppression is too broad and hides the only real-device notification.

## Verification after fixes

Run focused checks for any touched area:

```bash
pnpm exec vitest run supabase/functions/send-targeted-message/targeting.test.ts
pnpm --filter @myk9/show typecheck
pnpm --filter @myk9/show lint
```

If UI/service-worker code changes, add or update focused tests around notification-click routing where practical, then manually re-run the real-device tap.

## Completion checklist

- [ ] Real device receives push.
- [ ] Tapping push opens the correct inbox thread.
- [ ] Inbox persistence still works when push is suppressed.
- [ ] Dead subscriptions are not left behind from testing.
- [ ] `PUSH_FANOUT_ENABLED` restored to `false` unless explicitly approved otherwise.
- [ ] `OPEN-TODOS.md` marks the Phase 3 acceptance item complete.
- [ ] Unify plan changelog records the real-device verification date and result.

Only after this checklist is complete should Phase 4 begin: retiring `ShowDayPage`, `ClassCheckInPage`, duplicated alert stores, and the standalone myK9Q staging deployment.

## Auto Mode reminders

Shared-system writes require explicit user confirmation:

- `supabase db push`
- `supabase functions deploy`
- changing Supabase secrets such as `PUSH_FANOUT_ENABLED`
- PR creation/merge or GitHub comments

Run `gh pr merge` from the main repo directory only, never from inside a feature worktree.
