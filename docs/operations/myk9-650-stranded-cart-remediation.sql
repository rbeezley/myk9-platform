-- MYK9-650: one-off remediation for items stranded in a cart the app cannot open.
--
-- NOT A MIGRATION. Do not move this into supabase/migrations/. Richard runs it
-- by hand, once, after review, as the `postgres` user over the pooler:
--
--   psql "$POOLER_URL" -v ON_ERROR_STOP=1 -f docs/operations/myk9-650-stranded-cart-remediation.sql
--
-- Background. `/cart`, the header badge and the wizard opener used to read
-- `entry_carts WHERE status IN ('active','expired') ORDER BY created_at DESC
-- LIMIT 1`, so a newer EMPTY cart for the same (show, exhibitor) hid an older
-- cart's drafted items. The app now ranks the candidates in one helper
-- (`pickRecoverableCart`, apps/myk9show/src/store/cartStore.pickCart.ts):
--
--   1. status 'active' with items, newest first
--   2. status 'active'
--   3. status 'expired' with items
--   4. status 'expired'
--
-- 'active' ranks first because the app, as `authenticated`, can never set a
-- row's status to 'active' (`trg_entry_carts_protect_status`,
-- 20260611230000), so an 'expired' cart is one it cannot open. Items sitting in
-- 'expired' carts are therefore unreachable from the app, and this script is
-- what brings them back. Per (show, exhibitor) it:
--
--   1. picks the cart the app would pick (the ranking above);
--   2. moves every item from the pair's other recoverable carts into it,
--      EXCEPT an item whose (dog, class) the picked cart already holds, since
--      `entry_cart_items_unique_dog_class_idx` is (cart_id, dog_id, class_id)
--      (MYK9-530). When two other carts hold the same (dog, class), only the
--      newest copy moves;
--   3. makes the picked cart 'active' when it now holds items, so the app can
--      open it (at most one per pair, so the active-cart index holds), and
--      severs the checkout session of EVERY cart whose contents changed: the
--      carts items moved into AND the carts they moved out of;
--   4. expires every other recoverable cart in the pair that is now empty.
--
-- Carts are never merged across shows or exhibitors, and terminal carts
-- (submitted / abandoned) are never touched. Stored totals are a cache: the app
-- recomputes them from the items on every load, and stripe-checkout overwrites
-- them, so they are not rewritten here. A revived draft may hold a class that
-- has since closed; stripe-checkout's show and entry-window gates still apply
-- at payment, and the class-closure re-check is tracked separately (MYK9-656).
--
-- Both guard triggers (`trg_entry_cart_items_protect_cart_id` and
-- `trg_entry_carts_protect_status`) admit only `current_setting('role') =
-- 'service_role'`, so the write transaction runs under `SET LOCAL ROLE
-- service_role`, which ends with the transaction.
--
-- The script opens and closes with a census and writes in ONE transaction.
-- Read the "before" census, run it, and compare the "after" census:
-- `items_in_unopenable_or_unpicked_carts` should reach 0 except for duplicate
-- copies, which stay in their old cart.

\echo '== BEFORE =='

WITH carts AS (
  SELECT c.id, c.show_id, c.exhibitor_id, c.status, c.created_at,
         (SELECT count(*) FROM public.entry_cart_items i WHERE i.cart_id = c.id) AS item_count
  FROM public.entry_carts c
  WHERE c.status IN ('active', 'expired')
),
ranked AS (
  SELECT carts.*,
         row_number() OVER (
           PARTITION BY show_id, exhibitor_id
           ORDER BY (status = 'active') DESC, (item_count > 0) DESC,
                    created_at DESC NULLS LAST, id DESC
         ) AS pick_rank,
         count(*) OVER (PARTITION BY show_id, exhibitor_id) AS carts_in_pair
  FROM carts
),
picked AS (SELECT * FROM ranked WHERE pick_rank = 1),
stranded AS (
  SELECT i.*, r.show_id, r.exhibitor_id
  FROM public.entry_cart_items i
  JOIN ranked r ON r.id = i.cart_id AND r.pick_rank > 1
)
SELECT
  (SELECT count(*) FROM carts WHERE status = 'active')                      AS active_carts,
  (SELECT count(*) FROM carts WHERE status = 'expired')                     AS expired_carts,
  (SELECT count(*) FROM carts WHERE status = 'expired' AND item_count > 0)  AS expired_carts_with_items,
  (SELECT coalesce(sum(item_count), 0) FROM carts WHERE status = 'expired') AS items_in_expired_carts,
  (SELECT count(*) FROM carts WHERE created_at IS NULL)                     AS carts_without_created_at,
  (SELECT count(*) FROM picked WHERE carts_in_pair > 1)                     AS pairs_with_several_carts,
  (SELECT count(*) FROM (
     SELECT 1 FROM carts GROUP BY show_id, exhibitor_id
     HAVING bool_or(status = 'active') AND bool_or(status = 'expired')) x)  AS pairs_with_active_and_expired,
  (SELECT count(*) FROM picked WHERE status = 'expired' AND item_count > 0) AS picks_to_reactivate,
  (SELECT count(*) FROM stranded)                                           AS stranded_items,
  (SELECT count(*) FROM stranded s
     WHERE EXISTS (
       SELECT 1 FROM public.entry_cart_items pi
       JOIN picked p ON p.id = pi.cart_id
       WHERE p.show_id = s.show_id AND p.exhibitor_id = s.exhibitor_id
         AND pi.dog_id = s.dog_id AND pi.class_id = s.class_id))            AS stranded_duplicates_of_picked;

BEGIN;

-- The guard triggers admit service_role only; LOCAL ends with the transaction.
SET LOCAL ROLE service_role;

