import React, { useState, useEffect } from 'react';
import { Plus, Sparkles, Heart, Calendar, PawPrint, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FABAction {
  icon: React.ReactNode;
  label: string;
  action: () => void;
  color?: string;
}

interface DelightfulFABProps {
  onCreateShow?: () => void;
  onQuickEntry?: () => void;
  onViewCalendar?: () => void;
  className?: string;
}

const DelightfulFAB: React.FC<DelightfulFABProps> = ({
  onCreateShow,
  onQuickEntry,
  onViewCalendar,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showSparkles, setShowSparkles] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Show sparkles animation periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setShowSparkles(true);
      setTimeout(() => setShowSparkles(false), 2000);
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  const actions: FABAction[] = [
    {
      icon: <Calendar className="w-4 h-4" />,
      label: "Create Show",
      action: () => {
        onCreateShow?.();
        setIsOpen(false);
      },
      color: "bg-blue-500 hover:bg-blue-600"
    },
    {
      icon: <PawPrint className="w-4 h-4" />,
      label: "Quick Entry",
      action: () => {
        onQuickEntry?.();
        setIsOpen(false);
      },
      color: "bg-green-500 hover:bg-green-600"
    },
    {
      icon: <Heart className="w-4 h-4" />,
      label: "View Calendar",
      action: () => {
        onViewCalendar?.();
        setIsOpen(false);
      },
      color: "bg-pink-500 hover:bg-pink-600"
    }
  ];

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className={`fixed bottom-20 right-6 z-40 ${className}`}>
      {/* Action buttons */}
      <div className={`
        flex flex-col-reverse gap-3 mb-3 transition-all duration-300 ease-out
        ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}
      `}>
        {actions.map((action, index) => (
          <div
            key={index}
            className={`
              flex items-center gap-3 transition-all duration-300 ease-out
              ${isOpen ? 'translate-x-0' : 'translate-x-8'}
            `}
            style={{ transitionDelay: `${index * 50}ms` }}
          >
            {/* Label */}
            <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm">
              <span className="text-sm font-medium text-card-foreground whitespace-nowrap">
                {action.label}
              </span>
            </div>
            
            {/* Action button */}
            <Button
              size="icon"
              onClick={action.action}
              className={`
                ${action.color} text-white shadow-lg hover:shadow-xl 
                transition-all duration-300 hover:scale-110 rounded-full
                w-12 h-12
              `}
            >
              {action.icon}
            </Button>
          </div>
        ))}
      </div>

      {/* Main FAB */}
      <div className="relative">
        {/* Sparkles animation */}
        {(showSparkles || isHovered) && (
          <div className="absolute inset-0 pointer-events-none">
            <Sparkles className="absolute -top-2 -right-2 w-4 h-4 text-yellow-400 animate-pulse" />
            <Sparkles className="absolute -bottom-2 -left-2 w-3 h-3 text-pink-400 animate-pulse" style={{ animationDelay: '0.5s' }} />
            <Sparkles className="absolute -top-2 -left-2 w-3 h-3 text-purple-400 animate-pulse" style={{ animationDelay: '1s' }} />
          </div>
        )}

        {/* Pulsing ring effect */}
        <div className={`
          absolute inset-0 rounded-full bg-gradient-to-r from-primary to-secondary
          transition-all duration-1000 ease-out
          ${isHovered ? 'scale-150 opacity-20' : 'scale-100 opacity-0'}
        `} />

        <Button
          size="icon"
          onClick={toggleOpen}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`
            bg-gradient-to-r from-primary to-secondary text-primary-foreground 
            shadow-lg hover:shadow-xl transition-all duration-300 
            hover:scale-110 rounded-full w-14 h-14 relative z-10
            ${isOpen ? 'rotate-45' : 'rotate-0'}
          `}
          title={isOpen ? "Close menu" : "Quick actions"}
        >
          <div className="relative">
            {isOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Plus className={`w-6 h-6 transition-transform duration-300 ${isHovered ? 'rotate-90' : ''}`} />
            )}
          </div>
        </Button>

        {/* Cute dog emoji that appears on hover */}
        {isHovered && !isOpen && (
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-2xl animate-bounce pointer-events-none">
            🐕
          </div>
        )}

        {/* Fun paw print trail */}
        {isOpen && (
          <div className="absolute -bottom-4 -left-4 text-lg opacity-40 animate-bounce pointer-events-none">
            🐾
          </div>
        )}
      </div>
    </div>
  );
};

export default DelightfulFAB;