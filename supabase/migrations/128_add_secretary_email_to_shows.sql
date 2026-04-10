-- Add secretary_email column to shows table for CC'ing secretaries on exhibitor emails
ALTER TABLE shows ADD COLUMN secretary_email TEXT;

-- Add comment for clarity
COMMENT ON COLUMN shows.secretary_email IS 'Email address of the show secretary for CC on automated exhibitor emails';
