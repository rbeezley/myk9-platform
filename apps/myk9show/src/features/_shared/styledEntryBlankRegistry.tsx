// Import each button from its own file, never the style's `entry-blank` barrel:
// the barrels re-export the PDF documents, which would put @react-pdf/renderer
// back on the static path of every page that mounts an entry-blank button.
import type { ReactElement } from 'react';
import type { BuildEntryBlankOptions } from '@/features/heritage/entry-blank/buildEntryBlankProps';
import { HeritageEntryBlankButton } from '@/features/heritage/entry-blank/HeritageEntryBlankButton';
import { HeadlineEntryBlankButton } from '@/features/headline/entry-blank/HeadlineEntryBlankButton';
import { MonogramEntryBlankButton } from '@/features/monogram/entry-blank/MonogramEntryBlankButton';
import { BannerEntryBlankButton } from '@/features/banner/entry-blank/BannerEntryBlankButton';
import { FieldGuideEntryBlankButton } from '@/features/fieldGuide/entry-blank/FieldGuideEntryBlankButton';
import { GazetteEntryBlankButton } from '@/features/gazette/entry-blank/GazetteEntryBlankButton';
import { MagazineEntryBlankButton } from '@/features/magazine/entry-blank/MagazineEntryBlankButton';
import { PosterEntryBlankButton } from '@/features/poster/entry-blank/PosterEntryBlankButton';
import type { ShowStyle } from '@/features/registries';

export interface StyledEntryBlankButtonProps extends BuildEntryBlankOptions {
  label: string;
  filename?: string;
  className?: string;
}

interface StyledEntryBlankExtras {
  brandColor: string | null;
}

type StyledEntryBlankRenderer = (
  props: StyledEntryBlankButtonProps,
  extras: StyledEntryBlankExtras
) => ReactElement;

export const STYLED_ENTRY_BLANK_BY_STYLE: Record<ShowStyle, StyledEntryBlankRenderer> = {
  heritage: props => <HeritageEntryBlankButton {...props} />,
  headline: props => <HeadlineEntryBlankButton {...props} />,
  monogram: props => <MonogramEntryBlankButton {...props} />,
  banner: (props, extras) => <BannerEntryBlankButton {...props} brandColor={extras.brandColor} />,
  fieldGuide: props => <FieldGuideEntryBlankButton {...props} />,
  gazette: props => <GazetteEntryBlankButton {...props} />,
  magazine: props => <MagazineEntryBlankButton {...props} />,
  poster: props => <PosterEntryBlankButton {...props} />,
};
