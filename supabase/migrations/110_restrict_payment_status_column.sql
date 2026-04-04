-- Migration 110: Restrict payment_status column updates on registrations
--
-- Prevents authenticated exhibitors/handlers from writing payment_status
-- directly via the REST API. Only service_role (edge functions, Stripe
-- webhooks), platform_admin, site_admin, and secretaries may change it.

-- Trigger function to block non-privileged writes to payment_status
CREATE OR REPLACE FUNCTION public.restrict_payment_status_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Allow service_role (edge functions, Stripe webhooks) to bypass
    IF (SELECT current_setting('role', true)) = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Allow platform_admin and site_admin to bypass
    IF (SELECT is_platform_admin()) THEN
        RETURN NEW;
    END IF;

    -- Allow secretaries to bypass
    IF (SELECT has_role('secretary'::text)) THEN
        RETURN NEW;
    END IF;

    -- Block any attempt to change payment_status by unprivileged users
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
        RAISE EXCEPTION 'payment_status can only be modified by the service role, a platform admin, or a secretary';
    END IF;

    RETURN NEW;
END;
$$;

-- Attach the trigger
DROP TRIGGER IF EXISTS trg_restrict_payment_status ON public.registrations;

CREATE TRIGGER trg_restrict_payment_status
    BEFORE UPDATE ON public.registrations
    FOR EACH ROW
    EXECUTE FUNCTION public.restrict_payment_status_update();
