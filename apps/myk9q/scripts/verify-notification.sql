-- Check if the announcement was created
SELECT id, title, created_at 
FROM announcements 
WHERE title = 'RETRY TEST - Simulated Failure'
ORDER BY created_at DESC 
LIMIT 1;

-- Check recent HTTP responses to see if notification was sent
SELECT 
  id,
  status_code,
  content::text,
  created
FROM net._http_response
ORDER BY id DESC
LIMIT 3;

-- Check if anything is in the queue at all
SELECT COUNT(*) as total_queued
FROM push_notification_queue;
