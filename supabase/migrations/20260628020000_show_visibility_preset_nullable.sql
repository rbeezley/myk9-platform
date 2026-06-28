-- 20260628020000_show_visibility_preset_nullable.sql
-- Make show_visibility_settings.preset nullable so "custom timings, no named
-- preset" can be represented honestly as NULL — mirroring the trial/class
-- override layers, whose preset columns are already nullable (NULL = custom).
--
-- Why this is safe:
--   * The visibility resolver (20260617150000) reads the SHOW base's timing
--     columns DIRECTLY and never expands the show-level preset, so the show
--     `preset` value is a UI label only and is behaviorally inert. Setting it
--     NULL changes no result-visibility behavior.
--   * The existing CHECK (preset IN ('open','standard','review')) is satisfied
--     by NULL (a CHECK passes when it evaluates to TRUE or UNKNOWN), so no
--     constraint change is required — only dropping NOT NULL.
--
-- Before this change, PresetSelector.applyCustomTimings coerced an unmatched
-- custom timing combo to 'standard', silently mislabeling system state. The
-- read mapper already omits a falsy preset and ShowSettingsPage already renders
-- an absent preset as "Custom" — this restores that intended behavior.

ALTER TABLE public.show_visibility_settings
  ALTER COLUMN preset DROP NOT NULL;

-- Keep the column default for fresh rows created via the self check-in path
-- (which writes default 'standard' timings alongside it). Custom-timing writes
-- pass an explicit NULL.
