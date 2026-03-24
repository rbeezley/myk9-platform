import React, { useEffect, useState, useMemo } from 'react';
import {
  Sparkles,
  Heart,
  Star,
  PartyPopper,
  Trophy,
  Dog,
  PawPrint,
  Award,
  Gem,
} from 'lucide-react';

// Separate component for confetti to keep random positions stable during rerenders
const ConfettiExplosion: React.FC<{ confetti: React.ReactNode[] }> = ({ confetti }) => {
  // Pre-compute positions once per mount to avoid Math.random() during render
  const positions = useMemo(
    () =>
      confetti.map((_, index) => ({
        // Use deterministic pattern based on index
        top: (index * 37 + 13) % 100,
        left: (index * 53 + 7) % 100,
      })),
    [confetti]
  );

  return (
    <div className="absolute inset-0 pointer-events-none">
      {confetti.map((icon, index) => (
        <div
          key={index}
          className="absolute animate-bounce"
          style={{
            top: `${positions[index].top}%`,
            left: `${positions[index].left}%`,
            animationDelay: `${index * 0.2}s`,
            animationDuration: '2s',
          }}
        >
          {icon}
        </div>
      ))}
    </div>
  );
};

interface FirstTimeDelightProps {
  trigger: 'signup' | 'first-show' | 'first-entry' | 'profile-complete';
  userName?: string;
  onComplete?: () => void;
}

