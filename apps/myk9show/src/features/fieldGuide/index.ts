/**
 * Field Guide feature — public API.
 *
 * CSS: import 'features/fieldGuide/fieldGuide.css' once at the root of any
 * Field Guide surface. All rules are scoped under [data-field-guide] so
 * adding the CSS to a non-Field-Guide page is a no-op.
 *
 * Field Guide is fully fixed (no per-club brand color), so this module
 * exports only primitives and surfaces — no hooks for color derivation.
 */

export {
  fieldGuideColors,
  fieldGuideSpacing,
  fieldGuideDurations,
  type FieldGuideColorToken,
} from './tokens';

export {
  FIELD_GUIDE_GOOGLE_FONTS_HREF,
  FIELD_GUIDE_DISPLAY_FAMILY,
  FIELD_GUIDE_BODY_FAMILY,
  FIELD_GUIDE_MONO_FAMILY,
  FIELD_GUIDE_SERIF_FAMILY,
  ensureFieldGuideFontsLoaded,
} from './fonts';

export {
  FieldGuideChip,
  type FieldGuideChipProps,
  type FieldGuideChipVariant,
} from './components/FieldGuideChip';

export {
  FieldGuideHeading,
  type FieldGuideHeadingProps,
  type FieldGuideHeadingLevel,
} from './components/FieldGuideHeading';

export {
  FieldGuideSectionHead,
  type FieldGuideSectionHeadProps,
} from './components/FieldGuideSectionHead';

export {
  FieldGuideDataGrid,
  type FieldGuideDataGridProps,
  type FieldGuideDataGridCell,
} from './components/FieldGuideDataGrid';

export {
  FieldGuideDarkBand,
  type FieldGuideDarkBandProps,
} from './components/FieldGuideDarkBand';

export {
  FieldGuideTable,
  FieldGuideTableHeaderCell,
  FieldGuideTableLabelCell,
  FieldGuideTableRow,
  FieldGuideTableValueCell,
  type FieldGuideTableProps,
  type FieldGuideTableRowProps,
} from './components/FieldGuideTable';

// Surface exports (FieldGuideLandingPage, FieldGuideEntryReceived,
// FieldGuideEntryBlankDocument, FieldGuideEntryBlankButton) are added
// alongside their files in subsequent phases.
