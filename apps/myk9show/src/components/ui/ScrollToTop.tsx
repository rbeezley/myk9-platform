import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ScrollToTop: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  // Show button when page is scrolled up to given distance
  const toggleVisibility = () => {
    if (window.pageYOffset > 300) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  };

  // Set the scroll event listener
  useEffect(() => {
    window.addEventListener('scroll', toggleVisibility);
    return () => {
      window.removeEventListener('scroll', toggleVisibility);
    };
  }, []);

  // Scroll to top smoothly with celebration
  const scrollToTop = () => {
    setIsClicked(true);
    
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });

    // Reset click animation after scroll completes
    setTimeout(() => {
      setIsClicked(false);
    }, 1000);
  };

  return (
    <>
      {isVisible && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            onClick={scrollToTop}
            size="icon"
            className={`
              bg-gradient-to-r from-primary to-secondary text-primary-foreground 
              shadow-lg hover:shadow-xl transition-all duration-300 
              hover:scale-110 hover:-translate-y-1 rounded-full
              ${isClicked ? 'animate-bounce scale-125' : ''}
            `}
            title="Back to top"
          >
            <div className="relative">
              <ArrowUp className={`w-5 h-5 transition-transform duration-300 ${isClicked ? 'scale-110' : ''}`} />
              
              {/* Celebration sparkles when clicked */}
              {isClicked && (
                <>
                  <div className="absolute -top-2 -right-2 text-yellow-400 animate-pulse text-xs">✨</div>
                  <div className="absolute -bottom-2 -left-2 text-pink-400 animate-pulse text-xs">✨</div>
                  <div className="absolute -top-2 -left-2 text-purple-400 animate-pulse text-xs">⭐</div>
                </>
              )}
            </div>
          </Button>
          
          {/* Floating paw print */}
          <div className="absolute -top-8 -left-2 text-lg opacity-60 animate-bounce pointer-events-none">
            🐾
          </div>
        </div>
      )}
    </>
  );
};

export default ScrollToTop;