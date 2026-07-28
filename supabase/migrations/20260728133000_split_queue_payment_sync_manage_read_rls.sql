-- MYK9-112: split queue, payment, and sync ALL management policies from reads.

DROP POLICY IF EXISTS "notification_queue_manage" ON public.notification_queue;

CREATE POLICY "notification_queue_insert"
  ON public.notification_queue
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "notification_queue_update"
  ON public.notification_queue
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "notification_queue_delete"
  ON public.notification_queue
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS "push_notification_queue_manage" ON public.push_notification_queue;

CREATE POLICY "push_notification_queue_insert"
  ON public.push_notification_queue
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "push_notification_queue_update"
  ON public.push_notification_queue
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "push_notification_queue_delete"
  ON public.push_notification_queue
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS "stripe_customers_manage" ON public.stripe_customers;

CREATE POLICY "stripe_customers_manage_insert"
  ON public.stripe_customers
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "stripe_customers_manage_update"
  ON public.stripe_customers
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "stripe_customers_manage_delete"
  ON public.stripe_customers
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS "stripe_orders_manage" ON public.stripe_orders;

CREATE POLICY "stripe_orders_manage_insert"
  ON public.stripe_orders
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "stripe_orders_manage_update"
  ON public.stripe_orders
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "stripe_orders_manage_delete"
  ON public.stripe_orders
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS "stripe_subscriptions_manage" ON public.stripe_subscriptions;

CREATE POLICY "stripe_subscriptions_manage_insert"
  ON public.stripe_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "stripe_subscriptions_manage_update"
  ON public.stripe_subscriptions
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "stripe_subscriptions_manage_delete"
  ON public.stripe_subscriptions
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS "sync_conflicts_manage" ON public.sync_conflicts;
DROP POLICY IF EXISTS "sync_conflicts_select" ON public.sync_conflicts;

CREATE POLICY "sync_conflicts_insert"
  ON public.sync_conflicts
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "sync_conflicts_update"
  ON public.sync_conflicts
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY "sync_conflicts_delete"
  ON public.sync_conflicts
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_platform_admin()));

CREATE POLICY "sync_conflicts_select"
  ON public.sync_conflicts
  FOR SELECT
  TO authenticated
  USING (
    (SELECT ((auth.jwt() ->> 'is_anonymous'::text))::boolean) IS NOT TRUE
    OR (SELECT public.is_platform_admin())
  );
