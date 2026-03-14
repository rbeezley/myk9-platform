import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LandingShow } from '@/types';

interface UpcomingShowsSectionProps {
  shows: LandingShow[];
  onAddShow: () => void;
}

const CARD_WIDTH = 340; // px, approximate card width including gap
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
          className="flex gap-6 overflow-x-auto pb-4 hide-scrollbar scroll-smooth snap-x snap-mandatory"
          style={{ scrollBehavior: 'smooth' }}
          onMouseDown={handleUserScroll}
          onTouchStart={handleUserScroll}
        >
          {shows.map(show => (
            <Card
              key={show.id}
              className="min-w-[320px] max-w-[340px] flex-shrink-0 shadow-md relative snap-start transition-transform duration-300 hover:scale-105 hover:shadow-xl bg-card border-border text-card-foreground"
              style={show.accentColor ? { borderLeft: `4px solid ${show.accentColor}` } : undefined}
            >
              {/* Date badge */}
              <span className="absolute top-4 left-4 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-md z-10 shadow">
                {show.date}
              </span>
              <CardHeader className="pb-0">
                <img
                  src={show.imageUrl}
                  alt={show.title}
                  className="rounded-lg w-full h-40 object-cover mb-4"
                />
                <h3 className="text-xl font-semibold mb-2">{show.title}</h3>
                <div className="flex items-center text-muted-foreground text-sm mb-2">
                  <MapPin className="w-4 h-4 mr-1" />
                  {show.location}
                </div>
              </CardHeader>
              <CardContent>
                <button className="mt-2 px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground rounded-lg transition-colors w-full">
                  View Details
                </button>
              </CardContent>
            </Card>
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
