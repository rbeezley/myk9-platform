import React, { useState, useEffect } from 'react';
import { Dog, Trophy, Award, PawPrint, Wand2, Sparkles, Waves } from 'lucide-react';

interface DelightfulLoadingProps {
  message?: string;
  variant?: 'default' | 'carousel' | 'wizard';
  className?: string;
}

const DelightfulLoading: React.FC<DelightfulLoadingProps> = ({ 
  message, 
  variant = 'default',
  className = '' 
}) => {
  const [currentMessage, setCurrentMessage] = useState(0);
  const [pawStep, setPawStep] = useState(0);

  // Fun loading messages
  const loadingMessages = {
    default: [
      "Fetching the good dogs...",
      "Organizing treats and ribbons...",
      "Counting paw prints...",
      "Preparing the show ring...",
      "Almost ready to strut!"
    ],
    carousel: [
      "Gathering show information...",
      "Polishing trophies...",
      "Checking the judge's scorecard...",
      "Setting up the show ring...",
      "Ready to show off!"
    ],
    wizard: [
      "Preparing your show wizard...",
      "Gathering magical show tools...",
      "Summoning the perfect venue...",
      "Casting organization spells...",
      "Your show is almost ready!"
    ]
  };

  const messages = loadingMessages[variant];

  // Rotate through loading messages
  useEffect(() => {
    const messageInterval = setInterval(() => {
      setCurrentMessage((prev) => (prev + 1) % messages.length);
    }, 2000);

    return () => clearInterval(messageInterval);
  }, [messages.length]);

  // Animate paw steps
  useEffect(() => {
    const pawInterval = setInterval(() => {
      setPawStep((prev) => (prev + 1) % 4);
    }, 300);

    return () => clearInterval(pawInterval);
  }, []);

  if (variant === 'carousel') {
    return (
      <div className={`mt-8 flex justify-center items-center h-32 ${className}`}>
        <div className="flex flex-col items-center space-y-4">
          {/* Bouncing show cards animation */}
          <div className="flex space-x-4">
            <div className="rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 h-24 w-64 animate-pulse flex items-center justify-center relative overflow-hidden">
              <div className="animate-bounce" style={{ animationDelay: '0s' }}>
                <Trophy className="h-10 w-10 text-yellow-500" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 translate-x-full animate-[shimmer_2s_infinite]" />
            </div>
            <div className="rounded-lg bg-gradient-to-br from-secondary/20 to-secondary/10 h-24 w-64 animate-pulse flex items-center justify-center relative overflow-hidden" style={{ animationDelay: '0.3s' }}>
              <div className="animate-bounce" style={{ animationDelay: '0.5s' }}>
                <Dog className="h-10 w-10 text-primary" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 translate-x-full animate-[shimmer_2s_infinite_0.5s]" />
            </div>
            <div className="rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 h-24 w-64 animate-pulse flex items-center justify-center relative overflow-hidden" style={{ animationDelay: '0.6s' }}>
              <div className="animate-bounce" style={{ animationDelay: '1s' }}>
                <Award className="h-10 w-10 text-pink-500" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 translate-x-full animate-[shimmer_2s_infinite_1s]" />
            </div>
          </div>
          
          <div className="flex flex-col items-center space-y-2">
            <div className="text-sm text-muted-foreground font-medium animate-pulse">
              {messages[currentMessage]}
            </div>
            {/* Paw print trail */}
            <div className="flex space-x-2 mt-2">
              {[0, 1, 2, 3].map((i) => (
                <PawPrint
                  key={i}
                  className={`h-4 w-4 transition-opacity duration-300 ${
                    i <= pawStep ? 'opacity-100 text-primary' : 'opacity-30 text-muted-foreground'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'wizard') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-card rounded-lg p-6 shadow-xl border border-border max-w-sm w-full mx-4">
          <div className="flex flex-col items-center space-y-4">
            {/* Magical spinning wand */}
            <div className="relative">
              <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-full flex items-center justify-center animate-spin">
                <Wand2 className="h-6 w-6 text-primary" />
              </div>
              {/* Sparkles around the wand */}
              <div className="absolute -top-2 -right-2 animate-pulse">
                <Sparkles className="h-4 w-4 text-yellow-400" />
              </div>
              <div className="absolute -bottom-2 -left-2 animate-pulse" style={{ animationDelay: '0.5s' }}>
                <Sparkles className="h-4 w-4 text-pink-400" />
              </div>
              <div className="absolute top-0 -left-3 animate-pulse" style={{ animationDelay: '1s' }}>
                <Sparkles className="h-4 w-4 text-purple-400" />
              </div>
            </div>
            
            <div className="text-center">
              <div className="text-sm text-card-foreground font-medium mb-2">
                {messages[currentMessage]}
              </div>
              
              {/* Magic progress bar */}
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-secondary animate-pulse rounded-full w-2/3" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default loading
  return (
    <div className={`flex justify-center items-center p-8 ${className}`}>
      <div className="flex flex-col items-center space-y-4">
        {/* Bouncing dog animation */}
        <div className="relative">
          <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center animate-bounce">
            <Dog className="h-6 w-6 text-primary" />
          </div>
          {/* Tail wagging effect */}
          <div className="absolute -right-1 top-2 animate-pulse">
            <Waves className="h-3 w-3 text-primary/60" />
          </div>
        </div>
        
        <div className="text-sm text-muted-foreground font-medium text-center">
          {message || messages[currentMessage]}
        </div>
        
        {/* Paw print trail */}
        <div className="flex space-x-1">
          {[0, 1, 2].map((i) => (
            <PawPrint
              key={i}
              className={`h-3 w-3 transition-all duration-300 ${
                i <= pawStep ? 'opacity-100 text-primary scale-110' : 'opacity-30 text-muted-foreground'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DelightfulLoading;