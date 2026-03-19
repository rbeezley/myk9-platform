import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ShowCardVertical } from '@/components/shows/ShowCardVertical';
import type { Show } from '@/types/show-types';

interface UpcomingShowsSectionProps {
  shows: Show[];
  onAddShow: () => void;
}

const CARD_WIDTH = 300; // px, approximate card width (280px card + 20px gap)
const AUTO_SCROLL_INTERVAL = 5000; // ms

const UpcomingShowsSection: React.FC<UpcomingShowsSectionProps> = ({ shows, onAddShow }) => {
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
    // Update scroll index for indicators
    const idx = Math.round(scrollLeft / CARD_WIDTH);
    setScrollIndex(idx);
  };

  // Scroll function - declared before useEffect that uses it
  const scroll = useCallback((direction: 'left' | 'right', fromAuto = false) => {
    if (scrollRef.current) {
      const { current } = scrollRef;
      const scrollAmount = CARD_WIDTH;
      if (direction === 'left') {
        current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      } else {
        current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
      if (!fromAuto) setAutoScrollPaused(true);
    }
  }, []);

  // Pause auto-scroll on user interaction
  const handleUserScroll = useCallback(() => setAutoScrollPaused(true), []);

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
  }, []);

  // Auto-scroll logic
  useEffect(() => {
    if (autoScrollPaused || !canScrollRight) return;
    const interval = setInterval(() => {
      scroll('right', true);
    }, AUTO_SCROLL_INTERVAL);
    return () => clearInterval(interval);
  }, [autoScrollPaused, canScrollRight, scroll]);

  return (
    <section className="py-16 bg-background text-foreground transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-end mb-4">
          <Button onClick={onAddShow}>+ Enter New Show</Button>
        </div>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold">Upcoming Shows</h2>
          <div className="flex gap-2">
            {canScrollLeft && (
              <button
                aria-label="Scroll left"
                onClick={() => scroll('left')}
                className="p-2 rounded-full bg-muted hover:bg-primary/10 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {canScrollRight && (
              <button
                aria-label="Scroll right"
                onClick={() => scroll('right')}
                className="p-2 rounded-full bg-muted hover:bg-primary/10 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
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
              <ShowCardVertical show={show} />
            </div>
          ))}
        </div>
        {/* Scroll indicators */}
        <div className="flex justify-center mt-4 gap-2">
          {shows.map((_, idx) => (
            <span
              key={idx}
              className={`w-2 h-2 rounded-full transition-all duration-200 ${scrollIndex === idx ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default UpcomingShowsSection;
