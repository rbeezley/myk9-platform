-- Rename `division` to `section` on classes table.
-- AKC (our primary organization) calls this "section" (A/B).
-- UKC calls it "division" — the app code already uses "section" everywhere.
ALTER TABLE classes RENAME COLUMN division TO section;
