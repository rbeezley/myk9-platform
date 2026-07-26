import type { ReactElement } from 'react';
import type { BuildEntryBlankOptions } from '@/features/heritage/entry-blank/buildEntryBlankProps';
import { HeritageEntryBlankButton } from '@/features/heritage/entry-blank';
import { HeadlineEntryBlankButton } from '@/features/headline/entry-blank';
import { MonogramEntryBlankButton } from '@/features/monogram/entry-blank';
import { BannerEntryBlankButton } from '@/features/banner/entry-blank';
import { FieldGuideEntryBlankButton } from '@/features/fieldGuide/entry-blank';
import { GazetteEntryBlankButton } from '@/features/gazette/entry-blank';
import { MagazineEntryBlankButton } from '@/features/magazine/entry-blank';
import { PosterEntryBlankButton } from '@/features/poster/entry-blank';
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
