ALTER TABLE shows ADD COLUMN IF NOT EXISTS cc_secretary_on_exhibitor_emails boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN shows.cc_secretary_on_exhibitor_emails IS 'When true, the secretary_email is CC-d on automated exhibitor emails (entry confirmations, payment receipts, waitlist notifications)';
