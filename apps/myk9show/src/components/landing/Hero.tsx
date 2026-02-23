import { Search, Heart, Dog, Trophy, Calendar, Star, Sparkles, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useRef } from 'react';

// Using optimized logo from public folder
const dogShowImageWebP = '/logo.webp';
const dogShowImagePNG = '/logo.png'; // Fallback for older browsers

export default function Hero() {
  const [searchFocused, setSearchFocused] = useState(false);
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const logoClicksRef = useRef(0);

  // Easter egg: Triple click the logo for a surprise
  const handleLogoClick = () => {
    logoClicksRef.current += 1;
    if (logoClicksRef.current === 3) {
      setShowEasterEgg(true);
      setTimeout(() => setShowEasterEgg(false), 3000);
      logoClicksRef.current = 0;
    }
    // Reset click counter after 2 seconds
    setTimeout(() => { logoClicksRef.current = 0; }, 2000);
  };


  return (
    <section className="pt-24 pb-20 md:pt-32 md:pb-28 bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-8">
          {/* Logo - left side */}
          <div className="lg:w-1/2 flex justify-center items-center relative">
            {/* Easter egg confetti */}
            {showEasterEgg && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
                <Star className="animate-pulse absolute top-8 left-8 h-8 w-8 text-yellow-400" style={{ animationDuration: '0.5s' }} />
                <Heart className="animate-pulse absolute top-16 right-12 h-6 w-6 text-pink-400" style={{ animationDelay: '0.2s', animationDuration: '0.5s' }} />
                <PartyPopper className="animate-pulse absolute bottom-16 left-16 h-6 w-6 text-purple-400" style={{ animationDelay: '0.4s', animationDuration: '0.5s' }} />
                <Star className="animate-pulse absolute bottom-8 right-20 h-8 w-8 text-green-400" style={{ animationDelay: '0.6s', animationDuration: '0.5s' }} />
                <Sparkles className="animate-pulse absolute top-24 left-32 h-5 w-5 text-blue-400" style={{ animationDelay: '0.3s', animationDuration: '0.5s' }} />
                <PartyPopper className="animate-pulse absolute bottom-24 right-32 h-6 w-6 text-red-400" style={{ animationDelay: '0.7s', animationDuration: '0.5s' }} />
              </div>
            )}
            
            <div className="h-[350px] flex items-center justify-center relative group">
              <div 
                className="transform transition-all duration-500 hover:scale-105 hover:rotate-1 cursor-pointer"
                onClick={handleLogoClick}
                title="Triple-click me for a surprise!"
              >
                <picture>
                  <source srcSet={dogShowImageWebP} type="image/webp" />
                  <img
                    src={dogShowImagePNG}
                    alt="Robot dog with blue glowing eyes"
                    className={`w-auto h-auto max-h-full max-w-[300px] object-contain transition-all duration-300 ${
                      showEasterEgg ? 'animate-pulse' : ''
                    }`}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    width="300"
                    height="300"
                  />
                </picture>
                
                {/* Glowing effect on hover */}
                <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
            </div>
          </div>
          
          {/* Hero content - right side */}
          <div className="lg:w-1/2 text-center lg:text-left">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground leading-tight">
              Welcome to
              <span className="block text-primary leading-normal pb-1">
                myK9Show
              </span>
            </h1>
            <p className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto lg:mx-0">
              A comprehensive solution for managing dog shows, events, registrations, scoring, reporting and more—all in one place.
            </p>
            
            {/* Search box with delightful interactions */}
            <div className="mt-8 max-w-md mx-auto lg:mx-0">
              <div className="relative group">
                <input
                  type="text"
                  placeholder={searchFocused ? "Woof! What show are you looking for?" : "Search for upcoming shows..."}
                  className="w-full h-11 px-4 py-3 pl-12 rounded-lg border border-border/50 bg-input text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 ease-apple hover:border-primary/40 hover:shadow-md"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
                <div className={`absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-all duration-300 ${
                  searchFocused ? 'text-primary scale-110' : 'group-hover:text-primary/70'
                }`}>
                  <Search size={20} />
                </div>
                
                {/* Animated search suggestions on focus */}
                {searchFocused && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-lg z-10 animate-in slide-in-from-top-1 duration-200">
                    <div className="p-3 space-y-2">
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors">
                        <Dog className="h-4 w-4" />
                        <span>Dog shows near me</span>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors">
                        <Trophy className="h-4 w-4" />
                        <span>Championship events</span>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors">
                        <Calendar className="h-4 w-4" />
                        <span>This weekend's shows</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* CTA Button */}
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button
                asChild
                className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40
                         hover:-translate-y-0.5 transition-all duration-300 shadow-sm rounded-full group relative overflow-hidden"
                variant="outline"
              >
                <a href="/pricing-page" className="relative z-10">
                  <span className="flex items-center gap-2">
                    View Premium Pricing Plans
                    <Heart className="w-4 h-4 group-hover:text-red-500 group-hover:animate-pulse transition-colors duration-300" />
                  </span>
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
