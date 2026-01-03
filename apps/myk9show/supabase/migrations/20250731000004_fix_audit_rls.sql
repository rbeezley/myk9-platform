-- Fix RLS Policy for Audit Entry Table
-- This ensures triggers can write to audit_entry table

-- Drop existing policies and recreate them properly
DROP POLICY IF EXISTS "System can insert audit entries" ON audit_entry;

-- Create a permissive policy that allows trigger functions to insert
CREATE POLICY "Allow audit trigger inserts" 
ON audit_entry FOR INSERT 
WITH CHECK (true);

-- Also allow authenticated users to insert (for AuditService)
CREATE POLICY "Allow authenticated audit inserts" 
ON audit_entry FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow anonymous inserts (for trigger functions)
CREATE POLICY "Allow anonymous audit inserts" 
ON audit_entry FOR INSERT 
TO anon 
WITH CHECK (true);

-- Allow reading audit entries for authenticated users
CREATE POLICY "Allow authenticated audit reads" 
ON audit_entry FOR SELECT 
TO authenticated 
USING (true);

-- Test query to verify
SELECT 'RLS policies updated for audit_entry table' as status;