const FirstTimeDelight: React.FC<FirstTimeDelightProps> = ({ trigger, userName, onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [animationPhase, setAnimationPhase] = useState(0);

  useEffect(() => {
    // Animation sequence
    const timers = [
      setTimeout(() => setAnimationPhase(1), 500), // Show main content
      setTimeout(() => setAnimationPhase(2), 2000), // Show celebration
      setTimeout(() => setAnimationPhase(3), 4000), // Start fade out
      setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, 5000), // Complete
    ];

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  const getDelightConfig = () => {
    switch (trigger) {
      case 'signup':
        return {
          title: `Welcome to the pack, ${userName || 'new friend'}!`,
          message:
            "You've just joined a community of amazing dog lovers. Let's get started on your show journey!",
          icon: <PartyPopper className="h-16 w-16 text-white" />,
          bgGradient: 'from-primary to-primary',
          confetti: [
            <Dog key="dog" className="h-8 w-8 text-white" />,
            <Trophy key="trophy" className="h-8 w-8 text-yellow-300" />,
            <Award key="award" className="h-8 w-8 text-pink-300" />,
            <Star key="star" className="h-8 w-8 text-yellow-300" />,
            <Heart key="heart" className="h-8 w-8 text-blue-300" />,
          ],
        };
      case 'first-show':
        return {
          title: 'Your first show is created!',
          message:
            "Woof woof! You're officially a show organizer. Time to make some tails wag with excitement!",
          icon: <Trophy className="h-16 w-16 text-white" />,
          bgGradient: 'from-yellow-400 to-orange-500',
          confetti: [
            <Trophy key="trophy1" className="h-8 w-8 text-yellow-300" />,
            <Award key="award1" className="h-8 w-8 text-yellow-200" />,
            <Star key="star1" className="h-8 w-8 text-yellow-300" />,
            <Award key="award2" className="h-8 w-8 text-orange-300" />,
            <Star key="star2" className="h-8 w-8 text-white" />,
          ],
        };
      case 'first-entry':
        return {
          title: 'First entry submitted!',
          message: 'Your pup is registered and ready to show off! Good luck in the ring!',
          icon: <Dog className="h-16 w-16 text-white" />,
          bgGradient: 'from-green-400 to-emerald-500',
          confetti: [
            <Dog key="dog" className="h-8 w-8 text-white" />,
            <PawPrint key="paw" className="h-8 w-8 text-white" />,
            <Heart key="heart" className="h-8 w-8 text-red-300" />,
            <Award key="award" className="h-8 w-8 text-pink-300" />,
            <Sparkles key="sparkle" className="h-8 w-8 text-yellow-200" />,
          ],
        };
      case 'profile-complete':
        return {
          title: 'Profile looking pawsome!',
          message:
            "Your profile is complete and looking great. You're ready to explore everything myK9Show has to offer!",
          icon: <Star className="h-16 w-16 text-white" />,
          bgGradient: 'from-pink-400 to-purple-500',
          confetti: [
            <Star key="star1" className="h-8 w-8 text-yellow-300" />,
            <Sparkles key="sparkle1" className="h-8 w-8 text-white" />,
            <Star key="star2" className="h-8 w-8 text-pink-200" />,
            <Sparkles key="sparkle2" className="h-8 w-8 text-yellow-200" />,
            <Gem key="gem" className="h-8 w-8 text-blue-300" />,
          ],
        };
      default:
        return {
          title: 'Pawsome achievement!',
          message: "You're doing great! Keep up the amazing work with your furry friends.",
          icon: <PartyPopper className="h-16 w-16 text-white" />,
          bgGradient: 'from-primary to-primary',
          confetti: [
            <PartyPopper key="party1" className="h-8 w-8 text-yellow-300" />,
            <PartyPopper key="party2" className="h-8 w-8 text-pink-300" />,
            <Sparkles key="sparkle1" className="h-8 w-8 text-white" />,
            <Star key="star" className="h-8 w-8 text-yellow-200" />,
            <Sparkles key="sparkle2" className="h-8 w-8 text-pink-200" />,
          ],
        };
    }
  };

  const config = getDelightConfig();

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative max-w-md mx-4">
        {/* Confetti explosion */}
        {animationPhase >= 2 && <ConfettiExplosion confetti={config.confetti} />}

        {/* Main card */}
        <div
          className={`
          bg-gradient-to-br ${config.bgGradient} p-8 rounded-2xl shadow-2xl
          transform transition-all duration-1000 ease-out
          ${animationPhase >= 1 ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}
          ${animationPhase >= 3 ? 'scale-110 opacity-0' : ''}
        `}
        >
          {/* Sparkles decoration */}
          <div className="absolute -top-4 -right-4">
            <Sparkles
              className="w-8 h-8 text-white/60 animate-spin"
              style={{ animationDuration: '3s' }}
            />
          </div>
          <div className="absolute -bottom-4 -left-4">
            <Star className="w-6 h-6 text-white/40 animate-pulse" />
          </div>

          <div className="text-center text-white">
            {/* Big celebratory icon */}
            <div
              className="mb-4 animate-bounce flex justify-center"
              style={{ animationDuration: '1.5s' }}
            >
              {config.icon}
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold mb-4 drop-shadow-lg">{config.title}</h2>

            {/* Message */}
            <p className="text-white/90 text-lg leading-relaxed mb-6 drop-shadow">
              {config.message}
            </p>

            {/* Paw prints decoration */}
            <div className="flex justify-center space-x-4 text-white/60">
              <PawPrint className="w-5 h-5 animate-pulse" />
              <Heart className="w-5 h-5 animate-pulse" style={{ animationDelay: '0.5s' }} />
              <PawPrint className="w-5 h-5 animate-pulse" style={{ animationDelay: '1s' }} />
            </div>
          </div>

          {/* Floating hearts */}
          {animationPhase >= 2 && (
            <>
              <div className="absolute top-4 left-4 text-pink-300 animate-float">
                <Heart className="w-4 h-4" />
              </div>
              <div
                className="absolute top-8 right-8 text-pink-200 animate-float"
                style={{ animationDelay: '1s' }}
              >
                <Heart className="w-3 h-3" />
              </div>
              <div
                className="absolute bottom-8 left-8 text-pink-300 animate-float"
                style={{ animationDelay: '2s' }}
              >
                <Heart className="w-5 h-5" />
              </div>
            </>
          )}
        </div>

        {/* Progress indicator */}
        <div className="mt-4 flex justify-center space-x-2">
          {[0, 1, 2, 3].map(phase => (
            <div
              key={phase}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                animationPhase >= phase ? 'bg-card' : 'bg-card/30'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default FirstTimeDelight;
