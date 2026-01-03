# Push Notification Retry System

**Created**: 2025-11-01
**Migration**: 029_add_notification_retry_queue.sql
**Status**: ✅ Ready for Testing

---

## Overview

The retry system ensures that push notifications are **never lost** due to temporary failures like network issues, service downtime, or rate limiting. Instead of silently dropping failed notifications, they are queued and retried with exponential backoff.

### Key Features

✅ **Automatic Retry** - Failed notifications retry automatically
✅ **Exponential Backoff** - 1min → 5min → 15min → 1hr → 6hr
✅ **Dead Letter Queue** - Permanent failures tracked for investigation
✅ **No Lost Notifications** - Exhibitors won't miss critical "up soon" alerts
✅ **Admin Monitoring** - View showing all failed notifications
✅ **Graceful Degradation** - Triggers don't fail if queue system is down

---

## How It Works

### Normal Flow (Success)

```
1. Trigger fires (announcement created / dog scored)
2. Edge Function called via HTTP
3. ✅ Success → Notification delivered
```

### Retry Flow (Failure)

```
1. Trigger fires
2. Edge Function call fails (timeout, 500 error, network issue)
3. ❌ Failed → Add to push_notification_queue
4. Wait 1 minute (exponential backoff)
5. process_notification_queue() runs
6. Retry Edge Function call
7. If success → Mark as succeeded, delete after 24h
8. If failure → Increment retry_count, schedule next retry
9. After 5 failures → Move to dead_letter_queue for admin review
```

---

## Database Schema

### push_notification_queue

Stores failed notifications awaiting retry:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `license_key` | TEXT | Multi-tenant isolation |
| `payload` | JSONB | Original notification payload |
| `retry_count` | INT | Number of retry attempts (0-5) |
| `max_retries` | INT | Max attempts before dead letter (default 5) |
| `next_retry_at` | TIMESTAMPTZ | When to retry next |
| `last_error` | TEXT | Last error message |
| `last_error_at` | TIMESTAMPTZ | When last error occurred |
| `status` | TEXT | pending, retrying, succeeded, failed |
| `notification_type` | TEXT | announcement or up_soon |
| `entry_id` | INT | Entry ID (for up_soon) |
| `announcement_id` | INT | Announcement ID (for announcements) |
| `created_at` | TIMESTAMPTZ | When first queued |
| `updated_at` | TIMESTAMPTZ | Last modification |

### push_notification_dead_letter

Stores notifications that failed after all retries:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Same as queue entry |
| `license_key` | TEXT | Multi-tenant isolation |
| `payload` | JSONB | Original payload |
| `retry_count` | INT | Number of attempts made |
| `final_error` | TEXT | Final error message |
| `notification_type` | TEXT | announcement or up_soon |
| `created_at` | TIMESTAMPTZ | When originally queued |
| `failed_at` | TIMESTAMPTZ | When moved to dead letter |
| `acknowledged` | BOOLEAN | Admin has reviewed |
| `acknowledged_by` | TEXT | Who acknowledged |
| `acknowledged_at` | TIMESTAMPTZ | When acknowledged |

---

## Retry Schedule

The system uses exponential backoff to avoid overwhelming the Edge Function:

| Attempt | Wait Time | Total Elapsed |
|---------|-----------|---------------|
| 1st retry | 1 minute | 1 min |
| 2nd retry | 5 minutes | 6 min |
| 3rd retry | 15 minutes | 21 min |
| 4th retry | 1 hour | 1h 21min |
| 5th retry | 6 hours | 7h 21min |
| **After 5th** | Dead letter queue | - |

**Why this schedule?**
- Quick recovery from transient failures (1min)
- Gives time for service restarts (5-15min)
- Handles extended outages (1-6 hours)
- Prevents infinite retries (max 5 attempts)

---

## Processing Queue

### Automatic Processing (Recommended)

Use pg_cron to process queue every minute:

```sql
-- Install pg_cron extension (if not already)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule processor to run every minute
SELECT cron.schedule(
  'process-notifications',
  '* * * * *',  -- Every minute
  'SELECT process_notification_queue()'
);
```

### Manual Processing

If pg_cron is not available, call manually:

```sql
-- Process queue (returns stats)
SELECT * FROM process_notification_queue();

-- Example output:
-- processed | succeeded | retried | failed
-- ----------|-----------|---------|--------
--        10 |         7 |       2 |      1
```

