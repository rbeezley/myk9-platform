import { useMemo } from 'react';
import { useAccountTodayEntries, usePreFavoriteAccountTodayEntries } from './accountTodayEntries';
import {
  buildShowTodayBannerItems,
  getShowTodayBannerVariant,
} from './showTodayBanner.helpers';

export function useShowTodayBanner() {
  const accountEntries = useAccountTodayEntries();
  const preFavoriteShow = usePreFavoriteAccountTodayEntries();
  const items = useMemo(
    () => buildShowTodayBannerItems(accountEntries.data ?? []),
    [accountEntries.data]
  );

  return {
    items,
    variant: getShowTodayBannerVariant(items),
    isLoading: accountEntries.isLoading,
    preFavoriteShow,
  };
}
