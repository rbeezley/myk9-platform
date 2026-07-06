-- Serialize money-moving operations per show.
--
-- A refund and the payout cron both read the same entries.refund_amount state
-- before moving money in opposite directions. The row lock is held by edge
-- functions through a short TTL so a killed function self-heals without
-- permanently blocking a show.

CREATE TABLE IF NOT EXISTS public.show_money_locks (
  show_id UUID PRIMARY KEY REFERENCES public.shows(id) ON DELETE CASCADE,
  lock_id UUID NOT NULL,
  holder TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.show_money_locks IS
  'Service-role-only short TTL lock that serializes per-show refunds and payouts.';
COMMENT ON COLUMN public.show_money_locks.holder IS
  'Edge function currently holding the show money lock, for operator diagnostics.';
COMMENT ON COLUMN public.show_money_locks.expires_at IS
  'Safety TTL; expired locks may be stolen by the next money-moving operation.';

CREATE INDEX IF NOT EXISTS show_money_locks_expires_at_idx
  ON public.show_money_locks(expires_at);

DROP TRIGGER IF EXISTS show_money_locks_updated_at ON public.show_money_locks;
CREATE TRIGGER show_money_locks_updated_at
  BEFORE UPDATE ON public.show_money_locks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.show_money_locks FROM PUBLIC;
REVOKE ALL ON public.show_money_locks FROM anon;
REVOKE ALL ON public.show_money_locks FROM authenticated;
GRANT ALL ON public.show_money_locks TO service_role;

ALTER TABLE public.show_money_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.show_money_locks FORCE ROW LEVEL SECURITY;