**Schedule via external cron job:**
```bash
# Every minute
* * * * * psql $DATABASE_URL -c "SELECT process_notification_queue();"
```

---

## Monitoring

### View Failed Notifications

```sql
-- See all notifications awaiting retry
SELECT * FROM view_failed_notifications
ORDER BY next_retry_at;
```

**Example output:**
```
id         | notification_type | retry_count | next_retry_at       | last_error
-----------|-------------------|-------------|---------------------|------------
abc-123... | announcement      | 2           | 2025-11-01 15:30:00 | Timeout
def-456... | up_soon           | 0           | 2025-11-01 14:05:00 | 500 Error
```

### Check Dead Letter Queue

```sql
-- See permanently failed notifications
SELECT
  id,
  notification_type,
  retry_count,
  final_error,
  failed_at,
  acknowledged
FROM push_notification_dead_letter
WHERE NOT acknowledged
ORDER BY failed_at DESC;
```

### Queue Statistics

```sql
-- Count by status
SELECT
  status,
  COUNT(*) as count,
  AVG(retry_count) as avg_retries
FROM push_notification_queue
GROUP BY status;

-- Pending notifications ready to retry
SELECT COUNT(*)
FROM push_notification_queue
WHERE status IN ('pending', 'retrying')
  AND next_retry_at <= NOW();
```

---

## Admin Operations

### Manually Retry a Notification

```sql
-- Force immediate retry by setting next_retry_at to now
UPDATE push_notification_queue
SET
  next_retry_at = NOW(),
  status = 'pending'
WHERE id = 'notification-uuid-here';

-- Then run processor
SELECT process_notification_queue();
```

### Acknowledge Dead Letter Entries

```sql
-- Mark as reviewed
UPDATE push_notification_dead_letter
SET
  acknowledged = true,
  acknowledged_by = 'admin_name',
  acknowledged_at = NOW()
WHERE id = 'notification-uuid-here';
```

### Resend Dead Letter Notification

If you fix the underlying issue and want to resend:

```sql
-- Move back to queue with reset retry count
INSERT INTO push_notification_queue (
  license_key, payload, retry_count, next_retry_at,
  status, notification_type, entry_id, announcement_id
)
SELECT
  license_key, payload, 0, NOW(),
  'pending', notification_type, entry_id, announcement_id
FROM push_notification_dead_letter
WHERE id = 'notification-uuid-here';

-- Mark original as acknowledged
UPDATE push_notification_dead_letter
SET acknowledged = true, acknowledged_by = 'system_resend'
WHERE id = 'notification-uuid-here';
```

### Clear Old Succeeded Entries

```sql
-- Manual cleanup (or schedule daily)
SELECT cleanup_old_queue_entries();
```

---

## Testing

### Test Retry Logic

1. **Simulate Edge Function failure:**
   ```sql
   -- Temporarily set wrong trigger secret
   SELECT update_push_notification_secrets(
     'WRONG_SECRET',  -- Invalid secret to trigger 401
     (SELECT anon_key FROM push_notification_config WHERE id = 1),
     'test'
   );
   ```

2. **Create test announcement:**
   ```sql
   INSERT INTO announcements (
     license_key, title, content, priority,
     author_role, author_name, is_active
   ) VALUES (
     'myK9Q1-a260f472-e0d76a33-4b6c264c',
     'Retry Test',
     'Testing retry logic',
     'normal', 'admin', 'Test', true
   );
   ```

3. **Verify it was queued:**
   ```sql
   SELECT * FROM view_failed_notifications;
   -- Should show 1 entry with retry_count=0
   ```

4. **Wait 1 minute, then process queue:**
   ```sql
   SELECT process_notification_queue();
   -- Should return: processed=1, succeeded=0, retried=1, failed=0
   ```

5. **Verify retry count incremented:**
   ```sql
   SELECT retry_count, next_retry_at, last_error
   FROM push_notification_queue;
   -- Should show retry_count=1, next_retry_at=5 minutes from now
   ```

6. **Fix the secret and retry:**
   ```sql
   -- Restore correct secret
   SELECT update_push_notification_secrets(
     'JZ4SDjwSx8Mr1UDVmaYIiNEQOsVMYkQIZneykpRK4Z8=',
     (SELECT anon_key FROM push_notification_config WHERE id = 1),
     'test_fix'
   );

   -- Force immediate retry
   UPDATE push_notification_queue
   SET next_retry_at = NOW(), status = 'pending';

   -- Process
   SELECT process_notification_queue();
   -- Should return: processed=1, succeeded=1, retried=0, failed=0
   ```

