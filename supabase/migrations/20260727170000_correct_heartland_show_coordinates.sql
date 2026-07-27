-- The maintained Heartland demo show displays a Tulsa venue address, but its
-- initial map-pin verification saved a test coordinate in Kansas. Correct only
-- that known fixture/value combination so a later secretary-confirmed pin is
-- never overwritten by this migration.
UPDATE public.shows
SET
  latitude = 36.15,
  longitude = -95.99,
  updated_at = NOW()
WHERE id = 'dededede-0000-0000-0000-000000000010'
  AND name = 'Heartland Scent Work Classic'
  AND location = '100 Dog Show Lane, Tulsa, OK 74101'
  AND latitude = 37.854
  AND longitude = -99.0928;
