-- Migration: Add columns for label printing feature
-- venue WiFi fields on shows (for armband labels)
-- is_day_of_show flag on entries (for filtering early vs day-of entries)

ALTER TABLE shows
  ADD COLUMN IF NOT EXISTS venue_wifi_network text,
  ADD COLUMN IF NOT EXISTS venue_wifi_password text;

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS is_day_of_show boolean DEFAULT false;

COMMENT ON COLUMN shows.venue_wifi_network IS 'Venue WiFi SSID for display on armband labels';
COMMENT ON COLUMN shows.venue_wifi_password IS 'Venue WiFi password for display on armband labels';
COMMENT ON COLUMN entries.is_day_of_show IS 'True for entries added after early entry closing date';