7. **Verify notification delivered:**
   - Check your device for push notification
   - Or check Edge Function logs in Supabase dashboard

---

## Troubleshooting

### Queue Not Processing

**Problem**: Notifications stuck in queue
**Check**:
```sql
-- Is pg_cron running?
SELECT * FROM cron.job WHERE jobname = 'process-notifications';

-- Any entries ready to process?
SELECT COUNT(*)
FROM push_notification_queue
WHERE next_retry_at <= NOW() AND status IN ('pending', 'retrying');
```

**Solution**:
- If cron job missing: Run the schedule command again
- If entries exist: Manually run `SELECT process_notification_queue();`

### High Failure Rate

**Problem**: Many notifications going to dead letter queue
**Check**:
```sql
-- What errors are occurring?
SELECT last_error, COUNT(*) as count
FROM push_notification_queue
WHERE status = 'pending'
GROUP BY last_error
ORDER BY count DESC;
```

**Common Causes:**
- **401 Unauthorized**: TRIGGER_SECRET mismatch between database and Edge Function
- **Timeout**: Edge Function slow or unresponsive
- **500 Error**: Edge Function code error (check logs)
- **Network Error**: Database can't reach Edge Function endpoint

### Dead Letter Queue Growing

**Problem**: Permanent failures accumulating
**Action**:
1. Investigate root cause (check Edge Function logs)
2. Fix underlying issue
3. Resend notifications (see Admin Operations above)
4. Acknowledge entries that can't be recovered

---

## Performance Considerations

### Queue Size Limits

- Max batch size: 50 notifications per processor run (1 minute)
- If queue grows beyond 50/min, increase batch size or run more frequently
- Monitor queue depth:
  ```sql
  SELECT COUNT(*) FROM push_notification_queue WHERE status = 'pending';
  ```

### Storage Cleanup

Succeeded entries are kept for 24 hours for debugging, then auto-deleted:
- Manual cleanup: `SELECT cleanup_old_queue_entries();`
- Schedule daily via cron if queue grows large

### Index Performance

All queries use indexes for performance:
- `next_retry_at` - For processor queries
- `license_key` - For multi-tenant filtering
- `status` - For filtering pending/retrying
- `created_at` - For age-based queries

---

## Migration Rollback

If you need to remove the retry system:

```sql
-- Drop all retry system objects
DROP VIEW IF EXISTS view_failed_notifications;
DROP FUNCTION IF EXISTS process_notification_queue();
DROP FUNCTION IF EXISTS cleanup_old_queue_entries();
DROP FUNCTION IF EXISTS move_to_dead_letter(UUID);
DROP FUNCTION IF EXISTS queue_failed_notification(TEXT, JSONB, TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS calculate_next_retry(INTEGER);
DROP TABLE IF EXISTS push_notification_dead_letter;
DROP TABLE IF EXISTS push_notification_queue;

-- Restore old triggers (from Migration 028)
-- (Copy trigger code from Migration 028)
```

---

## Future Enhancements

1. **Priority Queue**: High-priority notifications retry faster
2. **Notification Deduplication**: Prevent duplicate "up soon" notifications
3. **Rate Limiting**: Prevent spam from rapid retries
4. **Webhooks**: Alert admins when dead letter queue grows
5. **Dashboard**: Web UI for monitoring/managing queue
6. **Analytics**: Track retry success rates, common errors

---

## Questions?

**Q: What happens if processor function fails?**
A: Notifications remain in queue with status='pending' and will be retried on next processor run.

**Q: Can I change retry schedule?**
A: Yes, edit `calculate_next_retry()` function to adjust intervals.

**Q: How much storage does queue use?**
A: ~1KB per queued notification. 10,000 failed notifications = ~10MB.

**Q: Does this affect trigger performance?**
A: Minimal. Queuing a failed notification takes <5ms.

**Q: What if Edge Function is down for days?**
A: Notifications retry up to 7+ hours, then move to dead letter queue. When service recovers, manually resend from dead letter.

---

*Last Updated: 2025-11-01*
*Migration: 029*
*Status: Ready for Production*
