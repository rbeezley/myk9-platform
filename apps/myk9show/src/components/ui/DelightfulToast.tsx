import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle, X, Sparkles, Heart, Trophy, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DelightfulToastProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  type?: 'success' | 'celebration' | 'achievement' | 'info';
  duration?: number;
  showConfetti?: boolean;
}

const DelightfulToast: React.FC<DelightfulToastProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'success',
  duration = 4000,
  showConfetti = false
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [showSparkles, setShowSparkles] = useState(false);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 300);
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setShowSparkles(true);
      
      // Auto-close after duration
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      // Hide sparkles after animation
      const sparkleTimer = setTimeout(() => {
        setShowSparkles(false);
      }, 2000);

      return () => {
        clearTimeout(timer);
        clearTimeout(sparkleTimer);
      };
    }
  }, [isOpen, duration, handleClose]);

  const getTypeConfig = () => {
    switch (type) {
      case 'celebration':
        return {
          icon: <Trophy className="w-5 h-5 text-yellow-500" />,
          bgColor: 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200',
          emoji: '🎉',
          sparkleColor: 'text-yellow-400'
        };
      case 'achievement':
        return {
          icon: <Star className="w-5 h-5 text-purple-500" />,
          bgColor: 'bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200',
          emoji: '🏆',
          sparkleColor: 'text-purple-400'
        };
      case 'info':
        return {
          icon: <Heart className="w-5 h-5 text-blue-500" />,
          bgColor: 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200',
          emoji: '💙',
          sparkleColor: 'text-blue-400'
        };
      default: // success
        return {
          icon: <CheckCircle className="w-5 h-5 text-green-500" />,
          bgColor: 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200',
          emoji: '✅',
          sparkleColor: 'text-green-400'
        };
    }
  };

  const config = getTypeConfig();

  if (!isOpen) return null;

  return (
    <div className="fixed top-4 right-4 z-50">
      <div
        className={`
          transform transition-all duration-300 ease-out
          ${isVisible ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-full opacity-0 scale-95'}
        `}
      >
        <div className={`
          ${config.bgColor} border rounded-lg shadow-lg p-4 max-w-sm w-full
          backdrop-blur-sm relative overflow-hidden
        `}>
          {/* Confetti effect */}
          {showConfetti && showSparkles && (
            <div className="absolute inset-0 pointer-events-none">
              <Sparkles className={`absolute top-2 right-2 w-3 h-3 ${config.sparkleColor} animate-pulse`} />
              <Sparkles className={`absolute top-4 left-3 w-2 h-2 ${config.sparkleColor} animate-pulse`} style={{ animationDelay: '0.3s' }} />
              <Sparkles className={`absolute bottom-3 right-6 w-2 h-2 ${config.sparkleColor} animate-pulse`} style={{ animationDelay: '0.6s' }} />
            </div>
          )}

          <div className="flex items-start gap-3">
            {/* Icon and emoji */}
            <div className="flex items-center gap-2 mt-0.5">
              {config.icon}
              <span className="text-lg animate-bounce" style={{ animationDuration: '1s' }}>
                {config.emoji}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 mb-1">
                {title}
              </p>
              {message && (
                <p className="text-sm text-gray-600">
                  {message}
                </p>
              )}
            </div>

            {/* Close button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/5 rounded-b-lg overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300 ease-linear"
              style={{
                width: isVisible ? '0%' : '100%',
                transitionDuration: `${duration}ms`
              }}
            />
          </div>

          {/* Floating paw prints */}
          {type === 'success' && showSparkles && (
            <div className="absolute -top-6 -right-2 text-primary/30 text-xs animate-bounce pointer-events-none">
              🐾
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DelightfulToast;