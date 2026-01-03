-- Server-Side Rate Limiting for Login Attempts
-- Migration: 20251209_create_login_attempts_rate_limiting
-- Created: 2025-12-09
--
-- Purpose: Track login attempts by IP address to prevent brute force attacks
-- on passcode authentication. Client-side rate limiting can be bypassed by
-- clearing localStorage or making direct API calls.

BEGIN;

-- Create login_attempts table
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address TEXT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    success BOOLEAN NOT NULL DEFAULT FALSE,
    passcode_prefix CHAR(1), -- First character only (role indicator) for audit
    license_key TEXT, -- Only populated on successful login
    user_agent TEXT, -- For forensic analysis

    -- Indexes for efficient queries
    CONSTRAINT login_attempts_ip_address_check CHECK (ip_address != '')
);

-- Index for rate limit checks (IP + recent attempts)
CREATE INDEX idx_login_attempts_ip_recent
    ON login_attempts (ip_address, attempted_at DESC);

-- Index for cleanup of old records
CREATE INDEX idx_login_attempts_attempted_at
    ON login_attempts (attempted_at);

-- Function to check if IP is rate limited
CREATE OR REPLACE FUNCTION check_login_rate_limit(
    p_ip_address TEXT,
    p_max_attempts INTEGER DEFAULT 5,
    p_window_minutes INTEGER DEFAULT 15,
    p_block_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
    allowed BOOLEAN,
    attempts_count INTEGER,
    remaining_attempts INTEGER,
    blocked_until TIMESTAMPTZ,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_recent_failures INTEGER;
    v_last_failure TIMESTAMPTZ;
    v_window_start TIMESTAMPTZ;
    v_block_end TIMESTAMPTZ;
BEGIN
    v_window_start := NOW() - (p_window_minutes || ' minutes')::INTERVAL;

    -- Count failed attempts in window
    SELECT COUNT(*), MAX(attempted_at)
    INTO v_recent_failures, v_last_failure
    FROM login_attempts
    WHERE ip_address = p_ip_address
      AND attempted_at > v_window_start
      AND success = FALSE;

    -- Check if currently blocked (5+ failures, block for 30 min from last failure)
    IF v_recent_failures >= p_max_attempts AND v_last_failure IS NOT NULL THEN
        v_block_end := v_last_failure + (p_block_minutes || ' minutes')::INTERVAL;

        IF NOW() < v_block_end THEN
            RETURN QUERY SELECT
                FALSE,
                v_recent_failures,
                0,
                v_block_end,
                'Too many failed attempts. Please try again in ' ||
                    CEIL(EXTRACT(EPOCH FROM (v_block_end - NOW())) / 60)::TEXT || ' minutes.';
            RETURN;
        END IF;
    END IF;

    -- Allow the attempt
    RETURN QUERY SELECT
        TRUE,
        v_recent_failures,
        GREATEST(0, p_max_attempts - v_recent_failures - 1),
        NULL::TIMESTAMPTZ,
        'Attempt allowed';
END;
$$;

-- Function to record a login attempt
CREATE OR REPLACE FUNCTION record_login_attempt(
    p_ip_address TEXT,
    p_success BOOLEAN,
    p_passcode_prefix CHAR(1) DEFAULT NULL,
    p_license_key TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempt_id UUID;
BEGIN
    INSERT INTO login_attempts (ip_address, success, passcode_prefix, license_key, user_agent)
    VALUES (p_ip_address, p_success, p_passcode_prefix, p_license_key, p_user_agent)
    RETURNING id INTO v_attempt_id;

    RETURN v_attempt_id;
END;
$$;

-- Function to cleanup old login attempts (call periodically via cron)
CREATE OR REPLACE FUNCTION cleanup_old_login_attempts(
    p_retention_days INTEGER DEFAULT 7
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM login_attempts
    WHERE attempted_at < NOW() - (p_retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN v_deleted_count;
END;
$$;

-- Enable RLS on login_attempts
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role can access login_attempts (Edge Functions use service role)
-- No policies for anon - this table is not directly accessible from client
-- Note: (select ...) wrapper optimizes RLS to evaluate once per query, not per row
CREATE POLICY "Service role full access" ON login_attempts
    FOR ALL
    USING ((select auth.role()) = 'service_role')
    WITH CHECK ((select auth.role()) = 'service_role');

-- Grant execute on functions to anon (Edge Functions call these via service role anyway)
-- But the functions are SECURITY DEFINER so they run as owner
GRANT EXECUTE ON FUNCTION check_login_rate_limit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_login_attempt TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_login_attempts TO anon, authenticated;

COMMIT;

-- Verification
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== LOGIN RATE LIMITING MIGRATION COMPLETE ===';
    RAISE NOTICE 'Created: login_attempts table';
    RAISE NOTICE 'Created: check_login_rate_limit() function';
    RAISE NOTICE 'Created: record_login_attempt() function';
    RAISE NOTICE 'Created: cleanup_old_login_attempts() function';
    RAISE NOTICE '';
    RAISE NOTICE 'Rate Limit Config:';
    RAISE NOTICE '  - Max attempts: 5 per 15 minute window';
    RAISE NOTICE '  - Block duration: 30 minutes after limit reached';
    RAISE NOTICE '  - Data retention: 7 days (cleanup function)';
    RAISE NOTICE '';
END $$;

SELECT 'Login rate limiting migration applied successfully' as status;
