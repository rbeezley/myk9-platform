import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ShowCardVertical, ShowCardVerticalSkeleton } from './ShowCardVertical';
import type { Show } from '@/types/show-types';

export type UpcomingShowsVariant = 'carousel' | 'grid';

export interface UpcomingShowsProps {
  shows: Show[];
  variant?: UpcomingShowsVariant | undefined;
  onAddShow?: (() => void) | undefined;
  onViewDetails?: ((showId: string) => void) | undefined;
  className?: string | undefined;
  isLoading?: boolean | undefined;
  isEmpty?: boolean | undefined;
}

// Extracted LoadingSkeleton component
interface LoadingSkeletonProps {
  variant: UpcomingShowsVariant;
}

const LoadingSkeleton = ({ variant }: LoadingSkeletonProps) => (
  <div className="animate-pulse">
    {variant === 'grid' ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <ShowCardVerticalSkeleton key={i} />
        ))}
      </div>
    ) : (
      <div className="flex gap-6 overflow-hidden">
        {[...Array(3)].map((_, i) => (
          <ShowCardVerticalSkeleton key={i} />
        ))}
      </div>
    )}
  </div>
);

// Extracted EmptyState component
interface EmptyStateProps {
  onAddShow?: (() => void) | undefined;
}

const EmptyState = ({ onAddShow }: EmptyStateProps) => (
  <div className="text-center py-12">
    <div className="w-16 h-16 bg-muted rounded-full mx-auto mb-4 flex items-center justify-center">
      <span className="text-2xl text-muted-foreground">📅</span>
    </div>
    <h3 className="text-lg font-medium text-foreground mb-2">No shows scheduled</h3>
    <p className="text-muted-foreground mb-4">
      There are no upcoming shows to display at the moment.
    </p>
    {onAddShow && (
      <button
        onClick={onAddShow}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
      >
        Create Your First Show
      </button>
    )}
  </div>
);

const CARD_WIDTH = 300; // px, approximate card width (280px card + 20px gap)
const AUTO_SCROLL_INTERVAL = 5000; // ms

export const UpcomingShows: React.FC<UpcomingShowsProps> = ({
  shows,
  variant = 'carousel',
  onAddShow,
  onViewDetails,
  className = '',
  isLoading = false,
  isEmpty = false,
}) => {
  // Carousel specific state and refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [scrollIndex, setScrollIndex] = useState(0);
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);

  // Check scroll position to show/hide arrows
  const updateScrollButtons = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    const idx = Math.round(scrollLeft / CARD_WIDTH);
    setScrollIndex(idx);
  };

  // Set up scroll event listeners
  useEffect(() => {
    updateScrollButtons();
    const ref = scrollRef.current;
    if (!ref) return;

    ref.addEventListener('scroll', updateScrollButtons);
    window.addEventListener('resize', updateScrollButtons);

    return () => {
      ref.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [shows.length]);

  // Memoized scroll function to prevent useEffect dependency issues
  const scroll = useCallback(
    (direction: 'left' | 'right', fromAuto = false) => {
      if (!scrollRef.current) return;

      const scrollAmount = CARD_WIDTH;
      if (direction === 'left') {
        scrollRef.current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      } else {
        scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }

      if (!fromAuto) setAutoScrollPaused(true);
    },
    [setAutoScrollPaused]
  );

  // Auto-scroll logic for carousel
  useEffect(() => {
    if (variant !== 'carousel' || autoScrollPaused || !canScrollRight) return;

    const interval = setInterval(() => {
      scroll('right', true);
    }, AUTO_SCROLL_INTERVAL);

    return () => clearInterval(interval);
  }, [autoScrollPaused, canScrollRight, variant, scroll]);

  const handleUserScroll = () => setAutoScrollPaused(true);
  const handleViewDetails = (showId: string) => {
    onViewDetails?.(showId);
  };

  // Handle loading and empty states
  if (isLoading) {
    return <LoadingSkeleton variant={variant} />;
  }

  if (isEmpty || shows.length === 0) {
    return <EmptyState onAddShow={onAddShow} />;
  }

  // Grid layout
  if (variant === 'grid') {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className}`}>
        {shows.map(show => (
          <ShowCardVertical
            key={show.id}
            show={show}
            onViewDetails={() => handleViewDetails(show.id)}
          />
        ))}
      </div>
    );
  }

  // Carousel layout (default)
  return (
    <div className={`relative ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-3xl font-bold">Upcoming Shows</h2>
        <div className="flex gap-2">
          {onAddShow && <Button onClick={onAddShow}>+ Create New Show</Button>}
          {canScrollLeft && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Scroll left"
              onClick={() => scroll('left')}
              className="rounded-full border-primary/20 hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
          )}
          {canScrollRight && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Scroll right"
              onClick={() => scroll('right')}
              className="rounded-full border-primary/20 hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto pb-4 hide-scrollbar scroll-smooth snap-x snap-mandatory"
        style={{ scrollBehavior: 'smooth' }}
        onMouseDown={handleUserScroll}
        onTouchStart={handleUserScroll}
      >
        {shows.map(show => (
          <div key={show.id} className="snap-start flex-shrink-0">
            <ShowCardVertical show={show} onViewDetails={() => handleViewDetails(show.id)} />
          </div>
        ))}
      </div>

      {/* Scroll indicators */}
      {shows.length > 1 && (
        <div className="flex justify-center mt-4 gap-2">
          {shows.map((_, idx) => (
            <span
              key={idx}
              className={`w-2 h-2 rounded-full transition-all duration-200 ${
                scrollIndex === idx ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default UpcomingShows;
