-- Add TOS agreement timestamp to people table
ALTER TABLE people
  ADD COLUMN agreed_to_tos_at timestamptz;

COMMENT ON COLUMN people.agreed_to_tos_at IS 'Timestamp when the user agreed to the Terms of Service and Privacy Policy during signup';
