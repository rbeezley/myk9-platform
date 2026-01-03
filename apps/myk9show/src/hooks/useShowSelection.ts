import { useShowStore } from '@/store/showStore';
import type { Show } from '@/types/show-types';

export function useShowSelection() {
  const shows = useShowStore((state) => state.shows);
  const selectedShowId = useShowStore((state) => state.selectedShowId);
  const selectShow = useShowStore((state) => state.selectShow);
  const setShows = useShowStore((state) => state.setShows);
  const addShow = useShowStore((state) => state.addShow);
  const updateShow = useShowStore((state) => state.updateShow);
  const removeShow = useShowStore((state) => state.removeShow);

  const selectedShow: Show | undefined = shows.find((s) => s.id === selectedShowId);

  return {
    shows,
    selectedShowId,
    selectedShow,
    selectShow,
    setShows,
    addShow,
    updateShow,
    removeShow,
  };
}
