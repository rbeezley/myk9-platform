-- REPLICA IDENTITY FULL on public.classes so logical replication payloads
-- include the full row in payload.old. The q-side useClassRealtime hook
-- needs oldRecord.display_order to detect reorder updates from myK9Show's
-- RunOrderPage and trigger a refetch within the replication window.
--
-- With the default (PRIMARY KEY only), payload.old carries just the PK and
-- the defensive guard in useClassRealtime.ts ('display_order' in oldRecord)
-- correctly suppresses the fall-through — but that means reorders propagate
-- on the next polling cycle instead of instantly. Show-day reorders need
-- to be instant (per OPEN-TODOS.md).
--
-- Cost: marginally larger WAL/realtime payloads on every classes UPDATE.

ALTER TABLE public.classes REPLICA IDENTITY FULL;
