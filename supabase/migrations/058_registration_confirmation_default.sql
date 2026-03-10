-- Add default to confirmation_number so the BEFORE INSERT trigger can fill it in
-- without requiring the column in INSERT statements.
-- The trigger (set_confirmation_number) always overwrites with the generated value.
ALTER TABLE registrations ALTER COLUMN confirmation_number SET DEFAULT '';