-- The pick, materialised once so every statement below agrees on it.
CREATE TEMP TABLE myk9_650_pick ON COMMIT DROP AS
WITH carts AS (
  SELECT c.id, c.show_id, c.exhibitor_id, c.status, c.created_at,
         (SELECT count(*) FROM public.entry_cart_items i WHERE i.cart_id = c.id) AS item_count
  FROM public.entry_carts c
  WHERE c.status IN ('active', 'expired')
)
SELECT id, show_id, exhibitor_id,
       row_number() OVER (
         PARTITION BY show_id, exhibitor_id
         ORDER BY (status = 'active') DESC, (item_count > 0) DESC,
                  created_at DESC NULLS LAST, id DESC
       ) AS pick_rank
FROM carts;

-- Every cart an item moved into or out of, so exactly those sessions are severed.
CREATE TEMP TABLE myk9_650_changed_carts (cart_id uuid PRIMARY KEY) ON COMMIT DROP;

-- Lock every cart in scope so a live session cannot add to one mid-move.
SELECT c.id FROM public.entry_carts c JOIN myk9_650_pick p ON p.id = c.id FOR UPDATE OF c;

-- 2. Move the stranded items that do not collide. DISTINCT ON keeps the newest
--    copy when two other carts hold the same (dog, class).
WITH candidates AS (
  SELECT DISTINCT ON (target.id, i.dog_id, i.class_id)
         i.id AS item_id, i.cart_id AS source_cart_id, target.id AS target_cart_id
  FROM public.entry_cart_items i
  JOIN myk9_650_pick src ON src.id = i.cart_id AND src.pick_rank > 1
  JOIN myk9_650_pick target
    ON target.show_id = src.show_id
   AND target.exhibitor_id = src.exhibitor_id
   AND target.pick_rank = 1
  WHERE NOT EXISTS (
    SELECT 1 FROM public.entry_cart_items existing
    WHERE existing.cart_id = target.id
      AND existing.dog_id = i.dog_id
      AND existing.class_id = i.class_id
  )
  ORDER BY target.id, i.dog_id, i.class_id, i.created_at DESC NULLS LAST, i.id DESC
),
moved AS (
  UPDATE public.entry_cart_items i
  SET cart_id = c.target_cart_id
  FROM candidates c
  WHERE i.id = c.item_id
  RETURNING c.source_cart_id, c.target_cart_id
)
INSERT INTO myk9_650_changed_carts
SELECT source_cart_id FROM moved
UNION
SELECT target_cart_id FROM moved;

-- 4 (before 3, so the reactivation below can never meet a second active row).
--    Expire every non-picked cart in the pair that is now empty.
UPDATE public.entry_carts cart
SET status = 'expired'
FROM myk9_650_pick p
WHERE p.id = cart.id
  AND p.pick_rank > 1
  AND cart.status IN ('active', 'expired')
  AND NOT EXISTS (SELECT 1 FROM public.entry_cart_items i WHERE i.cart_id = cart.id);

-- 3a. Make each picked 'expired' cart that holds items openable. A picked
--     'expired' cart exists only when the pair has no active cart, so this
--     cannot collide with entry_carts_active_show_exhibitor_unique_idx.
UPDATE public.entry_carts cart
SET status = 'active',
    stripe_checkout_session_id = NULL
FROM myk9_650_pick p
WHERE p.id = cart.id
  AND p.pick_rank = 1
  AND cart.status = 'expired'
  AND EXISTS (SELECT 1 FROM public.entry_cart_items i WHERE i.cart_id = cart.id);

-- 3b. A cart whose contents changed must not be paid through an open session,
--     on either side of a move. The app never has to do this by hand because
--     deleting a cart item fires trg_cart_item_delete_sever_session and
--     changing its dog/class/entry fires trg_cart_item_identity_sever_session.
--     Moving an item by updating its cart_id fires NEITHER, so the source
--     cart would keep a session for contents it no longer holds; clear both
--     sides here.
UPDATE public.entry_carts cart
SET stripe_checkout_session_id = NULL
FROM myk9_650_changed_carts m
WHERE m.cart_id = cart.id
  AND cart.stripe_checkout_session_id IS NOT NULL;

COMMIT;

\echo '== AFTER =='

WITH carts AS (
  SELECT c.id, c.show_id, c.exhibitor_id, c.status, c.created_at,
         (SELECT count(*) FROM public.entry_cart_items i WHERE i.cart_id = c.id) AS item_count
  FROM public.entry_carts c
  WHERE c.status IN ('active', 'expired')
),
ranked AS (
  SELECT carts.*,
         row_number() OVER (
           PARTITION BY show_id, exhibitor_id
           ORDER BY (status = 'active') DESC, (item_count > 0) DESC,
                    created_at DESC NULLS LAST, id DESC
         ) AS pick_rank
  FROM carts
)
SELECT
  (SELECT count(*) FROM carts WHERE status = 'active')                      AS active_carts,
  (SELECT count(*) FROM carts WHERE status = 'expired')                     AS expired_carts,
  (SELECT count(*) FROM carts WHERE status = 'expired' AND item_count > 0)  AS expired_carts_with_items,
  (SELECT coalesce(sum(item_count), 0)
     FROM ranked WHERE pick_rank > 1 OR status = 'expired')                 AS items_in_unopenable_or_unpicked_carts,
  (SELECT count(*) FROM (
     SELECT 1 FROM carts WHERE status = 'active'
     GROUP BY show_id, exhibitor_id HAVING count(*) > 1) a)                 AS pairs_with_two_active_carts,
  (SELECT count(*) FROM (
     SELECT 1 FROM public.entry_cart_items
     GROUP BY cart_id, dog_id, class_id HAVING count(*) > 1) d)             AS duplicate_dog_class_rows;
